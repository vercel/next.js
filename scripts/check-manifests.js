#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const globOrig = require('glob')
const { promisify } = require('util')
const glob = promisify(globOrig)

function collectPaths(routes, paths = []) {
  for (const route of routes) {
    if (route.path && !route.redirect) {
      paths.push(route.path)
    }

    if (route.routes) {
      collectPaths(route.routes, paths)
    }
  }
}

async function main() {
  const manifest = 'errors/manifest.json'
  let hadError = false

  const dir = path.dirname(manifest)
  const files = await glob(path.join(dir, '**/*.md'))

  const manifestData = JSON.parse(await fs.promises.readFile(manifest, 'utf8'))

  const paths = []
  collectPaths(manifestData.routes, paths)

  const missingFiles = files.filter(
    (file) => !paths.includes(`/${file}`) && file !== 'errors/template.md'
  )

  if (missingFiles.length) {
    hadError = true
    console.log(`Missing paths in ${manifest}:\n${missingFiles.join('\n')}`)
  } else {
    console.log(`No missing paths in ${manifest}`)
  }

  for (const filePath of paths) {
    if (
      !(await fs.promises
        .access(path.join(process.cwd(), filePath), fs.constants.F_OK)
        .then(() => true)
        .catch(() => false))
    ) {
      console.log('Could not find path:', filePath)
      hadError = true
    }
  }

  if (hadError) {
    throw new Error('missing/incorrect manifest items detected see above')
  }
}

main()
  .then(() => console.log('success'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
