import execa from 'execa'
import semver from 'semver'
import { existsSync } from 'fs'
import { join } from 'path'
import { readdir, readFile } from 'fs/promises'

async function fetchTagsFromRegistry(packageName: string) {
  const res = await fetch(
    `https://registry.npmjs.org/-/package/${packageName}/dist-tags`
  )
  const tags = await res.json()
  return tags
}

async function getTag({
  name,
  version,
  latest,
}: {
  name: string
  version: string
  latest: string
}): Promise<string> {
  const preConfigPath = join(process.cwd(), '.changeset', 'pre.json')

  if (existsSync(preConfigPath)) {
    const { tag, mode } = JSON.parse(await readFile(preConfigPath, 'utf-8'))
    if (mode === 'pre') {
      if (!version.includes('-')) {
        throw new Error(
          `The changeset is in pre mode, but the version of "${name}@${version}" is not prerelease. It is likely a bug from versioning the packages.`
        )
      }

      return tag
    }
  }

  if (version.includes('-')) {
    throw new Error(
      `The changeset is not in pre mode, but the version of "${name}@${version}" is prerelease. It is likely a bug from versioning the packages.`
    )
  }

  // If the current version is less than the latest,
  // it means this is a backport release. Since NPM
  // sets the 'latest' tag by default during publishing,
  // when users install `next@latest`, they might get the
  // backported version instead of the actual "latest"
  // version. Hence, we explicitly set the tag as
  // 'stable' for backports.
  if (semver.lt(version, latest)) {
    return 'stable'
  }

  return 'latest'
}

async function publishNpm() {
  if (!process.env.NPM_TOKEN) {
    throw new Error('NPM_TOKEN is not set')
  }

  const packagesDir = join(process.cwd(), 'packages')
  const packageDirs = await readdir(packagesDir, {
    withFileTypes: true,
  })

  for (const packageDir of packageDirs) {
    if (!packageDir.isDirectory()) {
      continue
    }

    const pkgJson = JSON.parse(
      await readFile(
        join(process.cwd(), 'packages', packageDir.name, 'package.json'),
        'utf-8'
      )
    )

    if (pkgJson.private) {
      continue
    }

    const tags = await fetchTagsFromRegistry(pkgJson.name)
    // If the current version is already published in the
    // registry, skip the process.
    if (semver.eq(pkgJson.version, tags.latest)) {
      console.log(
        `Skipping ${pkgJson.name}@${pkgJson.version} because it is already published.`
      )
      continue
    }

    const tag = await getTag({
      name: pkgJson.name,
      version: pkgJson.version,
      latest: tags.latest,
    })

    const packagePath = join(packagesDir, packageDir.name)
    const args = ['publish', packagePath, '--tag', tag]

    console.log(
      `Running command: "pnpm ${args.join(' ')}" for ${pkgJson.name}@${pkgJson.version}`
    )
    await execa('pnpm', args, { stdio: 'inherit' })
  }
}

publishNpm()
