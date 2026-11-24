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
import yaml from 'js-yaml'
import semver from 'semver'
import { candidateKey, normalizeUpgradePath } from './prepare-upgrade.mjs'

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]
const oid = /^[a-f0-9]{40}$/
const candidateId = /^[a-f0-9]{24}$/
const author = 'github-actions[bot]'
const preparationFailureStages = new Set([
  'preflight',
  'assessment',
  'execution',
  'verification',
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

function contains(directory, file) {
  return (
    directory === '.' || file === directory || file.startsWith(`${directory}/`)
  )
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

function nextDeclarations(manifest) {
  return dependencyFields
    .filter((field) => Object.hasOwn(manifest[field] ?? {}, 'next'))
    .map((field) => ({ field, specifier: manifest[field].next }))
}

function catalogReference(specifier) {
  if (typeof specifier === 'string' && specifier.startsWith('catalog:')) {
    const name = specifier.slice('catalog:'.length)
    return name === '' || name === 'default' ? null : name
  }
  return undefined
}

function resolvedPnpmNext(lock, importer, declarations) {
  const versions = new Set()
  for (const field of dependencyFields) {
    const entry = lock.importers?.[importer]?.[field]?.next
    if (entry !== undefined) {
      requireValid(
        typeof entry === 'string' ||
          declarations.some(({ specifier }) => specifier === entry?.specifier),
        'Lockfile does not match the Next.js declaration'
      )
      const version = typeof entry === 'string' ? entry : entry?.version
      requireValid(
        typeof version === 'string',
        'Missing Next.js lockfile version'
      )
      const release = version.split('(')[0]
      requireValid(
        (!lock.packages || Object.hasOwn(lock.packages, `next@${release}`)) &&
          (!lock.snapshots || Object.hasOwn(lock.snapshots, `next@${version}`)),
        'Missing Next.js package or snapshot in the lockfile'
      )
      versions.add(release)
    }
  }
  return versions.size === 1 ? [...versions][0] : null
}

// A peer-only catalog member follows its consumers. With
// `autoInstallPeers: false` pnpm does not lock it, as preparation allows.
function unlockedPeer(lock, importer, declarations) {
  return (
    declarations.length > 0 &&
    declarations.every(({ field }) => field === 'peerDependencies') &&
    !dependencyFields.some(
      (field) => lock.importers?.[importer]?.[field]?.next !== undefined
    )
  )
}

function verifyVersion(specifier, version) {
  requireValid(
    typeof specifier === 'string' &&
      semver.minVersion(specifier)?.version === version &&
      semver.satisfies(version, specifier),
    'Next.js declaration does not match the candidate version'
  )
}

function omit(record, ...keys) {
  const result = { ...record }
  for (const key of keys) {
    delete result[key]
  }
  return result
}

function catalogEntry(document, name) {
  return name === null
    ? document.catalog?.next
    : document.catalogs?.[name]?.next
}

function omitWorkspaceNext(document, name) {
  if (name === null) {
    return { ...document, catalog: omit(document.catalog, 'next') }
  }
  return {
    ...document,
    catalogs: {
      ...document.catalogs,
      [name]: omit(document.catalogs?.[name], 'next'),
    },
  }
}

function withoutLockCatalogNext(catalogs, name) {
  const key = name ?? 'default'
  return { ...catalogs, [key]: omit(catalogs?.[key], 'next') }
}

function lockReachability(lock, selectedImporters) {
  const packages = new Set()
  const snapshots = new Set()
  const pending = []
  function addDependencies(record) {
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      for (const [name, dependency] of Object.entries(record?.[field] ?? {})) {
        const version =
          typeof dependency === 'string' ? dependency : dependency?.version
        if (typeof version !== 'string' || version.startsWith('link:')) {
          continue
        }
        const direct = `${name}@${version}`
        // Aliased dependencies may store the full package key in version.
        pending.push(
          Object.hasOwn(lock.snapshots ?? {}, version) ||
            Object.hasOwn(lock.packages ?? {}, version)
            ? version
            : direct
        )
      }
    }
  }

  for (const importer of selectedImporters) {
    addDependencies(lock.importers?.[importer])
  }
  while (pending.length > 0) {
    const key = pending.pop()
    if (snapshots.has(key)) {
      continue
    }
    snapshots.add(key)
    packages.add(key.split('(')[0])
    addDependencies(lock.snapshots?.[key])
  }
  return { packages, snapshots }
}

function verifyPnpmLock(before, after, approved, catalog, targetVersion) {
  requireValid(
    isDeepStrictEqual(
      omit(before, 'importers', 'catalogs', 'packages', 'snapshots'),
      omit(after, 'importers', 'catalogs', 'packages', 'snapshots')
    ) &&
      isDeepStrictEqual(
        omit(before.importers, ...approved),
        omit(after.importers, ...approved)
      ),
    'Lockfile changes outside approved importers'
  )

  if (catalog) {
    const name = catalog.name ?? 'default'
    const entry = after.catalogs?.[name]?.next
    requireValid(
      isDeepStrictEqual(
        withoutLockCatalogNext(before.catalogs, catalog.name),
        withoutLockCatalogNext(after.catalogs, catalog.name)
      ) && entry?.version === targetVersion,
      'Lockfile changes outside the approved catalog entry'
    )
  } else {
    requireValid(
      isDeepStrictEqual(before.catalogs, after.catalogs),
      'Unexpected lockfile catalog change'
    )
  }

  const oldReachable = lockReachability(before, approved)
  const newReachable = lockReachability(after, approved)
  const unselected = lockReachability(
    before,
    Object.keys(before.importers ?? {}).filter(
      (importer) => !approved.has(importer)
    )
  )
  for (const section of ['packages', 'snapshots']) {
    const oldEntries = before[section] ?? {}
    const newEntries = after[section] ?? {}
    for (const key of new Set([
      ...Object.keys(oldEntries),
      ...Object.keys(newEntries),
    ])) {
      if (!isDeepStrictEqual(oldEntries[key], newEntries[key])) {
        requireValid(
          !unselected[section].has(key) &&
            (!Object.hasOwn(oldEntries, key) ||
              oldReachable[section].has(key)) &&
            (!Object.hasOwn(newEntries, key) || newReachable[section].has(key)),
          'Lockfile changes outside approved dependency graphs'
        )
      }
    }
  }
}

function nearestFile(directory, base, name) {
  let current = directory
  for (;;) {
    const file = path.posix.join(current, name)
    if (base.has(file)) {
      return file
    }
    if (current === '.') {
      return null
    }
    current = path.posix.dirname(current)
  }
}

function readLock(git, tree, lockfile) {
  const documents = yaml.loadAll(
    readBlob(git, tree.get(lockfile)).toString('utf8'),
    {
      schema: yaml.CORE_SCHEMA,
    }
  )
  requireValid(documents.at(-1)?.importers, 'Unsupported pnpm lockfile')
  return documents
}

function validatePatch({ git, base, baseSha, patch, candidate }) {
  git(['read-tree', baseSha])
  git(['apply', '--cached', '--binary', '--whitespace=nowarn', '-'], patch)
  const tree = git(['write-tree']).toString().trim()
  const result = entries(git, tree)
  const changes = []
  const roots = new Set([
    ...candidate.targets.map(({ path: app }) => app),
    ...candidate.supportingPaths,
  ])
  const directories = [...base.keys()]
    .filter((file) => path.posix.basename(file) === 'package.json')
    .map((file) => path.posix.dirname(file))
    .sort((a, b) => b.length - a.length)
  const workspaceFiles = new Set()
  const lockfile = nearestFile(
    candidate.targets[0].path,
    base,
    'pnpm-lock.yaml'
  )
  const workspaceFile = nearestFile(
    candidate.targets[0].path,
    base,
    'pnpm-workspace.yaml'
  )
  const lockRoot = path.posix.dirname(
    lockfile ?? path.posix.join(candidate.targets[0].path, 'package.json')
  )
  requireValid(
    (candidate.workspaceRoot === undefined ||
      candidate.workspaceRoot === lockRoot) &&
      (!workspaceFile || path.posix.dirname(workspaceFile) === lockRoot) &&
      [...roots].every(
        (app) =>
          nearestFile(app, base, 'pnpm-lock.yaml') === lockfile &&
          nearestFile(app, base, 'pnpm-workspace.yaml') === workspaceFile
      ),
    'Candidate workspace does not match the base tree'
  )

  if (lockfile) {
    workspaceFiles.add(lockfile)
  }
  if (workspaceFile && candidate.catalog) {
    workspaceFiles.add(workspaceFile)
  }

  for (const file of new Set([...base.keys(), ...result.keys()])) {
    const before = base.get(file)
    const after = result.get(file)
    if (before?.sha === after?.sha && before?.mode === after?.mode) {
      continue
    }
    const basename = path.posix.basename(file)
    const owner = directories.find((directory) => contains(directory, file))
    requireValid(
      normalizeUpgradePath(file) === file &&
        !file
          .split('/')
          .some((part) => /^\.github$|^\.gitmodules$/i.test(part)) &&
        !(
          lockfile &&
          path.posix.dirname(file) === lockRoot &&
          ['.npmrc', '.pnpmfile.cjs', 'pnpmfile.cjs'].includes(basename)
        ) &&
        (workspaceFiles.has(file) ||
          (roots.has(owner) &&
            basename !== 'pnpm-workspace.yaml' &&
            basename !== 'pnpm-lock.yaml')),
      'Patch changes a path outside the approved scope'
    )
    requireValid(
      (!before || before.mode === '100644' || before.mode === '100755') &&
        (!after || after.mode === (before?.mode ?? '100644')),
      'Patch changes a Git file mode that cannot be published'
    )
    changes.push({ path: file, entry: after })
  }
  requireValid(changes.length > 0, 'Empty candidate')

  const manifest = (snapshot, app) =>
    JSON.parse(
      readBlob(
        git,
        snapshot.get(path.posix.join(app, 'package.json'))
      ).toString('utf8')
    )
  const oldLock = lockfile ? readLock(git, base, lockfile) : []
  const newLock = lockfile ? readLock(git, result, lockfile) : []
  const importer = (app) => path.posix.relative(lockRoot, app) || '.'
  const targetVersion = candidate.targets[0].targetVersion
  if (lockfile && workspaceFile && roots.has(lockRoot)) {
    const sharedFields = [
      'name',
      'packageManager',
      'workspaces',
      'pnpm',
      'resolutions',
      'overrides',
    ]
    const previous = manifest(base, lockRoot)
    const updated = manifest(result, lockRoot)
    requireValid(
      sharedFields.every((field) =>
        isDeepStrictEqual(previous[field], updated[field])
      ),
      'Patch changes workspace settings in the root manifest'
    )
  }

  if (candidate.catalog) {
    requireValid(
      lockfile &&
        workspaceFile &&
        path.posix.dirname(workspaceFile) === lockRoot,
      'Missing pnpm workspace catalog'
    )
    const parseWorkspace = (snapshot) =>
      yaml.load(readBlob(git, snapshot.get(workspaceFile)).toString('utf8'), {
        schema: yaml.CORE_SCHEMA,
      })
    const before = parseWorkspace(base)
    const after = parseWorkspace(result)
    const { name } = candidate.catalog
    requireValid(
      typeof catalogEntry(before, name) === 'string' &&
        isDeepStrictEqual(
          omitWorkspaceNext(before, name),
          omitWorkspaceNext(after, name)
        ),
      'Workspace changes outside the approved catalog entry'
    )
    verifyVersion(catalogEntry(after, name), targetVersion)

    // Inspect tracked manifests within this workspace, including packages
    // without a lockfile importer, before accepting a shared declaration change.
    const members = new Set()
    const manifestPath = (app) => path.posix.join(app, 'package.json')
    for (const app of new Set([
      ...directories,
      ...changes
        .filter(
          ({ path: file }) => path.posix.basename(file) === 'package.json'
        )
        .map(({ path: file }) => path.posix.dirname(file)),
    ])) {
      if (
        !contains(lockRoot, app) ||
        nearestFile(app, base, 'pnpm-workspace.yaml') !== workspaceFile
      ) {
        continue
      }
      const beforeDeclarations = base.has(manifestPath(app))
        ? nextDeclarations(manifest(base, app))
        : []
      const afterDeclarations = result.has(manifestPath(app))
        ? nextDeclarations(manifest(result, app))
        : []
      if (
        beforeDeclarations.some(
          ({ specifier }) => catalogReference(specifier) === name
        )
      ) {
        members.add(app)
        requireValid(
          beforeDeclarations.every(
            ({ specifier }) => catalogReference(specifier) === name
          ) &&
            isDeepStrictEqual(beforeDeclarations, afterDeclarations) &&
            (resolvedPnpmNext(
              newLock.at(-1),
              importer(app),
              afterDeclarations
            ) === targetVersion ||
              unlockedPeer(newLock.at(-1), importer(app), afterDeclarations)),
          'Catalog member does not resolve the approved version'
        )
      }
      if (
        afterDeclarations.some(
          ({ specifier }) => catalogReference(specifier) === name
        )
      ) {
        requireValid(members.has(app), 'Patch adds a catalog consumer')
      }
    }
    requireValid(
      isDeepStrictEqual(members, roots),
      'Catalog members differ from the approved group'
    )
  }

  for (const target of candidate.targets) {
    const before = nextDeclarations(manifest(base, target.path))
    const after = nextDeclarations(manifest(result, target.path))
    requireValid(before.length && after.length, 'Missing Next.js declaration')
    if (lockfile) {
      requireValid(
        resolvedPnpmNext(oldLock.at(-1), importer(target.path), before) ===
          target.fromVersion &&
          resolvedPnpmNext(newLock.at(-1), importer(target.path), after) ===
            targetVersion,
        'Next.js lockfile version differs from the candidate'
      )
    }

    if (!candidate.catalog) {
      requireValid(
        before.every(
          ({ specifier }) =>
            catalogReference(specifier) === undefined &&
            semver.satisfies(target.fromVersion, specifier)
        ) && !isDeepStrictEqual(before, after),
        'Expected an independent Next.js upgrade'
      )
      for (const { specifier } of after) {
        verifyVersion(specifier, targetVersion)
      }
      if (!lockfile) {
        for (const name of ['npm-shrinkwrap.json', 'package-lock.json']) {
          const file = path.posix.join(target.path, name)
          if (base.has(file) || result.has(file)) {
            const previous = JSON.parse(
              readBlob(git, base.get(file)).toString('utf8')
            )
            const updated = JSON.parse(
              readBlob(git, result.get(file)).toString('utf8')
            )
            requireValid(
              (
                previous.packages?.['node_modules/next'] ??
                previous.dependencies?.next
              )?.version === target.fromVersion &&
                (
                  updated.packages?.['node_modules/next'] ??
                  updated.dependencies?.next
                )?.version === targetVersion,
              'Next.js npm lockfile version differs from the candidate'
            )
          }
        }
      }
    }
  }

  if (lockfile) {
    requireValid(
      isDeepStrictEqual(oldLock.slice(0, -1), newLock.slice(0, -1)),
      'Unexpected changes to auxiliary lockfile documents'
    )
    verifyPnpmLock(
      oldLock.at(-1),
      newLock.at(-1),
      new Set([...roots].map(importer)),
      candidate.catalog,
      targetVersion
    )
  }

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

  return { createRef, readRef, verifyCommit, publishCommit }
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
  publishTokenProvided,
}) {
  const { id, targets } = candidate
  // The tree names the branch, so a leftover branch from an earlier candidate
  // (for example after its draft was merged) never blocks a new one.
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

  // One open draft per app and policy or catalog group, whatever its version.
  async function existingDraft() {
    const pulls = await github('GET', `${endpoint}?${query}`, undefined, {
      paginate: true,
    })
    requireValid(Array.isArray(pulls), 'GitHub did not list pull requests')
    const pull = pulls.find(
      (candidatePull) =>
        candidatePull?.body?.split(/\r?\n/).includes(marker) &&
        candidatePull.head?.ref?.startsWith(branchPrefix) &&
        candidatePull.head.repo?.full_name?.toLowerCase() ===
          repository.toLowerCase()
    )
    if (!pull) {
      return null
    }
    requireValid(
      typeof pull.html_url === 'string' && pull.html_url,
      'GitHub did not return the existing draft URL'
    )
    return { status: 'existing_draft', url: pull.html_url }
  }

  const checkBase = async () => {
    requireValid(
      (await transport.readRef(baseRef)) === baseSha,
      'Base branch changed after preparation'
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
    'Candidate branch changed before draft creation'
  )
  const body = [
    marker,
    '',
    'Scheduled Next.js upgrade for the following apps:',
    '',
    ...targets.map(({ path: app, policy }) => `    ${app} (${policy})`),
    ...(publishTokenProvided
      ? []
      : [
          '',
          'GitHub does not start pull request workflows for drafts opened with `GITHUB_TOKEN`. To run CI, close and reopen this pull request or push a commit to its branch. To start CI automatically, pass a `publish-token` secret to the scheduled upgrade workflow.',
        ]),
  ].join('\n')
  let draft
  try {
    draft = await github('POST', endpoint, {
      base: baseBranch,
      head: branchName,
      title: headline,
      body,
      draft: true,
    })
  } catch (error) {
    existing = await existingDraft()
    if (existing) {
      return existing
    }
    throw error
  }
  requireValid(
    draft?.draft === true &&
      typeof draft.html_url === 'string' &&
      draft.html_url &&
      (!draft.head || draft.head.sha === head) &&
      (!draft.base || draft.base.ref === baseBranch),
    'GitHub did not confirm the candidate draft'
  )
  return { status: 'new_draft', url: draft.html_url }
}

function validateCandidate(
  candidate,
  approvedTargets,
  approvedSupporting,
  outcomePaths
) {
  const { id, targets, supportingPaths, catalog } = candidate
  requireValid(
    typeof id === 'string' &&
      candidateId.test(id) &&
      Array.isArray(targets) &&
      targets.length > 0 &&
      Array.isArray(supportingPaths) &&
      (catalog === null ||
        (catalog?.dependency === 'next' &&
          (catalog.name === null ||
            (typeof catalog.name === 'string' && catalog.name.length > 0)))),
    'Invalid candidate manifest'
  )

  const paths = new Set()
  const version = targets[0].targetVersion
  for (const target of targets) {
    requireValid(
      normalizeUpgradePath(target.path) === target.path &&
        !paths.has(target.path) &&
        approvedTargets.has(target.path) &&
        approvedTargets.get(target.path) === target.policy &&
        ['security', 'latest'].includes(target.policy) &&
        semver.valid(target.fromVersion) === target.fromVersion &&
        semver.valid(target.targetVersion) === target.targetVersion &&
        target.targetVersion === version &&
        semver.gt(version, target.fromVersion),
      'Unexpected candidate target'
    )
    paths.add(target.path)
  }
  requireValid(
    isDeepStrictEqual(paths, new Set(outcomePaths)),
    'Candidate target paths differ from the outcome'
  )
  for (const supportingPath of supportingPaths) {
    requireValid(
      normalizeUpgradePath(supportingPath) === supportingPath &&
        approvedSupporting.has(supportingPath) &&
        !approvedTargets.has(supportingPath) &&
        !paths.has(supportingPath),
      'Unexpected supporting package'
    )
    paths.add(supportingPath)
  }
  requireValid(
    catalog || (targets.length === 1 && supportingPaths.length === 0),
    'Invalid independent candidate'
  )
  requireValid(
    candidateKey({ targets, catalog }) === id,
    'Candidate identity differs from the approved targets'
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

function groupKey(paths) {
  return JSON.stringify([...paths].sort())
}

export async function publishUpgradeCandidates({
  root,
  artifactDirectory,
  targets,
  supportingPaths,
  repository,
  baseBranch,
  github,
  gitRemote,
  publishTokenProvided = false,
}) {
  const approvedTargets = new Map(
    targets.map(({ path: app, policy }) => [normalizeUpgradePath(app), policy])
  )
  const approvedSupporting = new Set(supportingPaths.map(normalizeUpgradePath))
  const index = JSON.parse(
    readFileSync(path.join(artifactDirectory, 'index.json'), 'utf8')
  )
  requireValid(
    Array.isArray(index.outcomes) && Array.isArray(index.candidates),
    'Invalid publication index'
  )

  const outcomes = []
  const prepared = []
  const seen = new Set()
  for (const outcome of index.outcomes) {
    const { paths, status } = outcome
    requireValid(
      Array.isArray(paths) &&
        paths.length > 0 &&
        ['no_upgrade', 'blocked', 'failed', 'prepared'].includes(status),
      'Invalid preparation outcome'
    )
    for (const app of paths) {
      requireValid(
        approvedTargets.has(app) && !seen.has(app),
        'Unexpected preparation outcome path'
      )
      seen.add(app)
    }
    const publication = {
      paths,
      status: status === 'prepared' ? 'failed' : status,
    }
    if (status === 'prepared') {
      publication.failureStage = 'verification'
    } else if (
      status === 'failed' &&
      preparationFailureStages.has(outcome.failureStage)
    ) {
      publication.failureStage = outcome.failureStage
    }
    outcomes.push(publication)
    if (status === 'prepared') {
      prepared.push(publication)
    }
  }
  for (const app of approvedTargets.keys()) {
    if (!seen.has(app)) {
      outcomes.push({
        paths: [app],
        status: 'failed',
        failureStage: 'verification',
      })
    }
  }
  if (prepared.length === 0) {
    return { outcomes }
  }

  const candidatesByPaths = new Map()
  for (const candidate of index.candidates) {
    if (!Array.isArray(candidate?.targets)) {
      continue
    }
    const key = groupKey(candidate.targets.map((target) => target?.path))
    const matching = candidatesByPaths.get(key) ?? []
    matching.push(candidate)
    candidatesByPaths.set(key, matching)
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
    const base = entries(git, baseSha)
    const transport = publicationTransport({
      git,
      github,
      repository,
      localRemote,
    })
    for (const outcome of prepared) {
      try {
        const matching = candidatesByPaths.get(groupKey(outcome.paths))
        requireValid(
          matching?.length === 1,
          'Expected exactly one prepared candidate'
        )
        const [candidate] = matching
        validateCandidate(
          candidate,
          approvedTargets,
          approvedSupporting,
          outcome.paths
        )
        const patch = readFileSync(
          path.join(artifactDirectory, `${candidate.id}.patch`)
        )
        const verified = validatePatch({ git, base, baseSha, patch, candidate })
        outcome.failureStage = 'publishing'
        Object.assign(
          outcome,
          await publishCandidate({
            candidate,
            verified,
            baseSha,
            baseBranch,
            repository,
            github,
            transport,
            localRemote,
            publishTokenProvided,
          })
        )
        delete outcome.failureStage
      } catch (error) {
        // One invalid or failed candidate must not prevent independent publication.
        explain(outcome.paths, error)
      }
    }
  } catch (error) {
    // Prepared outcomes start as failed and only change on a confirmed draft.
    explain(
      prepared.flatMap(({ paths }) => paths),
      error
    )
  } finally {
    if (scratch) {
      rmSync(scratch, { force: true, recursive: true })
    }
  }

  return { outcomes }
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
    existing_draft: 'Existing draft',
    new_draft: 'New draft',
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
  let targets = []
  let result
  try {
    targets = JSON.parse(process.env.NEXT_UPGRADE_TARGETS)
    result = await publishUpgradeCandidates({
      root: process.env.NEXT_UPGRADE_ROOT,
      artifactDirectory: process.env.NEXT_UPGRADE_ARTIFACT_DIR,
      targets,
      supportingPaths: JSON.parse(
        process.env.NEXT_UPGRADE_SUPPORTING_PATHS ?? '[]'
      ),
      repository: process.env.GITHUB_REPOSITORY,
      baseBranch: process.env.NEXT_UPGRADE_BASE_BRANCH,
      github: githubCli,
      publishTokenProvided:
        process.env.NEXT_UPGRADE_PUBLISH_TOKEN_PROVIDED === 'true',
    })
  } catch {
    result = {
      outcomes: Array.isArray(targets)
        ? targets
            .filter((target) => typeof target?.path === 'string')
            .map((target) => ({
              paths: [target.path],
              status: 'failed',
              failureStage: 'verification',
            }))
        : [],
    }
    process.exitCode = 1
  }
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`)
  writeSummary(result)
  if (result.outcomes.some(({ status }) => status === 'failed')) {
    console.error(
      'At least one Next.js upgrade candidate could not be published.'
    )
    process.exitCode = 1
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main()
}
