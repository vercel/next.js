const assetUrl = new URL('./asset.txt', import.meta.url)

console.log(assetUrl)
fetch(assetUrl)
  .then((res) => res.text())
  .then(console.log)
