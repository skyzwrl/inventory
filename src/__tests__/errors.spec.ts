/// <reference types="@rbxts/testez/globals" />

import { Inventory, ItemRegistry } from "..";

const registry = new ItemRegistry([{ id: "wood", maxStack: 64 }]);

export = () => {
	describe("argument errors", () => {
		// the position in the message should be this file, where the bad value was passed, not the library
		it("point at the code that passed the bad value", () => {
			const inventory = new Inventory(registry, 4);

			expect(() => inventory.add("wood", 0)).to.throw("errors.spec:");
			expect(() => inventory.count("gold")).to.throw("errors.spec:");
			expect(() => inventory.move(0, 9)).to.throw("errors.spec:");
			expect(() => inventory.getSlot(-1)).to.throw("errors.spec:");
			expect(() => new Inventory(registry, -1)).to.throw("errors.spec:");
			expect(() => Inventory.deserialize(registry, 0, undefined)).to.throw("errors.spec:");
			expect(() => new ItemRegistry([{ id: "", maxStack: 1 }])).to.throw("errors.spec:");
			expect(() => registry.register({ id: "wood", maxStack: 1 })).to.throw("errors.spec:");
			expect(() => registry.getMaxStack("gold")).to.throw("errors.spec:");
			expect(() => inventory.transaction((transaction) => transaction.remove("wood", -1))).to.throw(
				"errors.spec:",
			);
			expect(() => inventory.transaction(() => inventory.clear())).to.throw("errors.spec:");
		});
	});
};
