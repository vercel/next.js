/** Captured at the actual client entry, before loading authored modules. */
export function createClientRpcPrimitives() {
  const fetchRpc = globalThis.fetch
  const apply = Reflect.apply
  const getPrototypeOf = Object.getPrototypeOf
  const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
  let rpcJson: unknown
  let stringify: unknown
  try {
    rpcJson = getOwnPropertyDescriptor(globalThis, 'JSON')?.value
    if (
      rpcJson !== null &&
      (typeof rpcJson === 'object' || typeof rpcJson === 'function')
    )
      stringify = getOwnPropertyDescriptor(rpcJson, 'stringify')?.value
  } catch {
    // Optional capture must preserve the original late lookup when unavailable.
  }
  let initialized = false
  let responsePrototype: object | undefined
  let responseJson: Response['json'] | undefined

  function readRpcJson(response: Response): ReturnType<Response['json']> {
    let capturedResponse = false
    try {
      capturedResponse =
        !!responsePrototype &&
        getPrototypeOf(response) === responsePrototype &&
        !getOwnPropertyDescriptor(response, 'json')
    } catch {
      // Optional matching cannot replace the response's original lookup/call.
    }
    if (capturedResponse) return apply(responseJson!, response, [])

    const json = response.json
    const result = apply(json, response, [])
    if (!initialized) {
      initialized = true
      // The first config response is read before authored code. Plain response
      // doubles keep their own methods and closures, including late bindings.
      try {
        if (!getOwnPropertyDescriptor(response, 'json')) {
          const prototype = getPrototypeOf(response)
          if (
            prototype &&
            getOwnPropertyDescriptor(prototype, 'json')?.value === json
          ) {
            responsePrototype = prototype
            responseJson = json
          }
        }
      } catch {
        // The original method already returned this exact result.
      }
    }
    return result
  }
  function stringifyRpc(value: unknown): ReturnType<JSON['stringify']> {
    if (typeof stringify === 'function')
      return apply(stringify, rpcJson, [value])
    // Missing, late or accessor-backed bootstrap doubles retain their lookup.
    return JSON.stringify(value)
  }
  return { fetchRpc, readRpcJson, stringifyRpc }
}
