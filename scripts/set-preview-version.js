// @ts-check
const execa = require('execa')
const fs = require('node:fs/promises')
const path = require('node:path')

async function main() {
  const [githubSha] = process.argv.slice(2)
  if (!githubSha) {
    throw new Error('Usage: set-preview-version.js <githubSha>')
  }

  const repoRoot = path.resolve(__dirname, '..')

  const [{ stdout: shortSha }, { stdout: dateString }] = await Promise.all([
    execa('git', ['rev-parse', '--short', githubSha]),
    // Source: https://github.com/facebook/react/blob/767f52237cf7892ad07726f21e3e8bacfc8af839/scripts/release/utils.js#L114
    execa('git', [
      'show',
      '-s',
      '--no-show-signature',
      '--format=%cd',
      '--date=format:%Y%m%d',
      githubSha,
    ]),
  ])

  const lernaConfigPath = path.join(repoRoot, 'lerna.json')
  const lernaConfig = JSON.parse(await fs.readFile(lernaConfigPath, 'utf8'))
  const oldVersion = lernaConfig.version

  // 15.0.0-canary.17 -> 15.0.0
  // 15.0.0 -> 15.0.0
  const [semverStableVersion] = oldVersion.split('-')
  const version = `${semverStableVersion}-preview-${shortSha}-${dateString}`

  // Update lerna.json
  lernaConfig.version = version
  await fs.writeFile(
    lernaConfigPath,
    JSON.stringify(lernaConfig, null, 2) + '\n'
  )

  // Update all package.json files in the monorepo
  const packagesDir = path.join(repoRoot, 'packages')
  const packageDirs = await fs.readdir(packagesDir)

  await Promise.all(
    packageDirs.map(async (dir) => {
      const pkgJsonPath = path.join(packagesDir, dir, 'package.json')
      let pkgJson
      try {
        pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'))
      } catch {
        return
      }

      let changed = false

      if (pkgJson.version === oldVersion) {
        pkgJson.version = version
        changed = true
      }

      for (const depType of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ]) {
        const deps = pkgJson[depType]
        if (!deps) continue
        for (const [name, depVersion] of Object.entries(deps)) {
          if (depVersion === oldVersion) {
            deps[name] = version
            changed = true
          }
        }
      }

      if (changed) {
        await fs.writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
      }
    })
  )

  console.info(`Set preview version: ${version}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
