// @ts-check
const execa = require('execa')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

async function main() {
  const [
    commitSha,
    tarballDirectory = path.join(os.tmpdir(), 'vercel-nextjs-preview-tarballs'),
  ] = process.argv.slice(2)
  const repoRoot = path.resolve(__dirname, '..')

  await fs.mkdir(tarballDirectory, { recursive: true })

  const [{ stdout: shortSha }, { stdout: dateString }] = await Promise.all([
    execa('git', ['rev-parse', '--short', commitSha]),
    // Source: https://github.com/facebook/react/blob/767f52237cf7892ad07726f21e3e8bacfc8af839/scripts/release/utils.js#L114
    execa(`git`, [
      'show',
      '-s',
      '--no-show-signature',
      '--format=%cd',
      '--date=format:%Y%m%d',
      commitSha,
    ]),
  ])

  const lernaConfig = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'lerna.json'), 'utf8')
  )

  // 15.0.0-canary.17 -> 15.0.0
  // 15.0.0 -> 15.0.0
  const [semverStableVersion] = lernaConfig.version.split('-')
  const version = `${semverStableVersion}-preview-${shortSha}-${dateString}`
  console.info(`Designated version: ${version}`)

  const nativePackagesDir = path.join(
    repoRoot,
    'packages/next-swc/crates/napi/npm'
  )
  // For local testing, just specify your platform here e.g. `const platforms = ['darwin-arm64']` if you have an M-series MacBook.
  const platforms = (await fs.readdir(nativePackagesDir)).filter(
    (name) => !name.startsWith('.')
  )

  console.info(`Creating tarballs for next-swc packages`)
  const nextSwcPackageNames = new Set()
  await Promise.all(
    platforms.map(async (platform) => {
      const binaryName = `next-swc.${platform}.node`
      await fs.cp(
        path.join(repoRoot, 'packages/next-swc/native', binaryName),
        path.join(nativePackagesDir, platform, binaryName)
      )
      const manifest = JSON.parse(
        await fs.readFile(
          path.join(nativePackagesDir, platform, 'package.json'),
          'utf8'
        )
      )
      manifest.version = version
      await fs.writeFile(
        path.join(nativePackagesDir, platform, 'package.json'),
        JSON.stringify(manifest, null, 2) + '\n'
      )
      const { stdout } = await execa(
        'npm',
        ['pack', '--pack-destination', tarballDirectory],
        {
          cwd: path.join(nativePackagesDir, platform),
        }
      )
      // tarball name is printed as the last line of npm-pack
      const tarballName = stdout.trim().split('\n').pop()
      console.info(
        `Created tarball ${path.join(tarballDirectory, tarballName)}`
      )

      nextSwcPackageNames.add(manifest.name)
    })
  )

  const lernaListJson = await execa('pnpm', [
    '--silent',
    'lerna',
    'list',
    '--json',
  ])
  const packages = JSON.parse(lernaListJson.stdout)
  const packagesByVersion = new Map()
  for (const packageInfo of packages) {
    packagesByVersion.set(
      packageInfo.name,
      `https://vercel-packages.vercel.app/repos/vercel/next.js/${commitSha}/${packageInfo.name}`
    )
  }
  for (const nextSwcPackageName of nextSwcPackageNames) {
    packagesByVersion.set(
      nextSwcPackageName,
      `https://vercel-packages.vercel.app/repos/vercel/next.js/${commitSha}/${nextSwcPackageName}`
    )
  }

  console.info(`Creating tarballs for regular packages`)
  for (const packageInfo of packages) {
    if (packageInfo.private) {
      continue
    }

    const packageJsonPath = path.join(packageInfo.location, 'package.json')
    const packageJson = await fs.readFile(packageJsonPath, 'utf8')
    const manifest = JSON.parse(packageJson)

    manifest.version = version

    if (packageInfo.name === 'next') {
      manifest.optionalDependencies ??= {}
      for (const nextSwcPackageName of nextSwcPackageNames) {
        manifest.optionalDependencies[nextSwcPackageName] =
          packagesByVersion.get(nextSwcPackageName)
      }
    }

    // ensure it depends on packages from this release.
    for (const [dependencyName, version] of packagesByVersion) {
      if (manifest.dependencies?.[dependencyName] !== undefined) {
        manifest.dependencies[dependencyName] = version
      }
      if (manifest.devDependencies?.[dependencyName] !== undefined) {
        manifest.devDependencies[dependencyName] = version
      }
      if (manifest.peerDependencies?.[dependencyName] !== undefined) {
        manifest.peerDependencies[dependencyName] = version
      }
      if (manifest.optionalDependencies?.[dependencyName] !== undefined) {
        manifest.optionalDependencies[dependencyName] = version
      }
    }

    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(manifest, null, 2) +
        // newline will be added by Prettier
        '\n'
    )

    const { stdout } = await execa(
      'npm',
      ['pack', '--pack-destination', tarballDirectory],
      {
        cwd: packageInfo.location,
      }
    )
    // tarball name is printed as the last line of npm-pack
    const tarballName = stdout.trim().split('\n').pop()
    console.info(`Created tarball ${path.join(tarballDirectory, tarballName)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
