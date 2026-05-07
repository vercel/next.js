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

  // 15.0.0-canary.17 -> 15.0.0
  // 15.0.0 -> 15.0.0
  const [semverStableVersion] = lernaConfig.version.split('-')
  // This can create colliding versions between different forks which should be incredibly rare.
  // Preview builds are installed by URL anyway which is unique between forks by
  // controlling the repo var setting the preview builds base url.
  const version = `${semverStableVersion}-preview-${shortSha}-${dateString}`
  //
  // Lerna version requires a non-detached HEAD
  await execa('git', ['checkout', '-B', `preview/${shortSha}`, githubSha], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await execa(
    'pnpm',
    [
      'lerna',
      'version',
      version,
      '--no-git-tag-version',
      '--no-push',
      '--allow-branch',
      '**',
      '--yes',
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  )

  console.info(`Set preview version: ${version}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
