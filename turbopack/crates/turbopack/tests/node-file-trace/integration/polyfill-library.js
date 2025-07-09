const polyfill = require('polyfill-library')

async function handler() {
  const script = await polyfill.getPolyfillString({
    minify: false,
    features: { es6: { flags: ['gated'] } },
  })
  return script
}

handler()
  .then((script) => console.log(typeof script))
  .catch(console.error)
