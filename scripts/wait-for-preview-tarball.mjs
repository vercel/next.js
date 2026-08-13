// @ts-check
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { getGitInfo } from './git-info.mjs'

const DEFAULT_PREVIEW_BUILDS_BASE_URL =
  'https://vercel-packages.vercel.app/next'
// Comfortably above the slowest observed build-and-deploy plus
// upload-preview-tarballs, which together have topped out around 27 minutes.
const DEFAULT_TIMEOUT_MINUTES = 30
const POLL_INTERVAL_MS = 15_000
const PROGRESS_LOG_INTERVAL_MS = 60_000

/**
 * Mints a GitHub Actions OIDC token for the given audience.
 * Returns null outside of GitHub Actions.
 *
 * @param {string} audience
 * @returns {Promise<string | null>}
 */
async function mintGitHubActionsOidcToken(audience) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!requestUrl || !requestToken) {
    return null
  }

  const url = new URL(requestUrl)
  url.searchParams.set('audience', audience)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${requestToken}` },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to mint GitHub OIDC token: ${response.status} ${await response.text()}`
    )
  }

  const { value } = await response.json()
  return value
}

/**
 * Reads a preview-builds credential, minting a fresh one when needed.
 * vercel-packages accepts GitHub Actions OIDC tokens minted for its audience.
 * Public preview builds need no credentials and return null. Private builds
 * mint a GitHub Actions OIDC token, which expires about five minutes after
 * issuance, so the token is cached and re-minted before it expires rather
 * than minted once up front.
 *
 * @returns {() => Promise<string | null>}
 */
export function createPreviewBuildsReadTokenGetter() {
  if (process.env.PREVIEW_BUILDS_ACCESS !== 'private') {
    return async () => null
  }

  let cachedToken = null
  let cachedTokenExpiresAt = 0

  return async () => {
    if (cachedToken !== null && cachedTokenExpiresAt - 60_000 > Date.now()) {
      return cachedToken
    }
    const token = await mintGitHubActionsOidcToken(
      'https://vercel-packages.vercel.app'
    )
    if (token === null) {
      throw new Error(
        'Preview builds are private (PREVIEW_BUILDS_ACCESS=private) ' +
          'but no GitHub Actions OIDC token can be minted. ' +
          'Grant the job the `id-token: write` permission.'
      )
    }
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString()
    )
    cachedToken = token
    cachedTokenExpiresAt = payload.exp * 1000
    return token
  }
}

/**
 * URL of the `next` preview tarball for a commit. `vercel-packages` answers
 * with a redirect to Vercel Blob, which only serves the tarball once
 * `upload-preview-tarballs` has published it.
 *
 * @param {string | undefined} baseUrl
 * @param {string} commitSha
 * @returns {string}
 */
export function previewTarballUrl(baseUrl, commitSha) {
  return `${baseUrl || DEFAULT_PREVIEW_BUILDS_BASE_URL}/commits/${commitSha}/next`
}

/**
 * @param {number} milliseconds
 * @returns {string}
 */
function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

/**
 * URL of the commit's check runs, where the `build-and-deploy` status is
 * visible. Undefined outside of GitHub Actions, which is the only place the
 * server and repository are known.
 *
 * @param {string} commitSha
 * @returns {string | undefined}
 */
function commitChecksUrl(commitSha) {
  const serverUrl = process.env.GITHUB_SERVER_URL
  const repository = process.env.GITHUB_REPOSITORY
  if (!serverUrl || !repository) {
    return undefined
  }
  return `${serverUrl}/${repository}/commit/${commitSha}/checks`
}

/**
 * Requests the tarball with `HEAD` so polling stays cheap: a `GET` would
 * download the whole multi-megabyte tarball on every attempt.
 *
 * `fetch` follows the redirect, so `response.ok` reflects the blob and not the
 * unconditional redirect that `vercel-packages` returns. Anything that inspects
 * this URL must follow redirects too, otherwise the redirect itself reads as
 * success while the tarball is still missing.
 *
 * `lastResponse` describes the outcome for the progress and failure messages.
 *
 * @param {string} url
 * @param {Record<string, string> | undefined} headers
 * @returns {Promise<{ published: boolean, status: number | null, lastResponse: string, responseHeaders: string | null }>}
 */
async function probeTarball(url, headers) {
  try {
    const response = await fetch(url, { method: 'HEAD', headers })
    return {
      published: response.ok,
      status: response.status,
      lastResponse:
        response.status === 404 ? 'not published yet' : `${response.status}`,
      // Response headers carry request IDs that help debug failures.
      responseHeaders: response.ok
        ? null
        : JSON.stringify(Object.fromEntries(response.headers)),
    }
  } catch (error) {
    return {
      published: false,
      status: null,
      lastResponse: `request failed (${error instanceof Error ? error.message : error})`,
      responseHeaders: null,
    }
  }
}

/**
 * @param {() => Promise<string | null>} getReadToken
 * @returns {Promise<Record<string, string> | undefined>}
 */
async function requestHeaders(getReadToken) {
  const readToken = await getReadToken()
  return readToken ? { Authorization: `Bearer ${readToken}` } : undefined
}

/**
 * @param {object} options
 * @param {string} options.commitSha
 * @param {string} options.lastResponse
 * @param {string | null} [options.responseHeaders]
 * @param {number} [options.timeoutMs] Omitted when nothing was waited out.
 * @returns {Error}
 */
function notPublishedError({
  commitSha,
  lastResponse,
  responseHeaders,
  timeoutMs,
}) {
  const checksUrl = commitChecksUrl(commitSha)
  return new Error(
    `Preview tarball for commit ${commitSha} was not published` +
      (timeoutMs === undefined ? '' : ` within ${formatDuration(timeoutMs)}`) +
      ` (last response: ${lastResponse}). ` +
      `The tarball is published by the "upload-preview-tarballs" workflow ` +
      `once "build-and-deploy" has completed for this commit, so check ` +
      `whether that run failed or is still in progress.` +
      (checksUrl ? ` See ${checksUrl}` : '') +
      (responseHeaders ? ` Response headers: ${responseHeaders}` : '')
  )
}

/**
 * Checks once whether the `next` preview tarball for `commitSha` is
 * downloadable, and throws if it is not. For callers that only need the
 * assertion because something else has already done the waiting.
 *
 * @param {object} options
 * @param {string} options.commitSha
 * @param {string} [options.previewBuildsBaseUrl]
 * @param {() => Promise<string | null>} [options.getReadToken]
 * @returns {Promise<void>}
 */
export async function assertPreviewTarballPublished({
  commitSha,
  previewBuildsBaseUrl,
  getReadToken,
}) {
  const url = previewTarballUrl(previewBuildsBaseUrl, commitSha)
  const { published, lastResponse, responseHeaders } = await probeTarball(
    url,
    await requestHeaders(getReadToken ?? (async () => null))
  )

  if (!published) {
    throw notPublishedError({ commitSha, lastResponse, responseHeaders })
  }

  console.info(`Preview tarball for commit ${commitSha} is available at ${url}`)
}

/**
 * Polls until the `next` preview tarball for `commitSha` is downloadable.
 * Rejects when `timeoutMs` elapses before that happens. Every response other
 * than a success is treated as "not ready", so a transient blob or edge error
 * does not end the wait early.
 *
 * @param {object} options
 * @param {string} options.commitSha
 * @param {string} [options.previewBuildsBaseUrl]
 * @param {number} options.timeoutMs
 * @param {() => Promise<string | null>} [options.getReadToken]
 * @param {number} [options.pollIntervalMs]
 * @returns {Promise<void>}
 */
export async function waitForPreviewTarball({
  commitSha,
  previewBuildsBaseUrl,
  timeoutMs,
  getReadToken = async () => null,
  pollIntervalMs = POLL_INTERVAL_MS,
}) {
  const url = previewTarballUrl(previewBuildsBaseUrl, commitSha)
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let lastProgressLogAt = startedAt

  console.info(
    `Waiting up to ${formatDuration(timeoutMs)} for the preview tarball at ${url}`
  )

  for (;;) {
    // A fresh token per probe: the OIDC token expires after five minutes,
    // well before the overall timeout.
    const { published, status, lastResponse, responseHeaders } =
      await probeTarball(url, await requestHeaders(getReadToken))
    const now = Date.now()

    if (published) {
      console.info(
        `Preview tarball for commit ${commitSha} is available after ${formatDuration(now - startedAt)}`
      )
      return
    }

    if (status === 401 || status === 403) {
      // Retrying won't change the authorization outcome.
      throw new Error(
        `Not authorized to access the preview tarball at ${url} (last response: ${lastResponse}). ` +
          (responseHeaders ? `Response headers: ${responseHeaders}` : '')
      )
    }

    if (now >= deadline) {
      throw notPublishedError({
        commitSha,
        lastResponse,
        responseHeaders,
        timeoutMs,
      })
    }

    if (now - lastProgressLogAt >= PROGRESS_LOG_INTERVAL_MS) {
      console.info(
        `Still waiting after ${formatDuration(now - startedAt)} (last response: ${lastResponse})`
      )
      lastProgressLogAt = now
    }

    // Capping the sleep at the remaining time keeps the last probe on the
    // deadline rather than past it.
    await setTimeout(Math.min(pollIntervalMs, deadline - now))
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'commit-sha': { type: 'string' },
      'preview-builds-base-url': { type: 'string' },
      'timeout-minutes': { type: 'string' },
    },
  })

  // Resolving the commit through `getGitInfo` rather than from a workflow
  // expression keeps this in step with `test-new-tests.mjs`, which reaches the
  // same function via `getChangedTests` to build the URL it installs from. The
  // two have to agree, otherwise this waits for a tarball the tests never ask
  // for.
  const commitSha = values['commit-sha'] ?? (await getGitInfo()).commitSha

  const rawTimeoutMinutes = values['timeout-minutes']
  const timeoutMinutes =
    rawTimeoutMinutes === undefined
      ? DEFAULT_TIMEOUT_MINUTES
      : Number(rawTimeoutMinutes)
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error(
      `--timeout-minutes must be a positive number but got "${rawTimeoutMinutes}"`
    )
  }

  await waitForPreviewTarball({
    commitSha,
    previewBuildsBaseUrl: values['preview-builds-base-url'],
    timeoutMs: timeoutMinutes * 60_000,
    getReadToken: createPreviewBuildsReadTokenGetter(),
  })
}

// `test-new-tests.mjs` imports this module for its own verification, so the CLI
// only runs when the file is the entry point.
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
