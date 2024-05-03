const fs = require('fs')
const path = require('path')

const serverExternals = require('../packages/next/src/lib/server-external-packages.json')

const docPath = `docs/02-app/02-api-reference/05-next-config-js/serverComponentsExternalPackages.mdx`
const docContent = fs.readFileSync(path.join(__dirname, '..', docPath), 'utf8')

const docPkgs = []
const extraPkgs = []
const missingPkgs = []

for (let docPkg of docContent.split('opt-ed out:').pop().split('\n')) {
  docPkg = docPkg.split('`')[1]

  if (!docPkg) {
    continue
  }
  docPkgs.push(docPkg)

  if (!serverExternals.includes(docPkg)) {
    extraPkgs.push(docPkg)
  }
}

for (const pkg of serverExternals) {
  if (!docPkgs.includes(pkg)) {
    missingPkgs.push(pkg)
  }
}

if (extraPkgs.length || missingPkgs.length) {
  console.log(
    'server externals doc out of sync!\n' +
      `Extra packages included: ` +
      JSON.stringify(extraPkgs, null, 2) +
      '\n' +
      `Missing packages: ` +
      JSON.stringify(missingPkgs, null, 2) +
      '\n' +
      `doc path: ${docPath}`
  )
  process.exit(1)
}
console.log('server externals doc is in sync')
