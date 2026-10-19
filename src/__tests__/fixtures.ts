import { Inventory, ItemDefinition, MoveResult } from "..";

export function contents<T extends ItemDefinition>(inventory: Inventory<T>): string {
	const parts = new Array<string>();
	for (let index = 0; index < inventory.getCapacity(); index++) {
		const slot = inventory.getSlot(index);
		if (slot !== undefined) {
			parts.push(`${index}:${slot.id} x${slot.quantity}`);
		}
	}
	return parts.join(", ");
}

export function outcome(result: MoveResult): string {
	return result.success ? `${result.kind} ${result.quantity}` : result.reason;
}

export function recordChanges<T extends ItemDefinition>(inventory: Inventory<T>) {
	const events = new Array<string>();
	const disconnect = inventory.onChanged((changedSlots) => events.push(changedSlots.join(",")));
	return { events, disconnect };
}
