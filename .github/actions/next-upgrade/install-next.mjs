// Install the locked script dependencies and the published Next.js package that
// matches the pinned workflow commit. Consumer runs never install or build the
// vercel/next.js monorepo.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const repository = process.env.WORKFLOW_REPOSITORY
const sha = process.env.WORKFLOW_SHA
const preview = process.env.PREVIEW_PACKAGE === 'true'
const depsOnly = process.env.NEXT_UPGRADE_DEPS_ONLY === 'true'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function npm(args) {
  execFileSync(
    'npm',
    [...args, '--ignore-scripts', '--no-audit', '--no-fund'],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
    }
  )
}

if (repository !== 'vercel/next.js' || !/^[0-9a-f]{40}$/.test(sha ?? '')) {
  fail('The reusable workflow must run from a vercel/next.js commit.')
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
if (head.trim() !== sha) {
  fail('The workflow scripts do not match the pinned commit.')
}

const { version } = JSON.parse(
  readFileSync(new URL('../../../packages/next/package.json', import.meta.url))
)
npm(['ci'])
if (depsOnly) {
  process.exit(0)
}
const { default: semver } = await import('semver')
if (semver.valid(version) !== version) {
  fail('The pinned commit has an invalid Next.js version.')
}

// The end-to-end test of unpublished commits uses the preview package built from this exact SHA.
npm([
  'install',
  '--no-save',
  '--no-package-lock',
  preview
    ? `https://vercel-packages.vercel.app/next/commits/${sha}/next`
    : `next@${version}`,
])
const installed = JSON.parse(
  readFileSync(new URL('node_modules/next/package.json', import.meta.url))
).version
const release = `${semver.major(version)}.${semver.minor(version)}.${semver.patch(version)}`
if (preview) {
  const built = installed.match(
    new RegExp(`^${release}-preview-([0-9a-f]{8})-\\d{8}$`)
  )?.[1]
  if (!built) {
    fail('The preview package is not a build of the pinned commit.')
  }
  // Pull request previews are built from GitHub's test merges, which start at
  // the current canary. Accept one only when its head parent is the pinned
  // commit and every file the pinned stack changes is identical in it.
  if (built !== sha.slice(0, 8)) {
    const api = async (path) => {
      const response = await fetch(
        `https://api.github.com/repos/vercel/next.js${path}`,
        {
          headers: process.env.GH_TOKEN
            ? { authorization: `Bearer ${process.env.GH_TOKEN}` }
            : {},
        }
      )
      return response.status === 404
        ? null
        : response.ok
          ? response.json()
          : fail('Could not check the preview package source.')
    }
    const commit = await api(`/commits/${built}`)
    const repo = await api('')
    const comparison = await api(
      `/compare/${encodeURIComponent(repo?.default_branch ?? '')}...${sha}`
    )
    const files = comparison?.files
    if (
      commit?.parents?.length !== 2 ||
      commit.parents[1].sha !== sha ||
      !Array.isArray(files) ||
      files.length === 0 ||
      // The compare API lists at most 300 files.
      files.length >= 300
    ) {
      fail(
        'The preview package was not built from the pinned commit. Wait for a new preview of the pinned commit.'
      )
    }
    for (const file of files) {
      const path = file.filename.split('/').map(encodeURIComponent).join('/')
      const content = await api(`/contents/${path}?ref=${commit.sha}`)
      if (
        file.status === 'removed'
          ? content !== null
          : content?.type !== 'file' || content.sha !== file.sha
      ) {
        fail(
          'The preview package was not built from the pinned commit. Wait for a new preview of the pinned commit.'
        )
      }
    }
  }
} else if (installed !== version) {
  fail('The installed Next.js package does not match the pinned commit.')
}
console.log(`Using Next.js ${installed}`)
