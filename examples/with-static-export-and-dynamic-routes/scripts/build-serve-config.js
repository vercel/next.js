const fs = require(`fs`)
const path = require(`path`)
const redirects = require(`../redirects`)

const OUTPUT_PATH = path.join(__dirname, `../out`)
const FILE_NAME = `serve.json`

const config = {
  renderSingle: true,
  trailingSlash: true,
  rewrites: redirects.map(redirect => ({
    source: redirect.externalURL,
    destination: redirect.staticPage
  }))
}

fs.writeFile(
  path.join(OUTPUT_PATH, FILE_NAME),
  JSON.stringify(config, null, 2),
  err => {
    if (err) {
      throw err
    }
    // eslint-disable-next-line no-console
    console.log(`Generated: ${OUTPUT_PATH}  ${FILE_NAME}`)
  }
)
