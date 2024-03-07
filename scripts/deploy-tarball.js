const path = require('path')
const execa = require('execa')
const fs = require('fs/promises')

const cwd = process.cwd()
const deployUrl = process.env.VERCEL_URL

async function main() {
  const deployDir = path.join(cwd, 'files')
  const publicDir = path.join(deployDir, 'public')

  await fs.mkdir(publicDir, { recursive: true })

  let nativePackagesDir = path.join(cwd, 'packages/next-swc/crates/napi/npm')
  let platforms = (await fs.readdir(nativePackagesDir)).filter(
    (name) => !name.startsWith('.')
  )

  const optionalDeps = {}

  await Promise.all(
    platforms.map(async (platform) => {
      let version = JSON.parse(
        await fs.readFile(path.join(cwd, 'lerna.json'))
      ).version

      let binaryName = `next-swc.${platform}.node`
      await fs.cp(
        path.join(cwd, 'packages/next-swc/native', binaryName),
        path.join(nativePackagesDir, platform, binaryName)
      )
      let pkg = JSON.parse(
        await fs.readFile(
          path.join(nativePackagesDir, platform, 'package.json')
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
      const tarballName = stdout.split('\n').pop().trim()
      await fs.rename(
        path.join(cwd, tarballName),
        path.join(publicDir, tarballName)
      )
      optionalDeps[pkg.name] = new URL(`/${tarballName}`, deployUrl).toString()
    })
  )

  const nextPkgJsonPath = path.join(cwd, 'packages/next/package.json')
  const nextPkg = JSON.parse(await fs.readFile(nextPkgJsonPath, 'utf8'))

  nextPkg.optionalDependencies = optionalDeps

  await fs.writeFile(nextPkgJsonPath, JSON.stringify(nextPkg, null, 2))

  const { stdout: nextPackStdout } = await execa(
    `npm`,
    [`pack`, `${path.join(cwd, 'packages/next')}`],
    { stdio: 'inherit' }
  )
  process.stdout.write(nextPackStdout)
  const nextTarballName = nextPackStdout.split('\n').pop().trim()
  await fs.rename(
    path.join(cwd, nextTarballName),
    path.join(publicDir, nextTarballName)
  )

  await execa('vercel', ['--scope', process.env.VERCEL_TEST_TEAM, '-y'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TOKEN: process.env.VERCEL_TEST_TOKEN,
    },
    cwd: deployDir,
  })
}

main().catch(console.error)
