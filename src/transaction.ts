import type { ItemDefinition, ItemRegistry } from "./item-registry";
import type { SlotStore } from "./slot-store";
import type { MoveResult } from "./types";
import { assertItem, assertQuantity, assertSlotIndex } from "./validation";

export interface Transaction<Id extends string = string> {
	add(id: Id, quantity: number): number;
	remove(id: Id, quantity: number): boolean;
	move(from: number, to: number, quantity?: number): MoveResult;
	abort(): never;
}

// thrown by abort() to unwind the callback. the __tostring keeps it readable if the callback catches it
// with its own pcall and prints it
export const ABORT = setmetatable(
	{},
	{
		__tostring: () => "inventory transaction aborted",
	},
);

export class OpenTransaction<T extends ItemDefinition> implements Transaction<T["id"]> {
	public active = true;
	public aborted = false;

	public constructor(
		private readonly registry: ItemRegistry<T>,
		private readonly store: SlotStore<T>,
	) {}

	public add(id: T["id"], quantity: number): number {
		this.assertActive();
		const maxStack = assertItem(this.registry, id);
		assertQuantity(quantity);
		return this.store.add(id, quantity, maxStack);
	}

	public remove(id: T["id"], quantity: number): boolean {
		this.assertActive();
		assertItem(this.registry, id);
		assertQuantity(quantity);
		return this.store.remove(id, quantity);
	}

	public move(from: number, to: number, quantity?: number): MoveResult {
		this.assertActive();
		assertSlotIndex(from, this.store.capacity);
		assertSlotIndex(to, this.store.capacity);
		if (quantity !== undefined) {
			assertQuantity(quantity);
		}
		return this.store.move(from, to, quantity);
	}

	public abort(): never {
		this.assertActive();
		// marked before throwing, so a callback that swallows the abort with its own pcall still rolls back
		this.active = false;
		this.aborted = true;
		error(ABORT);
	}

	private assertActive(): void {
		if (!this.active) {
			error("Transaction is no longer active", 3);
		}
	}
}
