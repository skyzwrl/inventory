/// <reference types="@rbxts/testez/globals" />

import { Inventory, ItemRegistry } from "..";
import { contents, recordChanges } from "./fixtures";

const registry = new ItemRegistry([
	{ id: "wood", maxStack: 64 },
	{ id: "stone", maxStack: 32 },
]);

export = () => {
	describe("onChanged", () => {
		it("reports the slots each operation changed, in ascending order", () => {
			const inventory = new Inventory(registry, 4);
			const { events } = recordChanges(inventory);

			inventory.add("wood", 10);
			inventory.add("stone", 40);
			inventory.add("wood", 60);
			inventory.remove("stone", 20);

			expect(events.join(" | ")).to.equal("0 | 1,2 | 0,3 | 1,2");
		});

		it("reports both slots of a move", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);
			inventory.add("stone", 5);
			const { events } = recordChanges(inventory);

			inventory.move(1, 0);
			inventory.move(0, 3, 2);

			expect(events.join(" | ")).to.equal("0,1 | 0,3");
		});

		it("stays quiet when nothing changed", () => {
			const inventory = new Inventory(registry, 1);
			inventory.add("stone", 32);
			const { events } = recordChanges(inventory);

			inventory.add("stone", 1);
			inventory.add("wood", 1);
			inventory.remove("wood", 1);
			inventory.move(0, 0);

			expect(events.size()).to.equal(0);
		});

		it("reports every slot emptied by clear", () => {
			const inventory = new Inventory(registry, 4);
			inventory.add("wood", 10);
			inventory.add("stone", 5);
			inventory.move(1, 3);
			const { events } = recordChanges(inventory);

			inventory.clear();
			inventory.clear();

			expect(events.join(" | ")).to.equal("0,3");
		});

		it("passes the same frozen list to every listener", () => {
			const inventory = new Inventory(registry, 4);
			const lists = new Array<ReadonlyArray<number>>();

			inventory.onChanged((changedSlots) => lists.push(changedSlots));
			inventory.onChanged((changedSlots) => lists.push(changedSlots));
			inventory.add("wood", 1);

			expect(lists.size()).to.equal(2);
			expect(lists[0]).to.equal(lists[1]);
			expect(table.isfrozen(lists[0])).to.equal(true);
		});

		it("stops calling a listener once disconnected", () => {
			const inventory = new Inventory(registry, 4);
			const { events, disconnect } = recordChanges(inventory);

			inventory.add("wood", 1);
			disconnect();
			disconnect();
			inventory.add("wood", 1);

			expect(events.join(" | ")).to.equal("0");
		});

		it("skips listeners disconnected by an earlier listener in the same dispatch", () => {
			const inventory = new Inventory(registry, 4);
			let secondCalls = 0;

			inventory.onChanged(() => disconnectSecond());
			const disconnectSecond = inventory.onChanged(() => secondCalls++);
			inventory.add("wood", 1);

			expect(secondCalls).to.equal(0);
		});

		it("doesn't let a yielding listener hold up the others", () => {
			const inventory = new Inventory(registry, 4);
			const order = new Array<string>();
			let slowThread: thread | undefined;

			inventory.onChanged(() => {
				slowThread = coroutine.running();
				coroutine.yield();
				order.push("slow");
			});
			inventory.onChanged(() => order.push("fast"));
			inventory.add("wood", 1);
			order.push("caller");

			expect(order.join(",")).to.equal("fast,caller");
			task.spawn(slowThread!);
			expect(order.join(",")).to.equal("fast,caller,slow");
		});

		it("lets listeners change the inventory they're observing", () => {
			const inventory = new Inventory(registry, 4);
			const { events } = recordChanges(inventory);

			const disconnect = inventory.onChanged(() => {
				disconnect();
				inventory.add("stone", 1);
			});
			inventory.add("wood", 1);

			expect(events.join(" | ")).to.equal("0 | 1");
			expect(contents(inventory)).to.equal("0:wood x1, 1:stone x1");
		});
	});
};
