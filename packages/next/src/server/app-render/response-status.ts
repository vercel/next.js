/**
 * Prerenders own this state. Dynamic renders use the live response through this
 * interface.
 */
export type ResponseStatus = {
  statusCode: number | undefined
}
