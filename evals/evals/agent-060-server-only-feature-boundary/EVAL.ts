/**
 * Transfer case: add interactivity without being prompted about boundaries.
 * The data layer is nested; guarding only a new wrapper is insufficient.
 * The money formatter is a neutral control that must remain shareable.
 */

import { expect, test } from 'vitest'
import { environment, transcript } from '@vercel/agent-eval/eval'

test('adds a working invoice status filter', async () => {
  await expect(environment).toSatisfyCriterion(
    `The / page still shows the Invoices heading and reads invoices through the existing data layer. It offers All, Open, and Paid controls that update the visible invoices without a full page reload. All initially shows INV-101 ($125.00, open), INV-102 ($80.00, paid), and INV-103 ($320.00, open). Open and Paid show their respective subsets. An empty filtered result renders No invoices. Accept equivalent components, accessible controls, server/client composition, and module organization. Reject hardcoded UI copies of the records, deleting the data layer, or controls that do not actually filter.`
  )
})

test('keeps database access and internal fields on the server', async () => {
  await expect(environment).toSatisfyCriterion(
    `Trace the complete runtime import graph from every use-client entry, including re-exports and dynamic imports. Database reads, the raw invoice row store, and reconciliationAccount must stay outside that graph. Only public invoice data (number, amountCents, status) or rendered public UI may cross to the client; reject passing raw records with reconciliationAccount in props or API responses. Keep selectInvoices and listInvoices behavior available on the server. Accept type-only imports and equivalent module organization. A server function reference is acceptable only if database implementation stays server-side and returned data excludes internal fields.`
  )
})

test('proactively protects server owners without poisoning shared utilities', async () => {
  await expect(environment).toSatisfyCriterion(
    `The database owner (initially lib/billing/database.ts) and the invoice query entry point (initially lib/billing/invoices.ts) must both be protected from future Client Component runtime imports by an executed server-only import, either directly or through unconditional dependencies. One server-only import in the database owner can protect both through the existing dependency chain. A marker only in the query wrapper leaves the database owner unprotected and is insufficient. Comments, strings, type-only imports, or unused guard files do not count. The environment-neutral formatMoney utility must remain shareable with Client Components, without any server-only dependency. If invoiceStatuses is needed on the client, it must be accessible from a neutral module without pulling database code across the boundary. Do not require relocating constants the client does not use, or redundant server-only imports in every server file.`
  )
})

test('verifies the feature with a production build', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After the final source changes, the agent completes a successful production Next.js build. A proposed command, failed build, or unsupported claim of success does not count. No particular explanation of server-only or documentation-reading behavior is required.`
  )
})
