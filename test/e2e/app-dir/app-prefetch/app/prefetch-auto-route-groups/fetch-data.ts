export let fetchCount = 0
export async function fetchData(): Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('data')
      fetchCount++
    }, 1000)
  })
}
