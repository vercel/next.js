export default function delay (ms) {
  return new Promise(resolve => setTimeout(() => {
    console.log(`sleep ${ms} ms.`)
    resolve(ms)
  }, ms))
}
