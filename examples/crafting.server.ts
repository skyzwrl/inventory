import { Inventory, ItemRegistry, Transaction } from "@skyzwrl/inventory";

const Players = game.GetService("Players");
const ReplicatedStorage = game.GetService("ReplicatedStorage");

// as const keeps the ids as literal types, so a typo like inventory.add("plnk", 1) doesn't compile
const items = new ItemRegistry([
	{ id: "plank", maxStack: 64 },
	{ id: "stick", maxStack: 64 },
	{ id: "stone", maxStack: 32 },
	{ id: "wooden_pickaxe", maxStack: 1 },
	{ id: "stone_pickaxe", maxStack: 1 },
] as const);

type Item = typeof items extends ItemRegistry<infer T> ? T : never;
type ItemId = Item["id"];

interface Recipe {
	readonly inputs: ReadonlyArray<[item: ItemId, amount: number]>;
	readonly output: ItemId;
}

const recipes = new Map<string, Recipe>([
	[
		"wooden_pickaxe",
		{
			inputs: [
				["plank", 3],
				["stick", 2],
			],
			output: "wooden_pickaxe",
		},
	],
	[
		"stone_pickaxe",
		{
			inputs: [
				["stone", 3],
				["stick", 2],
			],
			output: "stone_pickaxe",
		},
	],
]);

const craftRequest = new Instance("RemoteEvent");
craftRequest.Name = "CraftRequest";
craftRequest.Parent = ReplicatedStorage;

const slotsChanged = new Instance("RemoteEvent");
slotsChanged.Name = "SlotsChanged";
slotsChanged.Parent = ReplicatedStorage;

const inventories = new Map<Player, Inventory<Item>>();

function craft(transaction: Transaction<ItemId>, recipe: Recipe) {
	for (const [item, amount] of recipe.inputs) {
		if (!transaction.remove(item, amount)) {
			transaction.abort();
		}
	}
	if (transaction.add(recipe.output, 1) === 0) {
		transaction.abort();
	}
}

Players.PlayerAdded.Connect((player) => {
	const inventory = new Inventory(items, 24);

	// send the current contents of whatever changed, the client never has to replay game logic
	inventory.onChanged((changedSlots) => {
		slotsChanged.FireClient(
			player,
			changedSlots.map((index) => [index, inventory.getSlot(index)]),
		);
	});
	inventories.set(player, inventory);

	inventory.add("plank", 8);
	inventory.add("stick", 4);
});

Players.PlayerRemoving.Connect((player) => inventories.delete(player));

craftRequest.OnServerEvent.Connect((player, recipeId) => {
	const inventory = inventories.get(player);
	const recipe = typeIs(recipeId, "string") ? recipes.get(recipeId) : undefined;
	if (inventory === undefined || recipe === undefined) {
		return;
	}
	// either every input is taken and the output added, or nothing changes and no event fires
	inventory.transaction((transaction) => craft(transaction, recipe));
});
