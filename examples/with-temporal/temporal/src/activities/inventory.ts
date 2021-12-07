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
  return true
}
