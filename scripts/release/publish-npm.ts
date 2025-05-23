import execa from 'execa'
import semver from 'semver'
import { existsSync } from 'fs'
import { join } from 'path'
import { readdir } from 'fs/promises'

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
    const { tag, mode } = require(preConfigPath)
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

  return 'latest'
}

async function publishNpm() {
  if (!process.env.NPM_TOKEN) {
    throw new Error('NPM_TOKEN is not set')
  }

  const packageDirs = await readdir(join(process.cwd(), 'packages'), {
    withFileTypes: true,
  })

  for (const packageDir of packageDirs) {
    if (!packageDir.isDirectory()) {
      continue
    }

    const pkgJson = require(
      join(process.cwd(), 'packages', packageDir.name, 'package.json')
    )

    if (pkgJson.private) {
      continue
    }

    const tags = await fetchTagsFromRegistry(pkgJson.name)
    // If the current version is already published in the
    // registry, skip the process.
    if (semver.eq(pkgJson.version, tags.latest)) {
      continue
    }

    const tag = await getTag({
      name: pkgJson.name,
      version: pkgJson.version,
      latest: tags.latest,
    })

    await execa('pnpm', ['publish', '--tag', tag], {
      stdio: 'inherit',
    })
  }
}

publishNpm()
