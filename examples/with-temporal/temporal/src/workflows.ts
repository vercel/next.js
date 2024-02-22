import { proxyActivities } from "@temporalio/workflow";
// Only import the activity types
import type * as activities from "./activities.js";

const { chargeUser, checkAndDecrementInventory, incrementInventory } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

export async function order(
  userId: string,
  itemId: string,
  quantity: number,
): Promise<string> {
  const haveEnoughInventory: boolean = await checkAndDecrementInventory(
    itemId,
    quantity,
  );
  if (haveEnoughInventory) {
    const result: activities.ChargeResult = await chargeUser(
      userId,
      itemId,
      quantity,
    );
    if (result.status === "success") {
      return `Order successful!`;
    } else {
      await incrementInventory(itemId, quantity);
      return `Unable to complete payment. Error: ${result.errorMessage}`;
    }
  } else {
    return `Sorry, we don't have enough items in stock to fulfill your order.`;
  }
}
