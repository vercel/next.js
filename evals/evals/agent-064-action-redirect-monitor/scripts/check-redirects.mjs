#!/usr/bin/env node
/**
 * Synthetic monitor for the application flow.
 *
 * Verifies that submitting the form on /apply lands the user on /done, for
 * both ways the form can be submitted in the real world:
 *
 *   1. no-JS form post — the plain HTML submission a browser makes before
 *      hydration (or with JavaScript disabled).
 *   2. JS fetch submission — the fetch-based post the hydrated page makes
 *      when the user clicks submit.
 *
 * Usage: node scripts/check-redirects.mjs <base-url>
 */

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')

async function findActionId() {
  const res = await fetch(`${base}/apply`)
  if (!res.ok) {
    throw new Error(`GET /apply responded ${res.status}`)
  }
  const html = await res.text()
  const match = html.match(/name="\$ACTION_ID_([0-9a-f]+)"/)
  if (!match) {
    throw new Error('could not find the form action id on /apply')
  }
  return match[1]
}

function assertRedirectsToDone(res) {
  if (res.status < 300 || res.status >= 400) {
    throw new Error(`expected a redirect status, got ${res.status}`)
  }
  const location = res.headers.get('location')
  if (!location) {
    throw new Error('redirect response has no Location header')
  }
  const target = new URL(location, base)
  if (target.pathname !== '/done') {
    throw new Error(`redirected to ${target.pathname} instead of /done`)
  }
}

async function checkNoJsSubmission(actionId) {
  // Before hydration the form is a regular multipart post carrying the
  // hidden $ACTION_ID_* field.
  const form = new FormData()
  form.append(`$ACTION_ID_${actionId}`, '')
  form.append('name', 'Synthetic Monitor')
  const res = await fetch(`${base}/apply`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
  })
  assertRedirectsToDone(res)
}

async function checkJsSubmission(actionId) {
  // The hydrated page submits via fetch: the action is identified by the
  // Next-Action header and the form fields ride along in the body. Mirrors
  // the browser payload: the prefixed form fields come before the "0" root
  // field that references them.
  const form = new FormData()
  form.append('_1_name', 'Synthetic Monitor')
  form.append('0', '["$K1"]')
  const res = await fetch(`${base}/apply`, {
    method: 'POST',
    headers: { 'next-action': actionId },
    body: form,
    redirect: 'manual',
  })
  assertRedirectsToDone(res)
}

async function checkConfirmationPage() {
  const res = await fetch(`${base}/done`)
  if (!res.ok) {
    throw new Error(`GET /done responded ${res.status}`)
  }
}

const actionId = await findActionId()

const checks = [
  ['no-JS form post', () => checkNoJsSubmission(actionId)],
  ['JS fetch submission', () => checkJsSubmission(actionId)],
  ['confirmation page', () => checkConfirmationPage()],
]

let failed = false
for (const [label, run] of checks) {
  try {
    await run()
    console.log(`ok   ${label}`)
  } catch (err) {
    failed = true
    console.error(`FAIL ${label}: ${err.message}`)
  }
}

process.exit(failed ? 1 : 0)
