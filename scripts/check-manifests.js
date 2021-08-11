#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const globOrig = require('glob')
const { promisify } = require('util')
const glob = promisify(globOrig)

function collectPaths(routes, paths = []) {
  for (const route of routes) {
    if (route.path) {
      paths.push(route.path)
    }

    if (route.routes) {
      collectPaths(route.routes, paths)
    }
  }
}

async function main() {
  const manifests = ['errors/manifest.json', 'docs/manifest.json']
  let hadMissing = false

  for (const manifest of manifests) {
    const dir = path.dirname(manifest)
    const files = await glob(path.join(dir, '**/*.md'))

    const manifestData = JSON.parse(
      await fs.promises.readFile(manifest, 'utf8')
    )

    const paths = []
    collectPaths(manifestData.routes, paths)

    const missingFiles = files.filter(
      (file) => !paths.includes(`/${file}`) && file !== 'errors/template.md'
    )

    if (missingFiles.length) {
      hadMissing = true
      console.log(`Missing paths in ${manifest}:\n${missingFiles.join('\n')}`)
    } else {
      console.log(`No missing paths in ${manifest}`)
    }
  }

  if (hadMissing) {
    throw new Error('missing manifest items detected see above')
  }
}

main()
  .then(() => console.log('success'))
  .catch(console.error)
