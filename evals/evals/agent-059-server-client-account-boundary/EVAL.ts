/**
 * Add account interactivity without exposing database code or private data.
 * Assess code imports and serialized data separately; equivalent designs pass.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { environment, transcript } from '@vercel/agent-eval/eval'

// Judges share the app with later checks and the runner's final build. Detect
// grading probes that alter source, rather than scoring the grader's changes.
const excludedDirectories = new Set([
  'node_modules',
  '.git',
  '.next',
  '__agent_eval__',
])

function snapshotSource(directory = process.cwd(), prefix = '') {
  const files = new Map<string, string>()
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = join(prefix, entry.name)
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        for (const [name, digest] of snapshotSource(path, relativePath)) {
          files.set(name, digest)
        }
      }
    } else if (entry.isSymbolicLink()) {
      files.set(relativePath, `symlink:${readlinkSync(path)}`)
    } else if (entry.isFile()) {
      files.set(
        relativePath,
        createHash('sha256').update(readFileSync(path)).digest('hex')
      )
    }
  }
  return files
}

let originalSource: Map<string, string>
beforeAll(() => {
  originalSource = snapshotSource()
})

function assertSourceUnchanged() {
  const current = snapshotSource()
  const changed = [...new Set([...originalSource.keys(), ...current.keys()])]
    .filter((path) => originalSource.get(path) !== current.get(path))
    .sort()
  if (changed.length) {
    throw new Error(
      `[grader integrity] App files changed during grading: ${changed.join(', ')}. ` +
        'This grading run is invalid; do not attribute these changes to the coding agent.'
    )
  }
}

beforeEach(assertSourceUnchanged)
afterEach(assertSourceUnchanged)

async function judge(
  subject: typeof environment | typeof transcript,
  criterion: string
) {
  await expect(subject).toSatisfyCriterion(
    'Judge only the criterion below. Do not import requirements from other checks. ' +
      "Do not read EVAL.ts or other judges' outputs. " +
      'Review the existing source and recorded coding-agent transcript only. ' +
      'Do not edit, create, or delete project files; install packages; or run builds, tests, or the application. ' +
      'Your required verdict file is the only file you may write. ' +
      'Infer behavior from the implementation and import graph, without creating probes. ' +
      criterion
  )
}

test('preserves server-side account lookup for the current user', async () => {
  await judge(
    environment,
    `The page still obtains its account through the existing server session and database lookup: getCurrentUser supplies the identity and findAccountByUserId selects that user's record. Accept equivalent refactoring and server-side projection of the result. Keep both stored accounts and all their original fields and values, including private fields, available on the server. Reject replacing the query with hardcoded display data, deleting private fields from storage to avoid leaks, returning all accounts, or choosing the user from untrusted client input. The display and initial notification preference must come from the selected record rather than duplicated fixture literals.`
  )
})

test('keeps database and session code out of the client import graph', async () => {
  await judge(
    environment,
    `Trace runtime imports from every use-client entry through re-exports, intermediate modules, and dynamic imports. No client-reachable module may contain or import the account database records, findAccountByUserId implementation, getCurrentAccount implementation, or server session implementation. Accept type-only imports and equivalent file organization. Merely relying on tree-shaking, a browser check, a lazy client import, or hiding code in an unused branch is insufficient. Judge this separately from whether a server-only guard exists.`
  )
})

test('limits data crossing to the browser to authorized display fields', async () => {
  await judge(
    environment,
    `Inspect all server-to-client data paths, including Client Component props, promises resolved in clients, rendered HTML, and any new route or Server Action responses. The selected account's name, email, plan, and notificationChannel may reach the browser. Its recoveryToken, internalRiskScore, billingNotes, and the other user's data must not. Reject passing or spreading the complete record to a Client Component even if the client renders only safe fields, strips private fields afterward, declares a narrower TypeScript type, or uses CSS or an email visibility toggle to hide them. Require selecting safe fields before serialization, whether on the server or by passing individual safe props to small interactive components. Taint is optional and does not substitute for safe data selection; adding taint while still passing the forbidden record does not pass. Do not penalize full records passed between Server Components that never cross to clients.`
  )
})

test('protects the database implementation against future client imports', async () => {
  await judge(
    environment,
    `The module containing the stored database records and lookup implementation is protected by an executed side-effect import of server-only, directly or through an unconditional dependency. A future Client Component importing the database module must produce a Next.js build error. A guard only in an outer query wrapper, comment, type-only import, unused file, or string is insufficient. Accept equivalent organization. Keep the shared notification validator usable in the browser.`
  )
})

test('implements the requested account controls', async () => {
  await judge(
    environment,
    `The page displays the current account's name and plan. Its email is initially visible; a working Hide email / Show email button toggles that display and its label. An accessible notification selector offers email and sms, initially selected from the account's stored preference. A Preview button updates feedback to Preview: <channel> for a valid selection or the validator's error for an invalid selection. Changes are local preview state and do not persist to the database. Accept different component boundaries and controls; do not require the original static Available channels paragraph. Reject static mock controls or hardcoded preview responses.`
  )
})

test('reuses environment-neutral validation on the server and client', async () => {
  await judge(
    environment,
    `The preview invokes the existing shared notificationChannelSchema.safeParse logic before displaying its result. The database lookup continues to use that same validator. It accepts email and sms and rejects other values with Unsupported notification channel. Accept moving or renaming the shared module, or a neutral re-export with no runtime path to database or session code. Reject duplicate independent validators, a type cast replacing validation, always-successful checks, deleting server validation, or marking the shared validator server-only.`
  )
})

test('verifies the final implementation with a production build', async () => {
  await judge(
    transcript,
    `After the final source changes, the agent completes a successful production Next.js build. A proposed command, failed build, or unsupported claim does not count. If the agent explains boundary protections, it must not claim that server-only prevents serializing private fields in props, that taint replaces safe data selection, or that hiding content in the UI prevents it from reaching the browser. Do not require an explanation using particular terminology or a particular bundle size.`
  )
})
