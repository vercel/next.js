const path = require('path')
const execa = require('execa')
const resolveFrom = require('resolve-from')

const SEMVER_TYPES = ['patch', 'minor', 'major']

async function main() {
  const args = process.argv
  const releaseType = args[args.indexOf('--release-type') + 1]
  const semverType = args[args.indexOf('--semver-type') + 1]
  const isCanary = releaseType !== 'stable'

  if (releaseType !== 'stable' && releaseType !== 'canary') {
    console.log(`Invalid release type ${releaseType}, must be stable or canary`)
    return
  }
  if (!isCanary && !SEMVER_TYPES.includes(semverType)) {
    console.log(
      `Invalid semver type ${semverType}, must be one of ${SEMVER_TYPES.join(
        ', '
      )}`
    )
    return
  }

  const githubToken = process.env.RELEASE_BOT_GITHUB_TOKEN

  if (!githubToken) {
    console.log(`Missing RELEASE_BOT_GITHUB_TOKEN`)
    return
  }

  const configStorePath = resolveFrom(
    path.join(process.cwd(), 'node_modules/release'),
    'configstore'
  )
  const ConfigStore = require(configStorePath)

  const config = new ConfigStore('release')
  config.set('token', githubToken)

  await execa(
    `git remote set-url origin https://vercel-release-bot:${githubToken}@github.com/vercel/next.js.git`,
    { stdio: 'inherit', shell: true }
  )
  await execa(`git config user.name "vercel-release-bot"`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git config user.email "infra+release@vercel.com"`, {
    stdio: 'inherit',
    shell: true,
  })

  console.log(`Running pnpm release-${isCanary ? 'canary' : 'stable'}...`)
  const child = execa(
    isCanary
      ? `pnpm lerna version ${
          semverType === 'minor' ? 'preminor' : 'prerelease'
        } --preid canary --force-publish -y && pnpm release --pre --skip-questions --show-url`
      : `pnpm lerna version ${semverType} --force-publish -y`,
    {
      stdio: 'pipe',
      shell: true,
    }
  )

  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  await child
  console.log('Release process is finished')
}

main()
