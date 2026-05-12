// @ts-check

/**
 * Verifies that the `playwright` (and `playwright-chromium`) version pinned in
 * `package.json` matches the `mcr.microsoft.com/playwright:vX.Y.Z-*` image tag
 * used by `.github/workflows/build_reusable.yml` for Linux CI jobs.
 *
 * Bumping `playwright` in `package.json` without updating the image tag would
 * cause Playwright at runtime to look for a browser revision that does not
 * exist in the container, with a confusing "Executable doesn't exist" error
 * deep in the test run. Failing the lint job here surfaces the mismatch as a
 * single, obvious CI error instead.
 *
 * Run via `node scripts/check-playwright-image-version.mjs`.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const packageJsonPath = path.join(repoRoot, 'package.json')
const workflowPath = path.join(
  repoRoot,
  '.github',
  'workflows',
  'build_reusable.yml'
)

/** @returns {never} */
function fail(message) {
  console.error(
    `::error file=${path.relative(repoRoot, workflowPath)}::${message}`
  )
  console.error(message)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

// Both deps are pinned to exact versions in package.json (no ^/~). If that
// changes we want to know.
const expectedDeps = ['playwright', 'playwright-chromium']
const pkgVersions = new Map()
for (const name of expectedDeps) {
  const version = pkg.devDependencies?.[name] ?? pkg.dependencies?.[name]
  if (!version) {
    fail(`Expected \`${name}\` to be listed in package.json but it is missing.`)
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(
      `Expected \`${name}\` to be pinned to an exact x.y.z version in package.json, got ${JSON.stringify(version)}.`
    )
  }
  pkgVersions.set(name, version)
}

const playwrightVersion = pkgVersions.get('playwright')
for (const [name, version] of pkgVersions) {
  if (version !== playwrightVersion) {
    fail(
      `\`${name}\` is pinned to ${version} but \`playwright\` is pinned to ${playwrightVersion}; the Docker image needs a single source of truth.`
    )
  }
}

const workflowSource = readFileSync(workflowPath, 'utf8')
// Pulls the default value out of the `playwrightDockerImage` input. The
// regex is intentionally loose so a future quoting change still matches.
const match = workflowSource.match(
  /playwrightDockerImage:[\s\S]*?default:\s*['"](mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)(?:-[a-z0-9]+)?)['"]/
)
if (!match) {
  fail(
    `Could not locate the \`playwrightDockerImage\` default in ${path.relative(repoRoot, workflowPath)}. ` +
      `Either the input was renamed or its default value uses an unexpected format.`
  )
}

const [, fullImage, imageVersion] = match
// Preserve the existing OS suffix (e.g. `-noble`) so a bump only changes
// the playwright version, not the base OS that ships glibc.
const suffixMatch = fullImage.match(
  /^mcr\.microsoft\.com\/playwright:v[^-]+(-[a-z0-9]+)?$/
)
const osSuffix = suffixMatch?.[1] ?? '-noble'

if (imageVersion !== playwrightVersion) {
  fail(
    `Playwright Docker image tag drift detected:\n` +
      `  package.json playwright = ${playwrightVersion}\n` +
      `  ${path.relative(repoRoot, workflowPath)} image = ${fullImage}\n\n` +
      `Update the \`playwrightDockerImage\` default in ${path.relative(repoRoot, workflowPath)} ` +
      `to \`mcr.microsoft.com/playwright:v${playwrightVersion}${osSuffix}\` (or run the equivalent edit) ` +
      `so the container has the matching browser binaries baked in.`
  )
}

console.log(
  `Playwright image tag ${fullImage} matches package.json playwright@${playwrightVersion}.`
)
