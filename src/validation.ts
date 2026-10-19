import type { ItemDefinition, ItemRegistry } from "./item-registry";

// % 1 rather than math.floor(value) === value: math.huge floors to itself but math.huge % 1 is nan,
// so infinity is rejected along with nan
export function isPositiveInteger(value: unknown): value is number {
	return typeIs(value, "number") && value >= 1 && value % 1 === 0;
}

export function isSlotIndex(value: unknown, capacity: number): value is number {
	return typeIs(value, "number") && value >= 0 && value < capacity && value % 1 === 0;
}

// the asserts raise at level 3, the code that called the public method, which is where the bad value came from

export function assertQuantity(quantity: number): void {
	if (!isPositiveInteger(quantity)) {
		error(`Quantity must be a positive integer, got ${quantity}`, 3);
	}
}

export function assertSlotIndex(index: number, capacity: number): void {
	if (!isSlotIndex(index, capacity)) {
		error(`Slot index must be an integer from 0 to ${capacity - 1}, got ${index}`, 3);
	}
}

export function assertItem<T extends ItemDefinition>(registry: ItemRegistry<T>, id: T["id"]): number {
	if (!registry.has(id)) {
		error(`Item "${id}" is not registered`, 3);
	}
	return registry.getMaxStack(id);
}
