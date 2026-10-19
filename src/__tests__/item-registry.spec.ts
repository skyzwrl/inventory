/// <reference types="@rbxts/testez/globals" />

import { ItemDefinition, ItemRegistry } from "..";

export = () => {
	describe("ItemRegistry", () => {
		it("registers definitions passed to the constructor", () => {
			const registry = new ItemRegistry([
				{ id: "wood", maxStack: 64 },
				{ id: "sword", maxStack: 1 },
			]);

			expect(registry.has("wood")).to.equal(true);
			expect(registry.has("sword")).to.equal(true);
			expect(registry.has("stone")).to.equal(false);
			expect(registry.getMaxStack("wood")).to.equal(64);
			expect(registry.getMaxStack("sword")).to.equal(1);
		});

		it("registers definitions added later", () => {
			const registry = new ItemRegistry();
			registry.register({ id: "stone", maxStack: 32 });

			expect(registry.has("stone")).to.equal(true);
			expect(registry.getMaxStack("stone")).to.equal(32);
		});

		it("returns the registered definition, extra fields included", () => {
			const sword = { id: "sword", maxStack: 1, damage: 12 };
			const registry = new ItemRegistry([sword]);

			expect(registry.get("sword")).to.equal(sword);
			expect(registry.get("sword")!.damage).to.equal(12);
			expect(registry.get("missing")).never.to.be.ok();
		});

		it("keeps the stack limit recorded at registration", () => {
			const wood = { id: "wood", maxStack: 64 };
			const registry = new ItemRegistry([wood]);
			wood.maxStack = 1000;

			expect(registry.getMaxStack("wood")).to.equal(64);
		});

		it("rejects duplicate ids", () => {
			const registry = new ItemRegistry([{ id: "wood", maxStack: 64 }]);

			expect(() => registry.register({ id: "wood", maxStack: 10 })).to.throw('Item "wood" is already registered');
			expect(registry.getMaxStack("wood")).to.equal(64);
			expect(
				() =>
					new ItemRegistry([
						{ id: "wood", maxStack: 64 },
						{ id: "wood", maxStack: 64 },
					]),
			).to.throw('Item "wood" is already registered');
		});

		it("rejects malformed definitions", () => {
			const registry = new ItemRegistry();
			const cases: [definition: unknown, message: string][] = [
				["wood", "Item definition must be a table, got string"],
				[{ maxStack: 1 }, "Item id must be a non-empty string"],
				[{ id: "", maxStack: 1 }, "Item id must be a non-empty string"],
				[{ id: 5, maxStack: 1 }, "Item id must be a non-empty string"],
				[{ id: "gem" }, 'Item "gem" has an invalid maxStack (nil)'],
				[{ id: "gem", maxStack: 0 }, 'Item "gem" has an invalid maxStack (0)'],
				[{ id: "gem", maxStack: -3 }, 'Item "gem" has an invalid maxStack (-3)'],
				[{ id: "gem", maxStack: 1.5 }, 'Item "gem" has an invalid maxStack (1.5)'],
				[{ id: "gem", maxStack: 0 / 0 }, "invalid maxStack"],
				[{ id: "gem", maxStack: math.huge }, "invalid maxStack"],
				[{ id: "gem", maxStack: "8" }, 'Item "gem" has an invalid maxStack (8)'],
			];

			for (const [definition, message] of cases) {
				expect(() => registry.register(definition as ItemDefinition)).to.throw(message);
			}
			expect(registry.has("gem")).to.equal(false);
		});

		it("errors when asked for the stack limit of an unknown item", () => {
			const registry = new ItemRegistry();

			expect(() => registry.getMaxStack("stone")).to.throw('Item "stone" is not registered');
		});
	});
};
