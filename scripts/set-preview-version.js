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

  const lernaConfig = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'lerna.json'), 'utf8')
  )

  // 15.0.0-canary.17 -> 15.0.0
  // 15.0.0 -> 15.0.0
  const [semverStableVersion] = lernaConfig.version.split('-')
  const version = `${semverStableVersion}-preview-${shortSha}-${dateString}`

  const nextPackageJsonPath = path.join(repoRoot, 'packages/next/package.json')
  const nextPackageJson = JSON.parse(
    await fs.readFile(nextPackageJsonPath, 'utf8')
  )
  nextPackageJson.version = version
  await fs.writeFile(
    nextPackageJsonPath,
    JSON.stringify(nextPackageJson, null, 2) + '\n'
  )

  console.info(`Set preview version: ${version}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
