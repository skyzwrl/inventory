import type { ItemDefinition, ItemRegistry } from "./item-registry";
import { makeSlot, SlotStore } from "./slot-store";
import { ABORT, OpenTransaction, Transaction } from "./transaction";
import type { ChangedListener, MoveResult, SerializedInventory, SerializedSlot, Slot } from "./types";
import { assertItem, assertQuantity, assertSlotIndex, isPositiveInteger, isSlotIndex } from "./validation";

const FORMAT_VERSION = 1;

interface Listener {
	readonly callback: ChangedListener;
	connected: boolean;
}

export interface LoadResult<T extends ItemDefinition> {
	readonly inventory: Inventory<T>;
	readonly problems: string[];
}

export class Inventory<T extends ItemDefinition = ItemDefinition> {
	private readonly store: SlotStore<T>;
	private readonly listeners = new Array<Listener>();
	private open?: OpenTransaction<T>;

	public constructor(
		private readonly registry: ItemRegistry<T>,
		capacity: number,
	) {
		if (!isPositiveInteger(capacity)) {
			// 3 skips the compiled .new wrapper so the error lands on the caller
			error(`Capacity must be a positive integer, got ${capacity}`, 3);
		}
		this.store = new SlotStore(registry, capacity);
	}

	// saved data is untrusted: entries that can't be loaded are dropped, stacks over the limit are clamped,
	// and every problem is described so it can be logged
	public static deserialize<T extends ItemDefinition>(
		registry: ItemRegistry<T>,
		capacity: number,
		data: unknown,
	): LoadResult<T> {
		if (!isPositiveInteger(capacity)) {
			error(`Capacity must be a positive integer, got ${capacity}`, 2);
		}

		const inventory = new Inventory(registry, capacity);
		const slots = inventory.store.slots;
		const problems = new Array<string>();

		if (!typeIs(data, "table")) {
			problems.push(`Expected a table, got ${typeOf(data)}`);
			return { inventory, problems };
		}

		const record = data as { version?: unknown; slots?: unknown };
		if (record.version !== FORMAT_VERSION) {
			problems.push(`Unsupported format version ${record.version}`);
			return { inventory, problems };
		} else if (!typeIs(record.slots, "table")) {
			problems.push(`Expected a list of slots, got ${typeOf(record.slots)}`);
			return { inventory, problems };
		}

		// walked as a raw table so holes and stray keys get reported instead of skipped
		for (const [key, entry] of record.slots as Map<unknown, unknown>) {
			const label = typeIs(key, "number") ? `Entry ${key - 1}` : `Entry ${key}`;
			if (!typeIs(entry, "table")) {
				problems.push(`${label} is not a table`);
				continue;
			}

			const { index, id, quantity } = entry as { index?: unknown; id?: unknown; quantity?: unknown };
			if (!isSlotIndex(index, capacity)) {
				problems.push(`${label} has slot index ${index}, outside 0-${capacity - 1}`);
			} else if (slots.has(index)) {
				problems.push(`Slot ${index} appears more than once; kept the first entry`);
			} else if (!typeIs(id, "string") || !registry.has(id)) {
				problems.push(`Slot ${index} holds unknown item ${id}; dropped`);
			} else if (!isPositiveInteger(quantity)) {
				problems.push(`Slot ${index} has invalid quantity ${quantity} of "${id}"; dropped`);
			} else {
				const maxStack = registry.getMaxStack(id);
				if (quantity > maxStack) {
					problems.push(
						`Slot ${index} holds ${quantity} "${id}", above the max stack of ${maxStack}; clamped`,
					);
				}
				slots.set(index, makeSlot(id, math.min(quantity, maxStack)));
			}
		}

		return { inventory, problems };
	}

	public getCapacity(): number {
		return this.store.capacity;
	}

	public getSlot(index: number): Slot<T["id"]> | undefined {
		assertSlotIndex(index, this.store.capacity);
		return this.store.slots.get(index);
	}

	public getSlots(): ReadonlyMap<number, Slot<T["id"]>> {
		return table.clone(this.store.slots);
	}

	public count(id: T["id"]): number {
		assertItem(this.registry, id);
		return this.store.count(id);
	}

	public canAdd(id: T["id"], quantity: number): boolean {
		const maxStack = assertItem(this.registry, id);
		assertQuantity(quantity);
		return this.store.space(id, maxStack) >= quantity;
	}

	public add(id: T["id"], quantity: number): number {
		this.assertUnlocked();
		const maxStack = assertItem(this.registry, id);
		assertQuantity(quantity);

		const added = this.store.add(id, quantity, maxStack);
		this.commit();
		return added;
	}

	public remove(id: T["id"], quantity: number): boolean {
		this.assertUnlocked();
		assertItem(this.registry, id);
		assertQuantity(quantity);

		const removed = this.store.remove(id, quantity);
		this.commit();
		return removed;
	}

	public move(from: number, to: number, quantity?: number): MoveResult {
		this.assertUnlocked();
		assertSlotIndex(from, this.store.capacity);
		assertSlotIndex(to, this.store.capacity);
		if (quantity !== undefined) {
			assertQuantity(quantity);
		}

		const result = this.store.move(from, to, quantity);
		this.commit();
		return result;
	}

	public clear(): void {
		this.assertUnlocked();
		this.store.clear();
		this.commit();
	}

	// changes made through the transaction apply right away so the callback can read its own work. abort()
	// or an error rolls all of it back; otherwise one change event goes out for the whole batch
	public transaction(callback: (transaction: Transaction<T["id"]>) => void): boolean {
		if (this.open !== undefined) {
			error("Transactions cannot be nested", 2);
		}

		const transaction = new OpenTransaction(this.registry, this.store);
		this.open = transaction;
		const [ok, err] = pcall(callback, transaction);
		transaction.active = false;
		this.open = undefined;

		if (ok && !transaction.aborted) {
			this.commit();
			return true;
		}

		this.store.rollback();
		if (!ok && err !== ABORT) {
			// level 0 rethrows the original value without stacking another position on a string error
			error(err, 0);
		}
		return false;
	}

	public onChanged(callback: ChangedListener): () => void {
		const listener: Listener = { callback, connected: true };
		this.listeners.push(listener);

		return () => {
			if (!listener.connected) {
				return;
			}
			listener.connected = false;
			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				this.listeners.remove(index);
			}
		};
	}

	// called mid transaction this describes the inventory as it was before the transaction began, so an
	// autosave that lands in the middle stores the last committed state
	public serialize(): SerializedInventory {
		const store = this.store;
		const slots = new Array<SerializedSlot>();
		for (let index = 0; index < store.capacity; index++) {
			const slot = store.committed(index);
			if (slot !== undefined) {
				slots.push({ index, id: slot.id, quantity: slot.quantity });
			}
		}
		return { version: FORMAT_VERSION, slots };
	}

	private commit(): void {
		const changed = this.store.commit();
		if (changed.isEmpty()) {
			return;
		}

		// every listener gets the same frozen list, each on its own thread so one that errors or yields
		// can't hold up the others or the code that made the change
		table.freeze(changed);
		for (const listener of table.clone(this.listeners)) {
			if (listener.connected) {
				task.spawn(listener.callback, changed);
			}
		}
	}

	// without this a change could slip past the journal: if a callback yielded and another script added
	// items meanwhile, rolling back would silently delete them
	private assertUnlocked(): void {
		if (this.open !== undefined) {
			error("Inventory is locked by an open transaction; make changes through the transaction instead", 3);
		}
	}
}
