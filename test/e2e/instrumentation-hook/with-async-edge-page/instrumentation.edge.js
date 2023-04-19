/*global globalThis*/

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function register() {
  await sleep(1000)
  globalThis.instrumentationFinished = true
}
