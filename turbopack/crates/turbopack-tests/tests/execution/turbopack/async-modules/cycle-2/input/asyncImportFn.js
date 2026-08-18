function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
await sleep(0)
console.log('Imported asyncImportFn')

export function asyncImportFn() {}
