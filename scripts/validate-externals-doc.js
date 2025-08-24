const fs = require('fs')
const path = require('path')

const serverExternals = require('../packages/next/src/lib/server-external-packages.json')

function validate(docPath) {
  const docContent = fs.readFileSync(
    path.join(__dirname, '..', docPath),
    'utf8'
  )

  const docPkgs = []
  const extraPkgs = []
  const missingPkgs = []

  for (let docPkg of docContent
    .split('opt-ed out:')
    .pop()
    .split('| Version')
    .shift()
    .split('\n')) {
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
    return false
  }

  return true
}

const appRouterValid = validate(
  `docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.mdx`
)
const pagesRouterValid = validate(
  `docs/02-pages/04-api-reference/04-config/01-next-config-js/serverExternalPackages.mdx`
)

if (appRouterValid && pagesRouterValid) {
  console.log('server externals doc is in sync')
  process.exit(0)
} else {
  process.exit(1)
}
