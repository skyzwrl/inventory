/// <reference types="@rbxts/testez/globals" />

import { Inventory, ItemRegistry } from "..";
import { contents, outcome } from "./fixtures";

const registry = new ItemRegistry([
	{ id: "wood", maxStack: 64 },
	{ id: "stone", maxStack: 32 },
	{ id: "sword", maxStack: 1 },
]);

const INVALID_QUANTITIES = [0, -1, 1.5, 0 / 0, math.huge, "5" as unknown as number];

export = () => {
	describe("new", () => {
		it("creates an empty inventory with the given capacity", () => {
			const inventory = new Inventory(registry, 9);

			expect(inventory.getCapacity()).to.equal(9);
			expect(contents(inventory)).to.equal("");
		});

		it("rejects capacities that are not positive integers", () => {
			for (const capacity of [0, -4, 2.5, 0 / 0, "9" as unknown as number]) {
				expect(() => new Inventory(registry, capacity)).to.throw("Capacity must be a positive integer");
			}
		});
	});

	describe("add", () => {
		it("fills the lowest empty slot", () => {
			const inventory = new Inventory(registry, 4);

			expect(inventory.add("wood", 10)).to.equal(10);
			expect(contents(inventory)).to.equal("0:wood x10");
		});

		it("tops up existing stacks before opening new ones", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);
			inventory.add("stone", 5);

			expect(inventory.add("wood", 60)).to.equal(60);
			expect(contents(inventory)).to.equal("0:wood x64, 1:stone x5, 2:wood x6");
		});

		it("tops up a partial stack that sits after a full one", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 70);

			expect(inventory.add("wood", 10)).to.equal(10);
			expect(contents(inventory)).to.equal("0:wood x64, 1:wood x16");
		});

		it("fills a stack exactly without opening another slot", () => {
			const inventory = new Inventory(registry, 4);

			expect(inventory.add("wood", 64)).to.equal(64);
			expect(contents(inventory)).to.equal("0:wood x64");
		});

		it("spreads unstackable items over separate slots", () => {
			const inventory = new Inventory(registry, 4);

			expect(inventory.add("sword", 3)).to.equal(3);
			expect(contents(inventory)).to.equal("0:sword x1, 1:sword x1, 2:sword x1");
		});

		it("returns how much fit when the inventory overflows", () => {
			const inventory = new Inventory(registry, 2);

			expect(inventory.add("wood", 200)).to.equal(128);
			expect(inventory.count("wood")).to.equal(128);
			expect(contents(inventory)).to.equal("0:wood x64, 1:wood x64");
		});

		it("returns 0 when nothing fits", () => {
			const inventory = new Inventory(registry, 1);
			inventory.add("stone", 32);

			expect(inventory.add("wood", 1)).to.equal(0);
			expect(inventory.add("stone", 1)).to.equal(0);
			expect(contents(inventory)).to.equal("0:stone x32");
		});

		it("rejects quantities that are not positive integers", () => {
			const inventory = new Inventory(registry, 4);

			for (const quantity of INVALID_QUANTITIES) {
				expect(() => inventory.add("wood", quantity)).to.throw("Quantity must be a positive integer");
			}
			expect(contents(inventory)).to.equal("");
		});

		it("rejects items that aren't registered", () => {
			const inventory = new Inventory(registry, 4);

			expect(() => inventory.add("gold", 1)).to.throw('Item "gold" is not registered');
		});
	});

	describe("canAdd", () => {
		it("counts room in partial stacks and empty slots", () => {
			const inventory = new Inventory(registry, 2);
			inventory.add("wood", 60);

			expect(inventory.canAdd("wood", 68)).to.equal(true);
			expect(inventory.canAdd("wood", 69)).to.equal(false);
			expect(inventory.canAdd("stone", 32)).to.equal(true);
			expect(inventory.canAdd("stone", 33)).to.equal(false);
		});

		it("validates its arguments like add", () => {
			const inventory = new Inventory(registry, 2);

			expect(() => inventory.canAdd("wood", 0)).to.throw("Quantity must be a positive integer");
			expect(() => inventory.canAdd("gold", 1)).to.throw('Item "gold" is not registered');
		});
	});

	describe("remove", () => {
		it("drains stacks from the highest slot down", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 138);

			expect(inventory.remove("wood", 20)).to.equal(true);
			expect(contents(inventory)).to.equal("0:wood x64, 1:wood x54");
		});

		it("empties slots that reach zero", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 70);

			expect(inventory.remove("wood", 70)).to.equal(true);
			expect(contents(inventory)).to.equal("");
		});

		it("removes nothing when there isn't enough", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 70);

			expect(inventory.remove("wood", 71)).to.equal(false);
			expect(inventory.count("wood")).to.equal(70);
			expect(inventory.remove("stone", 1)).to.equal(false);
		});

		it("leaves other items alone", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 64);
			inventory.add("stone", 10);
			inventory.add("wood", 64);

			expect(inventory.remove("wood", 100)).to.equal(true);
			expect(contents(inventory)).to.equal("0:wood x28, 1:stone x10");
		});

		it("rejects quantities that are not positive integers", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			for (const quantity of INVALID_QUANTITIES) {
				expect(() => inventory.remove("wood", quantity)).to.throw("Quantity must be a positive integer");
			}
			expect(inventory.count("wood")).to.equal(10);
		});
	});

	describe("count", () => {
		it("sums every stack of the item", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 100);
			inventory.add("stone", 3);

			expect(inventory.count("wood")).to.equal(100);
			expect(inventory.count("stone")).to.equal(3);
			expect(inventory.count("sword")).to.equal(0);
		});

		it("rejects items that aren't registered", () => {
			const inventory = new Inventory(registry, 4);

			expect(() => inventory.count("gold")).to.throw('Item "gold" is not registered');
		});
	});

	describe("getSlot", () => {
		it("returns a frozen record that can't change the inventory", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			const slot = inventory.getSlot(0)!;
			expect(slot.id).to.equal("wood");
			expect(slot.quantity).to.equal(10);
			expect(() => {
				(slot as { quantity: number }).quantity = 64;
			}).to.throw();
			expect(inventory.count("wood")).to.equal(10);
		});

		it("returns undefined for empty slots", () => {
			const inventory = new Inventory(registry, 4);

			expect(inventory.getSlot(3)).never.to.be.ok();
		});

		it("rejects indices outside the inventory", () => {
			const inventory = new Inventory(registry, 4);

			for (const index of [-1, 4, 1.5, "1" as unknown as number]) {
				expect(() => inventory.getSlot(index)).to.throw("Slot index must be an integer from 0 to 3");
			}
		});

		it("returns snapshots from getSlots", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			const snapshot = inventory.getSlots();
			inventory.add("stone", 1);

			expect(snapshot.size()).to.equal(1);
			expect(inventory.getSlots().size()).to.equal(2);
		});
	});

	describe("move", () => {
		it("moves a whole stack into an empty slot", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			expect(outcome(inventory.move(0, 2))).to.equal("move 10");
			expect(contents(inventory)).to.equal("2:wood x10");
		});

		it("splits a stack when given a quantity", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			expect(outcome(inventory.move(0, 1, 4))).to.equal("split 4");
			expect(contents(inventory)).to.equal("0:wood x6, 1:wood x4");
		});

		it("treats a quantity equal to the stack as a whole-stack move", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			expect(outcome(inventory.move(0, 1, 10))).to.equal("move 10");
			expect(contents(inventory)).to.equal("1:wood x10");
		});

		it("merges into a stack of the same item up to its max", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 80);

			expect(outcome(inventory.move(0, 1))).to.equal("merge 48");
			expect(contents(inventory)).to.equal("0:wood x16, 1:wood x64");
		});

		it("merges a whole stack when it fits", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 30);
			inventory.move(0, 1, 10);

			expect(outcome(inventory.move(1, 0))).to.equal("merge 10");
			expect(contents(inventory)).to.equal("0:wood x30");
		});

		it("does nothing when the target stack is full", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 64);
			inventory.add("stone", 1);
			inventory.move(1, 2);
			inventory.add("wood", 10);

			expect(contents(inventory)).to.equal("0:wood x64, 1:wood x10, 2:stone x1");
			expect(outcome(inventory.move(1, 0))).to.equal("TargetFull");
			expect(contents(inventory)).to.equal("0:wood x64, 1:wood x10, 2:stone x1");
		});

		it("swaps whole stacks of different items", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);
			inventory.add("stone", 5);

			expect(outcome(inventory.move(0, 1))).to.equal("swap 10");
			expect(contents(inventory)).to.equal("0:stone x5, 1:wood x10");
		});

		it("refuses to drop part of a stack onto a different item", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);
			inventory.add("stone", 5);

			expect(outcome(inventory.move(0, 1, 3))).to.equal("DifferentItem");
			expect(contents(inventory)).to.equal("0:wood x10, 1:stone x5");
		});

		it("does nothing for empty sources, same-slot moves and oversized quantities", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			expect(outcome(inventory.move(2, 0))).to.equal("EmptySlot");
			expect(outcome(inventory.move(0, 0))).to.equal("SameSlot");
			expect(outcome(inventory.move(0, 1, 11))).to.equal("NotEnough");
			expect(contents(inventory)).to.equal("0:wood x10");
		});

		it("validates indices and quantity", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);

			expect(() => inventory.move(-1, 0)).to.throw("Slot index must be an integer from 0 to 3, got -1");
			expect(() => inventory.move(0, 4)).to.throw("Slot index must be an integer from 0 to 3, got 4");
			expect(() => inventory.move(0, 1, 0)).to.throw("Quantity must be a positive integer");
		});
	});

	describe("clear", () => {
		it("empties every slot", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 100);
			inventory.add("sword", 1);

			inventory.clear();

			expect(contents(inventory)).to.equal("");
			expect(inventory.add("stone", 1)).to.equal(1);
		});
	});
};
