/// <reference types="@rbxts/testez/globals" />

import { Inventory, ItemRegistry, SerializedInventory, Transaction } from "..";
import { contents, recordChanges } from "./fixtures";

const registry = new ItemRegistry([
	{ id: "plank", maxStack: 64 },
	{ id: "stick", maxStack: 64 },
	{ id: "pickaxe", maxStack: 1 },
	{ id: "stone", maxStack: 32 },
]);

function craftPickaxe(inventory: Inventory): boolean {
	return inventory.transaction((transaction) => {
		if (!transaction.remove("plank", 3) || !transaction.remove("stick", 2)) {
			transaction.abort();
		}
		if (transaction.add("pickaxe", 1) === 0) {
			transaction.abort();
		}
	});
}

function describeSave(save: SerializedInventory): string {
	const parts = save.slots.map((slot) => `${slot.index}:${slot.id} x${slot.quantity}`);
	return `v${save.version} ${parts.join(", ")}`;
}

export = () => {
	describe("transaction", () => {
		it("commits every change and returns true", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("plank", 5);
			inventory.add("stick", 2);

			expect(craftPickaxe(inventory)).to.equal(true);
			expect(contents(inventory)).to.equal("0:plank x2, 1:pickaxe x1");
		});

		it("restores the inventory exactly when aborted", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("plank", 5);
			inventory.add("stick", 1);

			expect(craftPickaxe(inventory)).to.equal(false);
			expect(contents(inventory)).to.equal("0:plank x5, 1:stick x1");
		});

		it("aborts when the result doesn't fit", () => {
			const inventory = new Inventory(registry, 2);
			inventory.add("plank", 10);
			inventory.add("stick", 10);

			expect(craftPickaxe(inventory)).to.equal(false);
			expect(contents(inventory)).to.equal("0:plank x10, 1:stick x10");
		});

		it("can use slots freed earlier in the same transaction", () => {
			const inventory = new Inventory(registry, 2);
			inventory.add("plank", 3);
			inventory.add("stick", 2);

			expect(craftPickaxe(inventory)).to.equal(true);
			expect(contents(inventory)).to.equal("0:pickaxe x1");
		});

		it("rolls back and rethrows when the callback errors", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("plank", 5);
			const failure = { reason: "network hiccup" };

			const [ok, err] = pcall(() =>
				inventory.transaction((transaction) => {
					transaction.remove("plank", 5);
					transaction.add("stone", 32);
					throw failure;
				}),
			);

			expect(ok).to.equal(false);
			expect(err).to.equal(failure);
			expect(contents(inventory)).to.equal("0:plank x5");
		});

		it("keeps the original message of rethrown string errors", () => {
			const inventory = new Inventory(registry, 4);

			expect(() =>
				inventory.transaction((transaction) => {
					transaction.add("stone", 1);
					throw "recipe table is missing";
				}),
			).to.throw("recipe table is missing");
			expect(inventory.count("stone")).to.equal(0);
		});

		it("rolls back moves", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("plank", 10);
			inventory.add("stone", 3);

			const committed = inventory.transaction((transaction) => {
				transaction.move(0, 1);
				transaction.move(1, 3, 4);
				transaction.abort();
			});

			expect(committed).to.equal(false);
			expect(contents(inventory)).to.equal("0:plank x10, 1:stone x3");
		});

		it("lets the callback read its own uncommitted changes", () => {
			const inventory = new Inventory(registry, 4);
			let seen = -1;

			inventory.transaction((transaction) => {
				transaction.add("stone", 40);
				seen = inventory.count("stone");
			});

			expect(seen).to.equal(40);
		});

		it("serializes the last committed state while open", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("plank", 5);
			let saved: SerializedInventory | undefined;

			inventory.transaction((transaction) => {
				transaction.remove("plank", 5);
				transaction.add("stone", 1);
				saved = inventory.serialize();
			});

			expect(describeSave(saved!)).to.equal("v1 0:plank x5");
			expect(describeSave(inventory.serialize())).to.equal("v1 0:stone x1");
		});

		it("rejects direct changes to the inventory while open", () => {
			const inventory = new Inventory(registry, 4);

			expect(() =>
				inventory.transaction((transaction) => {
					transaction.add("stone", 1);
					inventory.add("plank", 1);
				}),
			).to.throw("Inventory is locked by an open transaction");
			expect(contents(inventory)).to.equal("");

			const changes = [() => inventory.remove("stone", 1), () => inventory.move(0, 1), () => inventory.clear()];
			for (const change of changes) {
				expect(() => inventory.transaction(change)).to.throw("Inventory is locked by an open transaction");
			}
		});

		it("can't be nested", () => {
			const inventory = new Inventory(registry, 4);

			expect(() => inventory.transaction(() => inventory.transaction(() => {}))).to.throw(
				"Transactions cannot be nested",
			);
		});

		it("can't be used after the callback returns", () => {
			const inventory = new Inventory(registry, 4);
			let escaped: Transaction | undefined;

			inventory.transaction((transaction) => {
				escaped = transaction;
			});

			expect(() => escaped!.add("stone", 1)).to.throw("Transaction is no longer active");
			expect(() => escaped!.abort()).to.throw("Transaction is no longer active");
			expect(inventory.count("stone")).to.equal(0);
		});

		it("still rolls back when the callback swallows its own abort", () => {
			const inventory = new Inventory(registry, 4);

			const committed = inventory.transaction((transaction) => {
				transaction.add("stone", 5);
				pcall(() => transaction.abort());
			});

			expect(committed).to.equal(false);
			expect(inventory.count("stone")).to.equal(0);
		});

		it("validates arguments like the inventory methods", () => {
			const inventory = new Inventory(registry, 4);

			expect(() => inventory.transaction((transaction) => transaction.add("gold", 1))).to.throw(
				'Item "gold" is not registered',
			);
			expect(() => inventory.transaction((transaction) => transaction.remove("stone", -1))).to.throw(
				"Quantity must be a positive integer",
			);
			expect(() => inventory.transaction((transaction) => transaction.move(0, 4))).to.throw(
				"Slot index must be an integer from 0 to 3",
			);
		});

		it("fires one event for a committed transaction and none otherwise", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("plank", 5);
			inventory.add("stick", 2);
			const { events } = recordChanges(inventory);

			craftPickaxe(inventory);
			expect(events.join(" | ")).to.equal("0,1");

			craftPickaxe(inventory);
			pcall(() =>
				inventory.transaction((transaction) => {
					transaction.add("stone", 1);
					throw "boom";
				}),
			);
			expect(events.join(" | ")).to.equal("0,1");
		});

		it("leaves out slots that end up where they started", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("plank", 5);
			const { events } = recordChanges(inventory);

			inventory.transaction((transaction) => {
				transaction.remove("plank", 5);
				transaction.add("plank", 5);
			});
			expect(events.size()).to.equal(0);

			inventory.transaction((transaction) => {
				transaction.remove("plank", 2);
				transaction.add("plank", 2);
				transaction.add("stone", 1);
			});
			expect(events.join(" | ")).to.equal("1");
		});
	});
};
