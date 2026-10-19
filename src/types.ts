export interface Slot<Id extends string = string> {
	readonly id: Id;
	readonly quantity: number;
}

export type MoveResult =
	| { readonly success: true; readonly kind: "move" | "split" | "merge" | "swap"; readonly quantity: number }
	| {
			readonly success: false;
			readonly reason: "SameSlot" | "EmptySlot" | "NotEnough" | "TargetFull" | "DifferentItem";
	  };

export type ChangedListener = (changedSlots: ReadonlyArray<number>) => void;

export interface SerializedSlot {
	readonly index: number;
	readonly id: string;
	readonly quantity: number;
}

export interface SerializedInventory {
	readonly version: number;
	readonly slots: ReadonlyArray<SerializedSlot>;
}
