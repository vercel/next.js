import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import { toolsDirectory, type Scenario } from './fixture'

const nameWithOwner = 'acme/member-dashboard'
const url = `https://github.com/${nameWithOwner}`
const remote = '/tmp/next-upgrade-remote.git'
const duplicateBranch = 'next-upgrade/latest'

// Duplicate-check cases give the app a GitHub origin with a remote branch that
// already performs the exact upgrade, and a read-only gh with its pull request.
// Only the pull request state differs: closed and stale, or open and current.
export async function setupRepository(
  sandbox: Sandbox,
  scenario: Scenario,
  run: (cmd: string, args: string[]) => Promise<string>
): Promise<void> {
  const duplicate = scenario.duplicate
  if (!duplicate) {
    return
  }
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  await run('git', ['init', '--bare', remote])
  await run('git', ['remote', 'add', 'origin', remote])
  await run('git', ['push', '--set-upstream', 'origin', branch])

  const date =
    duplicate === 'stale-branch'
      ? '2024-03-12T09:30:00Z'
      : new Date(Date.now() - 2 * 3600000).toISOString()
  const marker = `<!-- next-upgrade: ${scenario.policy}; path="." -->`
  const title = `Upgrade Next.js from ${scenario.sourceVersion} to ${scenario.targetVersion}`
  const body = `Upgrades Next.js to ${scenario.targetVersion} with \`next upgrade --agent=${scenario.policy}\`.\n\n${marker}`
  await run('git', ['checkout', '-b', duplicateBranch])
  await run('node', [
    '-e',
    `const fs = require('fs'); const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8')); manifest.dependencies.next = ${JSON.stringify(scenario.targetVersion)}; fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\\n')`,
  ])
  await run('git', ['add', 'package.json'])
  await run('sh', [
    '-c',
    'GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -m "$2" -m "$3"',
    'commit',
    date,
    title,
    marker,
  ])
  await run('git', ['push', 'origin', duplicateBranch])
  await run('git', ['checkout', branch])
  await run('git', ['branch', '-D', duplicateBranch])
  // Remote-tracking refs stay local. The agent sees a GitHub origin, and a
  // fetch fails fast like any other unavailable check.
  await run('git', ['remote', 'set-url', 'origin', `${url}.git`])

  const pullRequest =
    duplicate === 'stale-branch'
      ? { number: 7, state: 'CLOSED', closedAt: '2024-04-02T16:00:00Z' }
      : { number: 42, state: 'OPEN', closedAt: null }
  await sandbox.writeFiles({
    [join(toolsDirectory, 'gh.json')]: JSON.stringify({
      viewer: 'member-dashboard-dev',
      name: 'member-dashboard',
      nameWithOwner,
      url,
      defaultBranch: branch,
      pullRequests: [
        {
          ...pullRequest,
          title,
          body,
          url: `${url}/pull/${pullRequest.number}`,
          headRefName: duplicateBranch,
          baseRefName: branch,
          isDraft: false,
          author: { login: 'member-dashboard-dev' },
          createdAt: date,
          updatedAt: pullRequest.closedAt ?? date,
        },
      ],
    }),
    [join(toolsDirectory, 'gh.mjs')]: readFileSync(
      join(__dirname, 'gh.mjs'),
      'utf8'
    ),
    [join(toolsDirectory, 'bin/gh')]:
      `#!/bin/sh\nexec node ${toolsDirectory}/gh.mjs "$@"\n`,
  })
  await run('chmod', ['+x', join(toolsDirectory, 'bin/gh')])
}
