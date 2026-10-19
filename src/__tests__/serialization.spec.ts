/// <reference types="@rbxts/testez/globals" />

import { Inventory, ItemRegistry, SerializedInventory } from "..";
import { contents } from "./fixtures";

const registry = new ItemRegistry([
	{ id: "wood", maxStack: 64 },
	{ id: "stone", maxStack: 32 },
	{ id: "sword", maxStack: 1 },
]);

function load(data: unknown, capacity = 4) {
	return Inventory.deserialize(registry, capacity, data);
}

function entry(index: unknown, id?: unknown, quantity?: unknown) {
	return { index, id, quantity };
}

function describeSave(save: SerializedInventory): string {
	const parts = save.slots.map((slot) => `${slot.index}:${slot.id} x${slot.quantity}`);
	return `v${save.version} ${parts.join(", ")}`;
}

export = () => {
	describe("serialize", () => {
		it("lists occupied slots in index order", () => {
			const inventory = new Inventory(registry, 6);
			inventory.add("wood", 70);
			inventory.add("sword", 1);
			inventory.move(0, 4);

			expect(describeSave(inventory.serialize())).to.equal("v1 1:wood x6, 2:sword x1, 4:wood x64");
		});

		it("round trips through deserialize", () => {
			const inventory = new Inventory(registry, 6);
			inventory.add("wood", 100);
			inventory.add("stone", 3);
			inventory.move(0, 5);

			const { inventory: restored, problems } = load(inventory.serialize(), 6);

			expect(problems.size()).to.equal(0);
			expect(contents(restored)).to.equal(contents(inventory));
		});

		it("produces a gapless list of plain records, which is what a DataStore can hold", () => {
			const inventory = new Inventory(registry, 8);
			inventory.add("wood", 10);
			inventory.add("sword", 1);
			inventory.move(0, 7);

			const raw = inventory.serialize().slots as unknown as Map<unknown, Map<unknown, unknown>>;
			let entries = 0;
			for (const [key, record] of raw) {
				entries += 1;
				expect(key).to.equal(entries);
				for (const [field, value] of record) {
					const expected = field === "id" ? "string" : "number";
					expect(field === "index" || field === "id" || field === "quantity").to.equal(true);
					expect(typeOf(value)).to.equal(expected);
				}
			}
			expect(entries).to.equal(2);
		});
	});

	describe("deserialize", () => {
		it("returns an empty inventory for data that isn't a table", () => {
			const cases: [data: unknown, problem: string][] = [
				[undefined, "Expected a table, got nil"],
				["wood", "Expected a table, got string"],
				[12, "Expected a table, got number"],
			];

			for (const [data, problem] of cases) {
				const { inventory, problems } = load(data);
				expect(contents(inventory)).to.equal("");
				expect(problems.join(" | ")).to.equal(problem);
			}
		});

		it("rejects unknown format versions", () => {
			expect(load({ slots: [] }).problems.join(" | ")).to.equal("Unsupported format version nil");
			expect(load({ version: 2, slots: [entry(0, "wood", 1)] }).problems.join(" | ")).to.equal(
				"Unsupported format version 2",
			);
		});

		it("rejects a missing slot list", () => {
			const { inventory, problems } = load({ version: 1, slots: "wood" });

			expect(contents(inventory)).to.equal("");
			expect(problems.join(" | ")).to.equal("Expected a list of slots, got string");
		});

		it("drops entries that aren't tables", () => {
			const { inventory, problems } = load({ version: 1, slots: [entry(0, "wood", 5), "junk"] });

			expect(contents(inventory)).to.equal("0:wood x5");
			expect(problems.join(" | ")).to.equal("Entry 1 is not a table");
		});

		it("drops entries whose index is outside the inventory", () => {
			const { inventory, problems } = load({
				version: 1,
				slots: [entry(-1, "wood", 1), entry(4, "wood", 1), entry(1.5, "wood", 1), entry("2", "wood", 1)],
			});

			expect(contents(inventory)).to.equal("");
			expect(problems.join(" | ")).to.equal(
				[
					"Entry 0 has slot index -1, outside 0-3",
					"Entry 1 has slot index 4, outside 0-3",
					"Entry 2 has slot index 1.5, outside 0-3",
					"Entry 3 has slot index 2, outside 0-3",
				].join(" | "),
			);
		});

		it("keeps the first of two entries for the same slot", () => {
			const { inventory, problems } = load({ version: 1, slots: [entry(1, "wood", 5), entry(1, "stone", 9)] });

			expect(contents(inventory)).to.equal("1:wood x5");
			expect(problems.join(" | ")).to.equal("Slot 1 appears more than once; kept the first entry");
		});

		it("drops unknown and malformed item ids", () => {
			const { inventory, problems } = load({
				version: 1,
				slots: [entry(0, "gold", 5), entry(1, 42, 5), entry(2)],
			});

			expect(contents(inventory)).to.equal("");
			expect(problems.join(" | ")).to.equal(
				[
					"Slot 0 holds unknown item gold; dropped",
					"Slot 1 holds unknown item 42; dropped",
					"Slot 2 holds unknown item nil; dropped",
				].join(" | "),
			);
		});

		it("drops quantities that aren't positive integers", () => {
			const { inventory, problems } = load({
				version: 1,
				slots: [entry(0, "wood", 0), entry(1, "wood", -2), entry(2, "wood", 1.5), entry(3, "wood", "3")],
			});

			expect(contents(inventory)).to.equal("");
			expect(problems.join(" | ")).to.equal(
				[
					'Slot 0 has invalid quantity 0 of "wood"; dropped',
					'Slot 1 has invalid quantity -2 of "wood"; dropped',
					'Slot 2 has invalid quantity 1.5 of "wood"; dropped',
					'Slot 3 has invalid quantity 3 of "wood"; dropped',
				].join(" | "),
			);
		});

		it("clamps quantities above the item's max stack", () => {
			const { inventory, problems } = load({ version: 1, slots: [entry(0, "stone", 50), entry(1, "sword", 3)] });

			expect(contents(inventory)).to.equal("0:stone x32, 1:sword x1");
			expect(problems.join(" | ")).to.equal(
				[
					'Slot 0 holds 50 "stone", above the max stack of 32; clamped',
					'Slot 1 holds 3 "sword", above the max stack of 1; clamped',
				].join(" | "),
			);
		});

		it("keeps valid entries alongside rejected ones", () => {
			const { inventory, problems } = load({
				version: 1,
				slots: [entry(0, "wood", 5), entry(1, "gold", 1), entry(3, "stone", 3)],
			});

			expect(contents(inventory)).to.equal("0:wood x5, 3:stone x3");
			expect(problems.size()).to.equal(1);
		});

		it("gives back an inventory that behaves normally", () => {
			const { inventory } = load({ version: 1, slots: [entry(2, "wood", 60)] });

			expect(inventory.add("wood", 10)).to.equal(10);
			expect(contents(inventory)).to.equal("0:wood x6, 2:wood x64");
		});

		it("validates the capacity", () => {
			expect(() => Inventory.deserialize(registry, 0, { version: 1, slots: [] })).to.throw(
				"Capacity must be a positive integer",
			);
		});
	});
};
