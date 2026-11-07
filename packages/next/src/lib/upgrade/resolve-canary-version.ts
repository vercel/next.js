import { gt, prerelease, valid } from 'next/dist/compiled/semver'
import type { PackageManager } from '../helpers/get-pkg-manager'
import { queryReleaseMetadata, readReleaseAgePolicy } from './release-age'

export async function resolveCanaryVersion(context: {
  directory: string
  packageManager: PackageManager
}): Promise<string> {
  const policy = await readReleaseAgePolicy(context)
  if (policy === null) {
    try {
      const response = await fetch('https://registry.npmjs.org/next/canary', {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
        redirect: 'error',
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const { version } = await response.json()
      if (
        typeof version !== 'string' ||
        valid(version) !== version ||
        prerelease(version)?.[0] !== 'canary'
      ) {
        throw new Error('Invalid canary version')
      }
      return version
    } catch (error) {
      throw new Error('Could not fetch the latest Next.js canary from npm.', {
        cause: error,
      })
    }
  }

  let metadata
  try {
    const parsed = JSON.parse(
      await queryReleaseMetadata({
        ...context,
        packageManagerVersion: policy.packageManagerVersion,
      })
    )
    metadata = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed
  } catch {
    throw new Error('Could not read Next.js release metadata.')
  }
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    !Array.isArray(metadata.versions) ||
    (metadata.time !== undefined &&
      (!metadata.time ||
        typeof metadata.time !== 'object' ||
        Array.isArray(metadata.time)))
  ) {
    throw new Error('Invalid Next.js release metadata.')
  }
  const tag = metadata['dist-tags']?.canary
  if (
    typeof tag !== 'string' ||
    valid(tag) !== tag ||
    prerelease(tag)?.[0] !== 'canary'
  ) {
    throw new Error('Invalid Next.js canary tag.')
  }

  let selected: string | null = null
  for (const version of metadata.versions) {
    if (
      typeof version !== 'string' ||
      valid(version) !== version ||
      prerelease(version)?.[0] !== 'canary' ||
      gt(version, tag)
    ) {
      continue
    }
    const timestamp = metadata.time?.[version]
    const publishedAt =
      typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
    const eligible =
      policy.isExcluded(version) ||
      (Number.isFinite(publishedAt) && publishedAt <= policy.publishedBefore)
    if (eligible && (selected === null || gt(version, selected))) {
      selected = version
    }
  }
  if (selected === null) {
    throw new Error(
      'No Next.js canary satisfies the package manager release-age policy.'
    )
  }
  return selected
}
