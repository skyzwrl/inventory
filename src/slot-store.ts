import type { ItemDefinition, ItemRegistry } from "./item-registry";
import type { MoveResult, Slot } from "./types";

export function makeSlot<Id extends string>(id: Id, quantity: number): Slot<Id> {
	return table.freeze({ id, quantity });
}

function sameContents(a: Slot | undefined, b: Slot | undefined): boolean {
	if (a !== undefined && b !== undefined) {
		return a.id === b.id && a.quantity === b.quantity;
	}
	return a === b;
}

export class SlotStore<T extends ItemDefinition> {
	public readonly slots = new Map<number, Slot<T["id"]>>();
	// contents before the first write of the current batch, false for a slot that started out empty
	private readonly journal = new Map<number, Slot<T["id"]> | false>();

	public constructor(
		public readonly registry: ItemRegistry<T>,
		public readonly capacity: number,
	) {}

	// every write goes through here. records are frozen and never mutated, so journaling the previous
	// record by reference is enough to undo the write
	public write(index: number, slot: Slot<T["id"]> | undefined): void {
		const journal = this.journal;
		if (!journal.has(index)) {
			journal.set(index, this.slots.get(index) ?? false);
		}
		if (slot === undefined) {
			this.slots.delete(index);
		} else {
			this.slots.set(index, slot);
		}
	}

	// sorted indices whose contents differ from before the batch. a slot touched five times is listed
	// once, and one that ended up where it started isn't listed at all
	public commit(): number[] {
		const changed = new Array<number>();
		for (const [index, previous] of this.journal) {
			if (!sameContents(previous === false ? undefined : previous, this.slots.get(index))) {
				changed.push(index);
			}
		}
		this.journal.clear();
		changed.sort();
		return changed;
	}

	public rollback(): void {
		for (const [index, previous] of this.journal) {
			if (previous === false) {
				this.slots.delete(index);
			} else {
				this.slots.set(index, previous);
			}
		}
		this.journal.clear();
	}

	// what the slot held at the last commit, ignoring any open transaction
	public committed(index: number): Slot<T["id"]> | undefined {
		const previous = this.journal.get(index);
		if (previous === undefined) {
			return this.slots.get(index);
		}
		return previous === false ? undefined : previous;
	}

	public count(id: T["id"]): number {
		let total = 0;
		for (let index = 0; index < this.capacity; index++) {
			const slot = this.slots.get(index);
			if (slot !== undefined && slot.id === id) {
				total += slot.quantity;
			}
		}
		return total;
	}

	public space(id: T["id"], maxStack: number): number {
		let space = 0;
		for (let index = 0; index < this.capacity; index++) {
			const slot = this.slots.get(index);
			if (slot === undefined) {
				space += maxStack;
			} else if (slot.id === id) {
				space += maxStack - slot.quantity;
			}
		}
		return space;
	}

	public add(id: T["id"], quantity: number, maxStack: number): number {
		let remaining = quantity;

		// top up existing stacks before opening new ones, so a quantity never takes more slots than it needs
		for (let index = 0; index < this.capacity && remaining > 0; index++) {
			const slot = this.slots.get(index);
			if (slot !== undefined && slot.id === id && slot.quantity < maxStack) {
				const added = math.min(maxStack - slot.quantity, remaining);
				this.write(index, makeSlot(id, slot.quantity + added));
				remaining -= added;
			}
		}

		for (let index = 0; index < this.capacity && remaining > 0; index++) {
			if (!this.slots.has(index)) {
				const added = math.min(maxStack, remaining);
				this.write(index, makeSlot(id, added));
				remaining -= added;
			}
		}

		return quantity - remaining;
	}

	public remove(id: T["id"], quantity: number): boolean {
		if (this.count(id) < quantity) {
			return false;
		}

		// take from the back. add fills from the front, so this eats the newest (usually partial) stack
		// first and leaves the front slots, which games tend to bind to a hotbar, alone
		let remaining = quantity;
		for (let index = this.capacity - 1; index >= 0 && remaining > 0; index--) {
			const slot = this.slots.get(index);
			if (slot !== undefined && slot.id === id) {
				const removed = math.min(slot.quantity, remaining);
				this.write(index, removed === slot.quantity ? undefined : makeSlot(id, slot.quantity - removed));
				remaining -= removed;
			}
		}
		return true;
	}

	public move(from: number, to: number, quantity: number | undefined): MoveResult {
		if (from === to) {
			return { success: false, reason: "SameSlot" };
		}

		const source = this.slots.get(from);
		if (source === undefined) {
			return { success: false, reason: "EmptySlot" };
		}

		let amount = quantity ?? source.quantity;
		if (amount > source.quantity) {
			return { success: false, reason: "NotEnough" };
		}

		const target = this.slots.get(to);
		let kind: "move" | "split" | "merge";
		if (target === undefined) {
			this.write(to, amount === source.quantity ? source : makeSlot(source.id, amount));
			kind = amount === source.quantity ? "move" : "split";
		} else if (target.id === source.id) {
			amount = math.min(amount, this.registry.getMaxStack(source.id) - target.quantity);
			if (amount === 0) {
				return { success: false, reason: "TargetFull" };
			}
			this.write(to, makeSlot(target.id, target.quantity + amount));
			kind = "merge";
		} else if (amount === source.quantity) {
			this.write(to, source);
			this.write(from, target);
			return { success: true, kind: "swap", quantity: amount };
		} else {
			// part of a stack can't be dropped onto a different item, there'd be nowhere for the rest to go
			return { success: false, reason: "DifferentItem" };
		}

		this.write(from, amount === source.quantity ? undefined : makeSlot(source.id, source.quantity - amount));
		return { success: true, kind, quantity: amount };
	}

	public clear(): void {
		for (let index = 0; index < this.capacity; index++) {
			if (this.slots.has(index)) {
				this.write(index, undefined);
			}
		}
	}
}
