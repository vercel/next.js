export type ChargeResult = {
  success: boolean
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
  return { success: true }
  // return { success: false, errorMessage: 'Card expired' }
}
