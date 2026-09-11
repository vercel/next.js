import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import semver from 'next/dist/compiled/semver'
import type { UpgradeResolution } from './resolve'

// TODO: Download the latest upgrade docs through a stable permanent endpoint
// or manifest. Raw canary paths can move when the docs structure changes.
const DOCS_URL =
  'https://raw.githubusercontent.com/vercel/next.js/canary/docs'
const UPGRADING_PATH = '01-app/02-guides/upgrading'

function selectGuidePaths(source: string, target: string): string[] {
  const from = semver.major(source)
  const to = semver.major(target)
  // A direct major jump must still review every crossed migration guide. A
  // same-major security update retains that major's guide as its checklist.
  const firstMajor = from === to ? from : from + 1
  const guides = [`${UPGRADING_PATH}/codemods.mdx`]

  for (let major = firstMajor; major <= to; major++) {
    // Earlier migration guides only exist in the Pages Router documentation.
    const path = major <= 13 ? '02-pages/02-guides/upgrading' : UPGRADING_PATH
    guides.push(`${path}/version-${major}.mdx`)
  }

  return guides
}

async function downloadGuide(guide: string, destination: string) {
  const url = `${DOCS_URL}/${guide}`
  let response: Response

  // Fail the handoff when canonical guidance is unavailable. Starting an agent
  // with a partial checklist can produce a green build with unfinished migration.
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new Error(`Could not download migration guide: ${url}`, {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new Error(
      `Could not download migration guide: ${url} (HTTP ${response.status}).`
    )
  }

  const contents = await response.text()

  if (!contents.trim()) {
    throw new Error(`Downloaded migration guide is empty: ${url}`)
  }

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, contents)
}

export async function prepareUpgradeResources(
  upgrade: Extract<UpgradeResolution, { status: 'ready' }>,
  dryRun: boolean
): Promise<string> {
  // Workflow files must match this CLI's context and handoff contract. Canonical
  // migration guides can come from latest canary, but newer workflow instructions
  // could expect fields or behavior that this installed CLI does not provide.
  const workflowDocs = resolve(__dirname, '../../docs/01-app/02-guides/upgrading')
  // Retain the packet outside the app because the codemod can replace node_modules
  // and verification can delete build output while the agent is running.
  const runDirectory = await mkdtemp(join(tmpdir(), 'next-upgrade-'))

  try {
    const docsRoot = join(runDirectory, 'docs')
    // Derive exact guide paths from the resolved version transition and download
    // only the documents this migration needs.
    const guides = selectGuidePaths(
      upgrade.app.nextVersion,
      upgrade.targetVersion
    )

    for (const guide of guides) {
      await downloadGuide(guide, join(docsRoot, guide))
    }

    const workflowPath = join(runDirectory, 'security-upgrade.md')

    for (const name of ['security-upgrade.md', 'security-migration.md']) {
      await copyFile(join(workflowDocs, name), join(runDirectory, name))
    }

    const snapshotPath = join(runDirectory, 'security-snapshot.json')
    // Preserve the evidence used to select the target so the agent can review and
    // refresh the security decision before delivery.
    await writeFile(snapshotPath, JSON.stringify(upgrade.snapshot, null, 2))

    const contextPath = join(runDirectory, 'context.json')
    await writeFile(
      contextPath,
      JSON.stringify(
        {
          dryRun,
          app: upgrade.app,
          targetVersion: upgrade.targetVersion,
          tools: upgrade.tools,
          docs: {
            root: docsRoot,
            guides,
          },
          snapshotPath,
        },
        null,
        2
      )
    )

    // Pass absolute entry paths so active and newly launched harnesses consume the
    // same workflow without depending on their starting directory.
    return (
      `Read and follow ${JSON.stringify(workflowPath)}. ` +
      `Use ${JSON.stringify(contextPath)} for this upgrade's resolved inputs. ` +
      'Preserve your existing permissions.' +
      (dryRun
        ? ' This is a --experimental-agent-dry-run: complete the migration and verification, create local commits, then stop. Do not push or create a PR/MR.'
        : '')
    )
  } catch (error) {
    // A partial packet must never look like a valid migration handoff.
    await rm(runDirectory, { recursive: true, force: true })
    throw error
  }
}
