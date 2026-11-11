const realSetTimeout = globalThis.setTimeout.bind(globalThis)
export const delay = (ms) =>
  new Promise((resolve) => realSetTimeout(resolve, ms))
