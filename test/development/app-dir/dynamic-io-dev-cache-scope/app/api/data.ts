function delay() {
  return new Promise((resolve) => {
    setTimeout(resolve, 100)
  })
}
export async function fetchData() {
  await delay()
  return '' + Math.random()
}
