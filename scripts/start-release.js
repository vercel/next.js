const path = require('path')
const execa = require('execa')
const resolveFrom = require('resolve-from')
const ansiEscapes = require('ansi-escapes')
const fetch = require('node-fetch')

async function main() {
  const args = process.argv
  const releaseType = args[args.indexOf('--release-type') + 1]
  const semverType = args[args.indexOf('--semver-type') + 1]
  const isCanary = releaseType !== 'stable'

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
    `git remote set-url origin https://ijjk:${githubToken}@github.com/vercel/next.js.git`,
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

  const child = execa(`pnpm release-${isCanary ? 'canary' : 'stable'}`, {
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
    child.stdin.write('y\n')
  }
  await child

  if (isCanary) {
    try {
      const ghHeaders = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      }
      let { version } = require('../lerna.json')
      version = `v${version}`

      let release
      let releasesData

      // The release might take a minute to show up in
      // the list so retry a bit
      for (let i = 0; i < 6; i++) {
        try {
          const releaseUrlRes = await fetch(
            `https://api.github.com/repos/vercel/next.js/releases`,
            {
              headers: ghHeaders,
            }
          )
          releasesData = await releaseUrlRes.json()

          release = releasesData.find((release) => release.tag_name === version)
        } catch (err) {
          console.log(`Fetching release failed`, err)
        }
        if (!release) {
          console.log(`Retrying in 10s...`)
          await new Promise((resolve) => setTimeout(resolve, 10 * 1000))
        }
      }

      if (!release) {
        console.log(`Failed to find release`, releasesData)
        return
      }

      const undraftRes = await fetch(release.url, {
        headers: ghHeaders,
        method: 'PATCH',
        body: JSON.stringify({
          draft: false,
          name: version,
        }),
      })

      if (undraftRes.ok) {
        console.log('un-drafted canary release successfully')
      } else {
        console.log(`Failed to undraft`, await undraftRes.text())
      }
    } catch (err) {
      console.error(`Failed to undraft release`, err)
    }
  }
}

main()
