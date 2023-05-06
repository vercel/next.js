import fetch from 'node-fetch'

export type ChargeResult = {
  status: string
  errorMessage?: string
}

export async function chargeUser(
  userId: string,
  itemId: string,
  quantity: number
): Promise<ChargeResult> {
  // TODO send request to the payments service that looks up the user's saved
  // payment info and the cost of the item and attempts to charge their payment
  // method.
  console.log(`Charging user ${userId} for ${quantity} of item ${itemId}`)
  try {
    const response = await fetch('http://httpbin.org/get?status=success')
    const body: any = await response.json()
    return { status: body.args.status }
  } catch (e: any) {
    return { status: 'failure', errorMessage: e.message }
  }
}

export async function checkAndDecrementInventory(
  itemId: string,
  quantity: number
): Promise<boolean> {
  // TODO a database request that—in a single operation or transaction—checks
  // whether there are `quantity` items remaining, and if so, decreases the
  // total. Something like:
  // const result = await db.collection('items').updateOne(
  //   { _id: itemId, numAvailable: { $gte: quantity } },
  //   { $inc: { numAvailable: -quantity } }
  // )
  // return result.modifiedCount === 1
  console.log(`Reserving ${quantity} of item ${itemId}`)
  return true
}

export async function incrementInventory(
  itemId: string,
  quantity: number
): Promise<boolean> {
  // TODO increment inventory:
  // const result = await db.collection('items').updateOne(
  //   { _id: itemId },
  //   { $inc: { numAvailable: quantity } }
  // )
  // return result.modifiedCount === 1
  console.log(`Incrementing ${itemId} inventory by ${quantity}`)
  return true
}
