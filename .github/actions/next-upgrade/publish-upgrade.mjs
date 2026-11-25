import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import semver from 'semver'
import { candidateKey, normalizeUpgradePath } from './prepare-upgrade.mjs'

const oid = /^[a-f0-9]{40}$/
const candidateId = /^[a-f0-9]{24}$/
const author = 'github-actions[bot]'
const preparationFailureStages = new Set([
  'preflight',
  'assessment',
  'execution',
  'packaging',
])

// Carries a fixed message that is safe to print in the consumer's workflow log.
class PublishError extends Error {}

function requireValid(condition, message) {
  if (!condition) {
    throw new PublishError(message)
  }
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
  if (result.error || result.status !== 0) {
    throw new PublishError(`${command} ${args[0]} failed`)
  }
  return result.stdout
}

function gitAt(cwd, alternates) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('GIT_') && key !== 'GH_TOKEN' && key !== 'GITHUB_TOKEN'
    )
  )
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: author,
    GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
    GIT_COMMITTER_NAME: author,
    GIT_COMMITTER_EMAIL:
      '41898282+github-actions[bot]@users.noreply.github.com',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_ALLOW_PROTOCOL: 'file',
  })
  if (alternates) {
    env.GIT_ALTERNATE_OBJECT_DIRECTORIES = alternates
  }

  return (args, input) => run('git', args, { cwd, env, input })
}

function entries(git, tree) {
  const listing = git(['ls-tree', '-rz', tree])
  const decoded = listing.toString('utf8')
  requireValid(listing.equals(Buffer.from(decoded)), 'Non-UTF-8 Git path')

  return new Map(
    decoded
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf('\t')
        const [mode, , sha] = line.slice(0, tab).split(' ')
        return [line.slice(tab + 1), { mode, sha }]
      })
  )
}

function readBlob(git, entry) {
  requireValid(
    entry?.mode === '100644' || entry?.mode === '100755',
    'Expected a regular file'
  )
  return git(['cat-file', 'blob', entry.sha])
}

// Applies the prepared patch to the base tree in the scratch repository.
function applyPatch({ git, base, baseSha, patch }) {
  git(['read-tree', baseSha])
  git(['apply', '--cached', '--binary', '--whitespace=nowarn', '-'], patch)
  const tree = git(['write-tree']).toString().trim()
  const result = entries(git, tree)
  const changes = []
  for (const file of new Set([...base.keys(), ...result.keys()])) {
    const before = base.get(file)
    const after = result.get(file)
    if (before?.sha === after?.sha && before?.mode === after?.mode) {
      continue
    }
    // The publication token never writes workflows or submodules.
    requireValid(
      normalizeUpgradePath(file) === file &&
        !file
          .split('/')
          .some((part) => /^\.github$|^\.gitmodules$/i.test(part)),
      'Patch changes a protected path'
    )
    requireValid(
      (!before || before.mode === '100644' || before.mode === '100755') &&
        (!after || after.mode === (before?.mode ?? '100644')),
      'Patch changes a Git file mode that cannot be published'
    )
    changes.push({ path: file, entry: after })
  }
  requireValid(changes.length > 0, 'Empty candidate')
  return { tree, changes }
}

const signedCommitMutation = `
  mutation PublishNextUpgrade($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit {
        oid
        tree { oid }
        signature { isValid state }
      }
    }
  }
`

function publicationTransport({ git, github, repository, localRemote }) {
  const endpoint = `/repos/${repository}/git`
  const createRef = async (ref, sha) => {
    await github('POST', `${endpoint}/refs`, { ref, sha })
  }
  const readRef = async (ref) => {
    if (localRemote) {
      const output = git(['ls-remote', '--refs', localRemote, ref]).toString()
      const match = output
        .trimEnd()
        .split('\n')
        .find((line) => line.endsWith(`\t${ref}`))
      return match?.split('\t')[0] ?? null
    }

    const refs = await github(
      'GET',
      `${endpoint}/matching-refs/${ref.slice('refs/'.length)}`
    )
    return refs.find((entry) => entry.ref === ref)?.object?.sha ?? null
  }

  const verifyCommit = async ({ branch, sha, baseSha, tree, message }) => {
    requireValid(oid.test(sha), 'Invalid candidate branch head')
    if (localRemote) {
      git(['fetch', '--no-tags', '--no-write-fetch-head', localRemote, branch])
      const [actualTree, parents, actualAuthor, ...lines] = git([
        'show',
        '--no-patch',
        '--format=%T%n%P%n%an <%ae>%n%B',
        sha,
      ])
        .toString()
        .trimEnd()
        .split('\n')
      requireValid(
        tree === actualTree &&
          baseSha === parents &&
          actualAuthor ===
            `${author} <41898282+github-actions[bot]@users.noreply.github.com>` &&
          lines.join('\n') === message,
        'Unexpected local candidate branch commit'
      )
      return
    }

    const commit = await github('GET', `${endpoint}/commits/${sha}`)
    requireValid(
      commit.sha === sha &&
        commit.tree?.sha === tree &&
        commit.parents?.length === 1 &&
        commit.parents[0].sha === baseSha &&
        commit.message?.trimEnd() === message &&
        commit.verification?.verified === true &&
        commit.verification.reason === 'valid',
      'Unexpected GitHub candidate branch commit'
    )
  }

  const publishCommit = async ({
    branch,
    baseSha,
    tree,
    headline,
    marker,
    message,
    changes,
  }) => {
    if (localRemote) {
      const sha = git(['commit-tree', tree, '-p', baseSha, '-F', '-'], message)
        .toString()
        .trim()
      git([
        'push',
        `--force-with-lease=${branch}:`,
        localRemote,
        `${sha}:${branch}`,
      ])
      return sha
    }

    const additions = []
    const deletions = []
    for (const change of changes) {
      if (change.entry) {
        additions.push({
          path: change.path,
          contents: readBlob(git, change.entry).toString('base64'),
        })
      } else {
        deletions.push({ path: change.path })
      }
    }
    const response = await github('POST', '/graphql', {
      query: signedCommitMutation,
      variables: {
        input: {
          branch: {
            repositoryNameWithOwner: repository,
            branchName: branch.slice('refs/heads/'.length),
          },
          expectedHeadOid: baseSha,
          message: { headline, body: marker },
          fileChanges: { additions, deletions },
        },
      },
    })
    const commit = response?.data?.createCommitOnBranch?.commit
    requireValid(
      !response?.errors?.length &&
        oid.test(commit?.oid) &&
        commit.tree?.oid === tree &&
        commit.signature?.isValid === true &&
        commit.signature.state === 'VALID',
      'GitHub did not confirm the expected signed commit and tree'
    )
    return commit.oid
  }

  // Whether `head` still contains the prepared base commit.
  const containsBase = async (baseSha, head) => {
    if (localRemote) {
      try {
        git(['fetch', '--no-tags', '--no-write-fetch-head', localRemote, head])
        git(['merge-base', '--is-ancestor', baseSha, head])
        return true
      } catch {
        return false
      }
    }
    const comparison = await github(
      'GET',
      `/repos/${repository}/compare/${baseSha}...${head}`
    )
    return ['identical', 'ahead'].includes(comparison?.status)
  }

  return { createRef, readRef, verifyCommit, publishCommit, containsBase }
}

async function publishCandidate({
  candidate,
  verified,
  baseSha,
  baseBranch,
  repository,
  github,
  transport,
  localRemote,
}) {
  const { id, targets } = candidate
  // The tree names the branch, so a leftover branch from an earlier candidate
  // (for example after its pull request was merged) never blocks a new one.
  const branchPrefix = `next-upgrade/${id}-`
  const branchName = `${branchPrefix}${verified.tree.slice(0, 12)}`
  const branch = `refs/heads/${branchName}`
  const baseRef = `refs/heads/${baseBranch}`
  const endpoint = `/repos/${repository}/pulls`
  const marker = `<!-- next-upgrade-candidate:${id} -->`
  const headline = `Upgrade Next.js to ${targets[0].targetVersion}`
  const message = `${headline}\n\n${marker}`
  const query = new URLSearchParams({
    state: 'open',
    base: baseBranch,
    per_page: '100',
  })

  // One open pull request per app and policy, whatever its version.
  async function existingDraft() {
    const pulls = await github('GET', `${endpoint}?${query}`, undefined, {
      paginate: true,
    })
    requireValid(Array.isArray(pulls), 'GitHub did not list pull requests')
    // A pull request from a local `next upgrade --agent` carries only its own marker.
    const agentMarker = new RegExp(
      `^<!-- next-upgrade: [a-z-]+; path=${JSON.stringify(targets[0].path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} -->$`
    )
    const pull = pulls.find((candidatePull) => {
      const lines = candidatePull?.body?.split(/\r?\n/) ?? []
      return (
        candidatePull?.head?.repo?.full_name?.toLowerCase() ===
          repository.toLowerCase() &&
        ((lines.includes(marker) &&
          candidatePull.head.ref?.startsWith(branchPrefix)) ||
          lines.some((line) => agentMarker.test(line)))
      )
    })
    if (!pull) {
      return null
    }
    requireValid(
      typeof pull.html_url === 'string' && pull.html_url,
      'GitHub did not return the existing pull request URL'
    )
    return { status: 'existing_draft', url: pull.html_url }
  }

  // Other merges can land while the agent works; the pull request still applies
  // as long as the base branch contains the prepared commit.
  const checkBase = async () => {
    const current = await transport.readRef(baseRef)
    requireValid(
      current &&
        (current === baseSha ||
          (await transport.containsBase(baseSha, current))),
      'Base branch no longer contains the prepared commit'
    )
  }

  let existing = await existingDraft()
  if (existing) {
    return existing
  }

  await checkBase()
  let head = await transport.readRef(branch)
  existing = await existingDraft()
  if (existing) {
    return existing
  }

  if (!head && !localRemote) {
    try {
      await transport.createRef(branch, baseSha)
    } catch (error) {
      if (!(await transport.readRef(branch))) {
        throw error
      }
    }
    head = await transport.readRef(branch)
    requireValid(
      head,
      'GitHub did not confirm creation of the candidate branch'
    )
  }

  const expected = { branch, baseSha, tree: verified.tree, message }
  if (!head || (!localRemote && head === baseSha)) {
    await checkBase()
    try {
      head = await transport.publishCommit({
        ...expected,
        headline,
        marker,
        changes: verified.changes,
      })
    } catch (error) {
      // A competing publisher or a lost response may have left a complete candidate.
      const current = await transport.readRef(branch)
      if (!current || current === baseSha) {
        throw error
      }
      await transport.verifyCommit({ ...expected, sha: current })
      head = current
    }
  } else {
    await transport.verifyCommit({ ...expected, sha: head })
  }

  existing = await existingDraft()
  if (existing) {
    return existing
  }

  await checkBase()
  requireValid(
    (await transport.readRef(branch)) === head,
    'Candidate branch changed before the pull request opened'
  )
  const body = [
    marker,
    // The marker a local `next upgrade --agent` looks for in its duplicate check.
    ...targets.map(
      ({ path: app, policy }) =>
        `<!-- next-upgrade: ${policy}; path=${JSON.stringify(app)} -->`
    ),
    '',
    'Scheduled Next.js upgrade for:',
    '',
    ...targets.map(({ path: app, policy }) => `    ${app} (${policy})`),
  ].join('\n')
  let draft
  try {
    draft = await github('POST', endpoint, {
      base: baseBranch,
      head: branchName,
      title: headline,
      body,
    })
  } catch (error) {
    existing = await existingDraft()
    if (existing) {
      return existing
    }
    throw error
  }
  requireValid(
    typeof draft?.html_url === 'string' &&
      draft.html_url &&
      (!draft.head || draft.head.sha === head) &&
      (!draft.base || draft.base.ref === baseBranch),
    'GitHub did not confirm the candidate pull request'
  )
  return { status: 'new_draft', url: draft.html_url }
}

function validateCandidate(candidate, approved) {
  requireValid(
    typeof candidate?.id === 'string' &&
      candidateId.test(candidate.id) &&
      candidate.path === approved.path &&
      candidate.policy === approved.policy &&
      semver.valid(candidate.fromVersion) === candidate.fromVersion &&
      semver.valid(candidate.targetVersion) === candidate.targetVersion &&
      semver.gt(candidate.targetVersion, candidate.fromVersion) &&
      candidateKey(candidate) === candidate.id,
    'Unexpected candidate'
  )
}

function explain(paths, error) {
  console.error(
    `Could not publish ${paths.join(', ')}: ${
      error instanceof PublishError
        ? error.message
        : 'Unexpected publication error'
    }.`
  )
}

export async function publishUpgradeCandidate({
  root,
  artifactDirectory,
  appPath,
  policy,
  repository,
  baseBranch,
  github,
  gitRemote,
}) {
  const approved = { path: normalizeUpgradePath(appPath), policy }
  let index
  let outcome
  try {
    index = JSON.parse(
      readFileSync(path.join(artifactDirectory, 'index.json'), 'utf8')
    )
    requireValid(
      Array.isArray(index?.outcomes) &&
        index.outcomes.length === 1 &&
        Array.isArray(index.candidates),
      'Invalid publication index'
    )
    ;[outcome] = index.outcomes
    requireValid(
      isDeepStrictEqual(outcome?.paths, [approved.path]) &&
        ['no_upgrade', 'blocked', 'failed', 'prepared'].includes(
          outcome.status
        ),
      'Invalid publication index'
    )
  } catch (error) {
    explain([approved.path], error)
    return {
      outcomes: [
        {
          paths: [approved.path],
          status: 'failed',
          failureStage: 'publishing',
        },
      ],
    }
  }
  if (outcome.status !== 'prepared') {
    const result = { paths: outcome.paths, status: outcome.status }
    if (
      outcome.status === 'failed' &&
      preparationFailureStages.has(outcome.failureStage)
    ) {
      result.failureStage = outcome.failureStage
    }
    return { outcomes: [result] }
  }

  // A prepared outcome only changes on a confirmed pull request.
  const publication = {
    paths: outcome.paths,
    status: 'failed',
    failureStage: 'publishing',
  }
  const consumerGit = gitAt(root)
  let scratch
  try {
    requireValid(
      typeof github === 'function' &&
        /^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(repository),
      'Invalid GitHub repository'
    )
    consumerGit(['check-ref-format', `refs/heads/${baseBranch}`])
    requireValid(
      baseBranch && !baseBranch.startsWith('next-upgrade/'),
      'Invalid base branch'
    )
    const baseSha = consumerGit(['rev-parse', '--verify', 'HEAD^{commit}'])
      .toString()
      .trim()
    requireValid(
      baseSha === index.baseSha && oid.test(baseSha),
      'Unexpected base checkout'
    )
    requireValid(index.candidates.length === 1, 'Expected one candidate')
    const [candidate] = index.candidates
    validateCandidate(candidate, approved)

    const remote = gitRemote ?? 'origin'
    const remoteUrl =
      remote === 'origin'
        ? consumerGit(['remote', 'get-url', 'origin']).toString().trim()
        : remote
    let localRemote = null
    if (
      path.isAbsolute(remoteUrl) ||
      !/^(?:[a-z][a-z\d+.-]*:\/\/|[^/]+:)/i.test(remoteUrl)
    ) {
      requireValid(
        github !== githubCli,
        'Local Git remotes require an injected GitHub client'
      )
      localRemote = realpathSync(path.resolve(root, remoteUrl))
    } else {
      requireValid(
        remote === 'origin',
        'GitHub publication uses the default remote'
      )
    }

    scratch = mkdtempSync(path.join(tmpdir(), 'next-upgrade-publish-'))
    const objects = consumerGit([
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'objects',
    ])
      .toString()
      .trim()
    const git = gitAt(scratch, JSON.stringify(objects))
    git(['init', '--bare', '--template=', '--object-format=sha1'])
    const verified = applyPatch({
      git,
      base: entries(git, baseSha),
      baseSha,
      patch: readFileSync(
        path.join(artifactDirectory, `${candidate.id}.patch`)
      ),
    })
    Object.assign(
      publication,
      await publishCandidate({
        candidate: {
          id: candidate.id,
          targets: [{ ...approved, targetVersion: candidate.targetVersion }],
        },
        verified,
        baseSha,
        baseBranch,
        repository,
        github,
        transport: publicationTransport({
          git,
          github,
          repository,
          localRemote,
        }),
        localRemote,
      })
    )
    delete publication.failureStage
  } catch (error) {
    explain(publication.paths, error)
  } finally {
    if (scratch) {
      rmSync(scratch, { force: true, recursive: true })
    }
  }
  return { outcomes: [publication] }
}

async function githubCli(method, endpoint, body, { paginate = false } = {}) {
  requireValid(process.env.GH_TOKEN, 'Missing GitHub publication token')
  const args = ['api', '--method', method, endpoint]
  if (paginate) {
    args.push('--paginate', '--slurp')
  }
  if (body !== undefined) {
    args.push('--input', '-')
  }
  const result = run('gh', args, {
    input: body === undefined ? undefined : JSON.stringify(body),
  })
  let response
  try {
    response = JSON.parse(result.toString('utf8'))
  } catch {
    throw new PublishError('GitHub returned an invalid response')
  }
  return paginate ? response.flat() : response
}

function writeSummary({ outcomes }) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) {
    return
  }
  const statusLabels = {
    no_upgrade: 'Already up to date',
    blocked: 'Blocked',
    failed: 'Failed',
    existing_draft: 'Existing pull request',
    new_draft: 'New pull request',
  }
  const escape = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  const lines = outcomes.map(({ paths, status, failureStage, url }) => {
    const apps = paths.map((app) => `<code>${escape(app)}</code>`).join(', ')
    const stage = failureStage ? ` (${failureStage})` : ''
    const link = url ? ` <${url}>` : ''
    return `- ${statusLabels[status]}${stage} for ${apps}${link}`
  })
  appendFileSync(
    summaryPath,
    ['## Next.js upgrade', '', ...lines, ''].join('\n')
  )
}

async function main() {
  const resultPath = process.env.NEXT_UPGRADE_PUBLISH_RESULT
  requireValid(resultPath, 'Missing NEXT_UPGRADE_PUBLISH_RESULT')
  const appPath = process.env.NEXT_UPGRADE_APP_PATH ?? '.'
  let result
  try {
    result = await publishUpgradeCandidate({
      root: process.env.NEXT_UPGRADE_ROOT,
      artifactDirectory: process.env.NEXT_UPGRADE_ARTIFACT_DIR,
      appPath,
      policy: process.env.NEXT_UPGRADE_POLICY,
      repository: process.env.GITHUB_REPOSITORY,
      baseBranch: process.env.NEXT_UPGRADE_BASE_BRANCH,
      github: githubCli,
    })
  } catch {
    result = {
      outcomes: [
        { paths: [appPath], status: 'failed', failureStage: 'publishing' },
      ],
    }
  }
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`)
  writeSummary(result)
  if (result.outcomes.some(({ status }) => status === 'failed')) {
    console.error('The Next.js upgrade could not be published.')
    process.exitCode = 1
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main()
}
