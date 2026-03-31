export function createDataFetcher(data, { timeout = 0, expire = 10 }) {
  let result
  let promise
  return function Data() {
    if (result) return result
    if (!promise)
      promise = new Promise((resolve) => {
        setTimeout(() => {
          result = data
          setTimeout(() => {
            result = undefined
            promise = undefined
          }, expire)
          resolve()
        }, timeout)
      })
    throw promise
  }
}
