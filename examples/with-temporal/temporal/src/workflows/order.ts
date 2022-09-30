import { Order } from '../interfaces/workflows'
import {
  checkAndDecrementInventory,
  incrementInventory,
} from '@activities/inventory'
import { chargeUser, ChargeResult } from '@activities/payment'

async function main(
  userId: string,
  itemId: string,
  quantity: number
): Promise<string> {
  const haveEnoughInventory: boolean = await checkAndDecrementInventory(
    itemId,
    quantity
  )
  if (haveEnoughInventory) {
    const result: ChargeResult = await chargeUser(userId, itemId, quantity)
    if (result.success) {
      return `Order successful!`
    } else {
      await incrementInventory(itemId, quantity)
      return `Unable to complete payment. Error: ${result.errorMessage}`
    }
  } else {
    return `Sorry, we don't have enough items in stock to fulfill your order.`
  }
}

export const workflow: Order = { main }
