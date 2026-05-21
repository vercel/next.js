// @ts-check
const execa = require('execa')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

async function main() {
  const [
    githubHeadSha,
    tarballDirectory = path.join(os.tmpdir(), 'vercel-nextjs-preview-tarballs'),
    baseUrlArg,
  ] = process.argv.slice(2)
  const baseUrl = baseUrlArg || 'https://vercel-packages.vercel.app/next'
  const repoRoot = path.resolve(__dirname, '..')

  await fs.mkdir(tarballDirectory, { recursive: true })

  // The preview version is set in packages/next/package.json by
  // scripts/set-preview-version.js before the build step.
  const nextPackageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'packages/next/package.json'), 'utf8')
  )
  const version = nextPackageJson.version
  console.info(`Designated version: ${version}`)

  const nativePackagesDir = path.join(repoRoot, 'crates/next-napi-bindings/npm')
  const platforms = (await fs.readdir(nativePackagesDir)).filter(
    (name) => !name.startsWith('.')
  )

  console.info(`Creating tarballs for next-swc packages`)
  const nextSwcPackageNames = new Set()
  await Promise.all(
    platforms.map(async (platform) => {
      const binaryName = `next-swc.${platform}.node`
      try {
        await fs.cp(
          path.join(repoRoot, 'packages/next-swc/native', binaryName),
          path.join(nativePackagesDir, platform, binaryName)
        )
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn(
            `Skipping next-swc platform '${platform}' tarball creation because ${binaryName} was never built.`
          )
          return
        }
        throw error
      }
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
      // By encoding the package name in the directory, vercel-packages can later extract the package name of a tarball from its path when `tarballDirectory` is zipped.
      const packDestination = path.join(tarballDirectory, manifest.name)
      await fs.mkdir(packDestination, { recursive: true })
      const { stdout } = await execa(
        'npm',
        ['pack', '--pack-destination', packDestination],
        {
          cwd: path.join(nativePackagesDir, platform),
        }
      )
      // tarball name is printed as the last line of npm-pack
      const tarballName = stdout.trim().split('\n').pop()
      console.info(`Created tarball ${path.join(packDestination, tarballName)}`)

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
  // vercel-packages finds GH artifacts via the head SHA because that's the only
  // API GitHub offers.
  for (const packageInfo of packages) {
    packagesByVersion.set(
      packageInfo.name,
      `${baseUrl}/commits/${githubHeadSha}/${packageInfo.name}`
    )
  }
  for (const nextSwcPackageName of nextSwcPackageNames) {
    packagesByVersion.set(
      nextSwcPackageName,
      `${baseUrl}/commits/${githubHeadSha}/${nextSwcPackageName}`
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

    // By encoding the package name in the directory, vercel-packages can later extract the package name of a tarball from its path when `tarballDirectory` is zipped.
    const packDestination = path.join(tarballDirectory, manifest.name)
    await fs.mkdir(packDestination, { recursive: true })
    const { stdout } = await execa(
      'npm',
      ['pack', '--pack-destination', packDestination],
      {
        cwd: packageInfo.location,
      }
    )
    // tarball name is printed as the last line of npm-pack
    const tarballName = stdout.trim().split('\n').pop()
    console.info(`Created tarball ${path.join(packDestination, tarballName)}`)
  }

  console.info(
    `A upload_preview_tarballs (https://github.com/vercel/next.js/actions/workflows/upload_preview_tarballs.yml) will be started once this workflow completes which will make the Next.js preview build available under ${packagesByVersion.get('next')}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
