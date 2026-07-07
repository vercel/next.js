export function createStreamingData() {
  let result
  let promise
  function Data({ children, duration = 500 }) {
    if (result) return result
    if (!promise)
      promise = new Promise((res) => {
        setTimeout(() => {
          result = children
          res()
        }, duration)
      })
    throw promise
  }
  return Data
}
