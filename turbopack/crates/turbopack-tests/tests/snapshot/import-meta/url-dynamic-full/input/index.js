const name = globalThis.assetName
const assetUrl = new URL(`./assets/${name}`, import.meta.url)
const staticUrl = new URL('./assets/a.txt', import.meta.url)

console.log(assetUrl, staticUrl)
