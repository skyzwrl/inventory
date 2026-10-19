import { isPositiveInteger } from "./validation";

export interface ItemDefinition {
	readonly id: string;
	readonly maxStack: number;
}

export class ItemRegistry<T extends ItemDefinition = ItemDefinition> {
	private readonly definitions = new Map<string, T>();
	// copied at registration so editing a definition later can't leave existing stacks above their limit
	private readonly maxStacks = new Map<string, number>();

	public constructor(definitions?: ReadonlyArray<T>) {
		if (definitions !== undefined) {
			for (const definition of definitions) {
				const problem = this.problemWith(definition);
				if (problem !== undefined) {
					// 3 skips the compiled .new wrapper so the error lands on the caller
					error(problem, 3);
				}
				this.store(definition);
			}
		}
	}

	public register(definition: T): void {
		const problem = this.problemWith(definition);
		if (problem !== undefined) {
			error(problem, 2);
		}
		this.store(definition);
	}

	public get(id: string): T | undefined {
		return this.definitions.get(id);
	}

	public has(id: string): id is T["id"] {
		return this.definitions.has(id);
	}

	public getMaxStack(id: T["id"]): number {
		const maxStack = this.maxStacks.get(id);
		if (maxStack === undefined) {
			error(`Item "${id}" is not registered`, 2);
		}
		return maxStack;
	}

	private store(definition: T): void {
		this.definitions.set(definition.id, definition);
		this.maxStacks.set(definition.id, definition.maxStack);
	}

	private problemWith(definition: unknown): string | undefined {
		if (!typeIs(definition, "table")) {
			return `Item definition must be a table, got ${typeOf(definition)}`;
		}

		const { id, maxStack } = definition as { id?: unknown; maxStack?: unknown };
		if (!typeIs(id, "string") || id === "") {
			return "Item id must be a non-empty string";
		} else if (this.definitions.has(id)) {
			return `Item "${id}" is already registered`;
		} else if (!isPositiveInteger(maxStack)) {
			return `Item "${id}" has an invalid maxStack (${maxStack}); expected a positive integer`;
		}
		return undefined;
	}
}
