// @ts-check
const path = require('path')
const execa = require('execa')
const fs = require('fs/promises')

const cwd = process.cwd()

async function main() {
  const [commitSha] = process.argv.slice(2)
  const [shortSha, dateString] = await Promise.all([
    execa('git', ['rev-parse', '--short', commitSha]),
    // Source: https://github.com/facebook/react/blob/767f52237cf7892ad07726f21e3e8bacfc8af839/scripts/release/utils.js#L114
    execa(
      `git show -s --no-show-signature --format=%cd --date=format:%Y%m%d ${commitSha}`
    ),
  ])

  const deployDir = path.join(cwd, 'files')
  const publicDir = path.join(deployDir, 'public')
  await fs.mkdir(publicDir, { recursive: true })
  await fs.writeFile(
    path.join(deployDir, 'package.json'),
    JSON.stringify({
      name: 'files',
      dependencies: {},
      scripts: {
        build: 'node inject-deploy-url.js',
      },
    })
  )
  await fs.copyFile(
    path.join(cwd, 'scripts/inject-deploy-url.js'),
    path.join(deployDir, 'inject-deploy-url.js')
  )

  let nativePackagesDir = path.join(cwd, 'packages/next-swc/crates/napi/npm')
  let platforms = (await fs.readdir(nativePackagesDir)).filter(
    (name) => !name.startsWith('.')
  )

  const optionalDeps = {}
  const { version: currentVersion } = JSON.parse(
    await fs.readFile(path.join(cwd, 'lerna.json'), 'utf8')
  )
  // 15.0.0-canary.17 -> 15.0.0
  // 15.0.0 -> 15.0.0
  const [semverStableVersion] = currentVersion.split('-')
  const version = `${semverStableVersion}-preview-${shortSha}-${dateString}`

  await Promise.all(
    platforms.map(async (platform) => {
      let binaryName = `next-swc.${platform}.node`
      await fs.cp(
        path.join(cwd, 'packages/next-swc/native', binaryName),
        path.join(nativePackagesDir, platform, binaryName)
      )
      let pkg = JSON.parse(
        await fs.readFile(
          path.join(nativePackagesDir, platform, 'package.json'),
          'utf8'
        )
      )
      pkg.version = version
      await fs.writeFile(
        path.join(nativePackagesDir, platform, 'package.json'),
        JSON.stringify(pkg, null, 2)
      )
      const { stdout } = await execa(`npm`, [
        `pack`,
        `${path.join(nativePackagesDir, platform)}`,
      ])
      process.stdout.write(stdout)
      const tarballName = stdout.split('\n').pop()?.trim() || ''
      await fs.rename(
        path.join(cwd, tarballName),
        path.join(publicDir, tarballName)
      )
      optionalDeps[pkg.name] = `https://DEPLOY_URL/${tarballName}`
    })
  )

  const nextPkgJsonPath = path.join(cwd, 'packages/next/package.json')
  const nextPkg = JSON.parse(await fs.readFile(nextPkgJsonPath, 'utf8'))

  nextPkg.optionalDependencies = optionalDeps

  await fs.writeFile(nextPkgJsonPath, JSON.stringify(nextPkg, null, 2))

  const { stdout: nextPackStdout } = await execa(`npm`, [
    `pack`,
    `${path.join(cwd, 'packages/next')}`,
  ])
  process.stdout.write(nextPackStdout)
  const nextTarballName = nextPackStdout.split('\n').pop()?.trim() || ''
  await fs.rename(
    path.join(cwd, nextTarballName),
    path.join(publicDir, nextTarballName)
  )

  await fs.writeFile(
    path.join(deployDir, 'vercel.json'),
    JSON.stringify(
      {
        version: 2,
        rewrites: [
          {
            source: '/next.tgz',
            destination: `/${nextTarballName}`,
          },
        ],
      },
      null,
      2
    )
  )
  const vercelConfigDir = path.join(cwd, '.vercel')

  if (process.env.VERCEL_TEST_TOKEN) {
    await fs.mkdir(vercelConfigDir)
    await fs.writeFile(
      path.join(vercelConfigDir, 'auth.json'),
      JSON.stringify({
        token: process.env.VERCEL_TEST_TOKEN,
      })
    )
    await fs.writeFile(
      path.join(vercelConfigDir, 'config.json'),
      JSON.stringify({})
    )
    console.log('wrote config to', vercelConfigDir)
  }

  const child = execa(
    'vercel',
    [
      '--scope',
      process.env.VERCEL_TEST_TEAM || '',
      '--global-config',
      vercelConfigDir,
      '-y',
    ],
    {
      cwd: deployDir,
    }
  )
  let deployOutput = ''
  const handleData = (type) => (chunk) => {
    process[type].write(chunk)

    // only want stdout since that's where deployment URL
    // is sent to
    if (type === 'stdout') {
      deployOutput += chunk.toString()
    }
  }
  child.stdout?.on('data', handleData('stdout'))
  child.stderr?.on('data', handleData('stderr'))

  await child

  const deployUrl = deployOutput.trim()
  console.log(`\n\nNext.js tarball: ${deployUrl.trim()}/next.tgz`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
