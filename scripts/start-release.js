const path = require('path')
const execa = require('execa')
const resolveFrom = require('resolve-from')
const ansiEscapes = require('ansi-escapes')

async function main() {
  const args = process.argv
  const releaseType = args[args.indexOf('--release-type') + 1]
  const semverType = args[args.indexOf('--semver-type') + 1]
  const isCanary = releaseType === 'canary'

  if (releaseType !== 'stable' && releaseType !== 'canary') {
    console.log(`Invalid release type ${releaseType}, must be stable or canary`)
    return
  }
  if (!isCanary && !['patch', 'minor', 'stable'].includes(semverType)) {
    console.log(
      `Invalid semver type ${semverType}, must be one of ${semverType.join(
        ', '
      )}`
    )
    return
  }

  const githubToken = process.env.START_RELEASE_TOKEN

  if (!githubToken) {
    console.log(`Missing START_RELEASE_TOKEN`)
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
    `git remote set-url origin https://ijjk:${githubToken}@github.com/vercel/next.js`,
    { stdio: 'inherit', shell: true }
  )
  await execa(`git config user.name "JJ Kasper"`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git config user.email "jj@jjsweb.site"`, {
    stdio: 'inherit',
    shell: true,
  })

  const child = execa(`pnpm publish-${isCanary ? 'canary' : 'stable'}`, {
    stdio: 'pipe',
    shell: true,
  })

  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)

  if (isCanary) {
    child.stdin.write('y\n')
  } else {
    if (semverType === 'minor') {
      child.stdin.write(ansiEscapes.cursorDown(1))
    }
    if (semverType === 'major') {
      child.stdin.write(ansiEscapes.cursorDown(1))
      child.stdin.write(ansiEscapes.cursorDown(1))
    }
    child.stdin.write('\n')
  }
  await child
}

main()
