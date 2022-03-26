export function createStreamingData(value) {
  let result
  let promise
  function Data() {
    if (result) return result
    if (!promise)
      promise = new Promise((res) => {
        setTimeout(() => {
          result = value
          res()
        }, 500)
      })
    throw promise
  }
  return Data
}
