/**
 * Diagnose a client bundle leak and proactively protect the server boundary.
 * The prompt describes the symptom without naming the import or the guard.
 * Grade ownership and reachability, not the incident's exact file layout.
 */

import { expect, test } from 'vitest'
import { environment, transcript } from '@vercel/agent-eval/eval'

test('removes database implementation from the whole client import graph', async () => {
  await expect(environment).toSatisfyCriterion(
    `Trace runtime imports from every use-client entry, including through intermediate modules and re-exports. No client-reachable module may import or execute the database table definitions or registration runtime, even through a dynamic import. The database definitions for users, chats, messages, projects, and usage and their columns must remain available on the server. Accept equivalent file organization and import paths. Do not reject type-only imports. Reject deleting database functionality, hiding the import behind a browser check, moving the database code into a lazy client chunk, or merely declaring sideEffects: false or adding purity annotations.`
  )
})

test('proactively guards the server-owned database boundary', async () => {
  await expect(environment).toSatisfyCriterion(
    `The module that owns the database table definitions is protected by an executed side-effect import of server-only, directly or through an unconditional dependency, so a future Client Component importing that module would produce a Next.js build error. A comment, string, type-only import, unused guard file, or guard in a server wrapper that leaves the database owner importable is insufficient. Judge the actual ownership and import graph, not the location or existence of DB_ONLY_SCHEMA_MARKER. Shared environment-neutral validation must remain usable in the browser.`
  )
})

test('preserves shared validation and the interactive UI', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final app keeps one environment-neutral attachment validator used by the picker that accepts image, text, and file and rejects unsupported values with Unsupported attachment type. The database module continues to have access to that same validator. Accept moving or renaming the shared module or using a neutral re-export that cannot reach database code. Reject duplicated validators, removing validation, always-successful checks, and marking the neutral validator server-only. The Attach a file heading, labeled attachment selector, all existing options, initial Choose an attachment type message, and Ready: <type> or error feedback must remain functional.`
  )
})

test('verifies the repair with a production build', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After its final source changes, the agent completes a successful production Next.js build and identifies the import relationship that caused database implementation to be included in browser code. Do not require particular file names or wording. A proposed command, a failed build, or a claim without execution evidence does not count. Do not require a specific byte reduction. If the agent discusses server-only, it must not claim that the marker itself tree-shakes or shrinks the bundle.`
  )
})
