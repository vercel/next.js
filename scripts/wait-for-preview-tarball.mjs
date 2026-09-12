// @ts-check
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { getGitInfo } from './git-info.mjs'

const DEFAULT_PREVIEW_BUILDS_BASE_URL =
  'https://vercel-packages.vercel.app/next'
// This is the ordinary no-publication window. Once it elapses, the waiter
// consults the matching producer instead of assuming every build finishes in
// less than 30 minutes.
const DEFAULT_TIMEOUT_MINUTES = 30
const POLL_INTERVAL_MS = 15_000
const PRODUCER_POLL_INTERVAL_MS = 60_000
const PROGRESS_LOG_INTERVAL_MS = 60_000
// A native build normally finishes well inside 30 minutes, but GitHub runner
// contention and retries can extend it. Keep a generous hard bound while the
// matching producer is demonstrably making progress instead of applying this
// bound blindly from the start of the waiter.
const PRODUCER_TIMEOUT_MS = 120 * 60_000
// A rerun is commonly queued just after a failed attempt. Keep polling briefly
// before treating a terminal producer as final so the waiter can observe the
// incremented run_attempt instead of racing the retry click.
const PRODUCER_RETRY_GRACE_MS = 2 * 60_000
// Once build-and-deploy succeeds, upload-preview-tarballs normally starts in a
// few seconds and finishes in under two minutes. Ten minutes isolates uploader
// failures without confusing them with a still-running producer.
const UPLOAD_GRACE_MS = 10 * 60_000
const BUILD_AND_DEPLOY_WORKFLOW = 'build_and_deploy.yml'

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
 * URL of the preview tarball of `packageName` for a commit. `vercel-packages`
 * answers with a redirect to Vercel Blob, which only serves the tarball once
 * `upload-preview-tarballs` has published it.
 *
 * @param {string | undefined} baseUrl
 * @param {string} commitSha
 * @param {string} packageName
 * @returns {string}
 */
export function previewTarballUrl(baseUrl, commitSha, packageName) {
  return `${baseUrl || DEFAULT_PREVIEW_BUILDS_BASE_URL}/commits/${commitSha}/${packageName}`
}

/**
 * The reverse of `previewTarballUrl`: the commit that a preview build URL
 * refers to, or null when `url` was not built from `baseUrl`.
 *
 * @param {string | undefined} url
 * @param {string | undefined} baseUrl
 * @returns {string | null} the commit
 */
export function getCommitFromPreviewBuildUrl(url, baseUrl) {
  if (url === undefined) {
    return null
  }
  const commitsPrefix = `${baseUrl || DEFAULT_PREVIEW_BUILDS_BASE_URL}/commits/`
  if (!url.startsWith(commitsPrefix)) {
    return null
  }
  const [commitSha] = url.slice(commitsPrefix.length).split('/')
  if (commitSha.length === 0) {
    return null
  }
  return commitSha
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
 * Returns a getter for the build-and-deploy run that produces `commitSha`, or
 * null outside GitHub Actions. A re-run keeps the same run ID and increments
 * `run_attempt`, so polling this endpoint follows retries without guessing
 * which attempt will eventually publish the tarball.
 *
 * @param {string} commitSha
 * @param {string} [branchName]
 * @returns {null | (() => Promise<{
 *   state: 'active' | 'success' | 'failure',
 *   runId: number,
 *   attempt: number,
 *   conclusion: string | null,
 *   createdAt: number,
 *   completedAt: number | null,
 *   url: string,
 * } | null>)}
 */
export function createBuildAndDeployRunGetter(commitSha, branchName) {
  const apiUrl = process.env.GITHUB_API_URL
  const repository = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!apiUrl || !repository || !token) {
    return null
  }

  return async () => {
    const url = new URL(
      `${apiUrl}/repos/${repository}/actions/workflows/${BUILD_AND_DEPLOY_WORKFLOW}/runs`
    )
    // Pull-request workflow runs report the synthetic merge commit as
    // `head_sha`, so locate those by head branch and verify pull_requests.head
    // below. Push and workflow-dispatch runs can be filtered by the real SHA.
    if (process.env.GITHUB_EVENT_NAME === 'pull_request' && branchName) {
      url.searchParams.set('event', 'pull_request')
      url.searchParams.set('branch', branchName)
    } else {
      url.searchParams.set('head_sha', commitSha)
    }
    url.searchParams.set('per_page', '20')

    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    })
    if (!response.ok) {
      throw new Error(`GitHub Actions API returned ${response.status}`)
    }

    /** @type {{ workflow_runs: Array<{
     * id: number, head_sha: string, status: string, conclusion: string | null,
     * run_attempt: number, created_at: string, updated_at: string,
     * html_url: string,
     * pull_requests?: Array<{ head: { sha: string } }>,
     * }> }} */
    const { workflow_runs: workflowRuns } = await response.json()
    const runs = workflowRuns
      .filter(
        (run) =>
          run.head_sha === commitSha ||
          run.pull_requests?.some(
            (pullRequest) => pullRequest.head.sha === commitSha
          )
      )
      .sort(
        (left, right) =>
          Date.parse(right.created_at) - Date.parse(left.created_at)
      )
    if (runs.length === 0) {
      return null
    }

    // Prefer a currently running retry, then a successful producer, then the
    // newest terminal failure. Multiple workflow_dispatch runs can exist for a
    // SHA, whereas ordinary retries update one run in place.
    const run =
      runs.find((candidate) => candidate.status !== 'completed') ??
      runs.find((candidate) => candidate.conclusion === 'success') ??
      runs[0]
    return {
      state:
        run.status !== 'completed'
          ? 'active'
          : run.conclusion === 'success'
            ? 'success'
            : 'failure',
      runId: run.id,
      attempt: run.run_attempt,
      conclusion: run.conclusion,
      createdAt: Date.parse(run.created_at),
      completedAt:
        run.status === 'completed' ? Date.parse(run.updated_at) : null,
      url: run.html_url,
    }
  }
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
  const url = previewTarballUrl(previewBuildsBaseUrl, commitSha, 'next')
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
 * @param {number} [options.producerPollIntervalMs]
 * @param {number} [options.producerTimeoutMs]
 * @param {number} [options.producerRetryGraceMs]
 * @param {number} [options.uploadGraceMs]
 * @param {null | (() => Promise<{
 *   state: 'active' | 'success' | 'failure', runId: number, attempt: number,
 *   conclusion: string | null, createdAt: number, completedAt: number | null,
 *   url: string,
 * } | null>)} [options.getProducerRun]
 * @param {typeof probeTarball} [options.probe]
 * @param {() => number} [options.now]
 * @param {(milliseconds: number) => Promise<void>} [options.sleep]
 * @returns {Promise<void>}
 */
export async function waitForPreviewTarball({
  commitSha,
  previewBuildsBaseUrl,
  timeoutMs,
  getReadToken = async () => null,
  pollIntervalMs = POLL_INTERVAL_MS,
  producerPollIntervalMs = PRODUCER_POLL_INTERVAL_MS,
  producerTimeoutMs = PRODUCER_TIMEOUT_MS,
  producerRetryGraceMs = PRODUCER_RETRY_GRACE_MS,
  uploadGraceMs = UPLOAD_GRACE_MS,
  getProducerRun = null,
  probe = probeTarball,
  now = Date.now,
  sleep = setTimeout,
}) {
  const url = previewTarballUrl(previewBuildsBaseUrl, commitSha, 'next')
  const startedAt = now()
  const ordinaryDeadline = startedAt + timeoutMs
  let lastProgressLogAt = startedAt
  let nextProducerProbeAt = startedAt
  let checkedProducerAtOrdinaryDeadline = false
  let producerRun = null
  let producerError = null
  let producerFailureObservedAt = null
  let producerFailureKey = null

  console.info(
    `Waiting up to ${formatDuration(timeoutMs)} for the preview tarball at ${url}`
  )

  for (;;) {
    // A fresh token per probe: the OIDC token expires after five minutes,
    // well before the overall timeout.
    const { published, status, lastResponse, responseHeaders } = await probe(
      url,
      await requestHeaders(getReadToken)
    )
    const checkedAt = now()

    if (published) {
      console.info(
        `Preview tarball for commit ${commitSha} is available after ${formatDuration(checkedAt - startedAt)}`
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

    if (
      getProducerRun !== null &&
      (checkedAt >= nextProducerProbeAt ||
        (checkedAt >= ordinaryDeadline && !checkedProducerAtOrdinaryDeadline))
    ) {
      try {
        producerRun = await getProducerRun()
        producerError = null
      } catch (error) {
        producerError = error instanceof Error ? error.message : String(error)
      }
      nextProducerProbeAt = checkedAt + producerPollIntervalMs
      if (checkedAt >= ordinaryDeadline) {
        checkedProducerAtOrdinaryDeadline = true
      }
    }

    let deadline = ordinaryDeadline
    if (checkedAt >= ordinaryDeadline) {
      if (getProducerRun === null || producerRun === null) {
        throw notPublishedError({
          commitSha,
          lastResponse:
            lastResponse +
            (producerError ? `; producer lookup failed: ${producerError}` : ''),
          responseHeaders,
          timeoutMs,
        })
      }

      const producerDescription = `build-and-deploy run ${producerRun.runId} attempt ${producerRun.attempt}`
      if (producerRun.state === 'failure') {
        const failureKey = `${producerRun.runId}:${producerRun.attempt}`
        const failureObservedAt =
          producerFailureKey === failureKey &&
          producerFailureObservedAt !== null
            ? producerFailureObservedAt
            : checkedAt
        producerFailureKey = failureKey
        producerFailureObservedAt = failureObservedAt
        deadline = failureObservedAt + producerRetryGraceMs
        if (checkedAt >= deadline) {
          throw new Error(
            `Preview tarball for commit ${commitSha} was not published because ${producerDescription} ` +
              `finished with ${producerRun.conclusion} and no retry started within ` +
              `${formatDuration(producerRetryGraceMs)}. See ${producerRun.url}`
          )
        }
      } else {
        producerFailureObservedAt = null
        producerFailureKey = null
      }

      if (producerRun.state === 'active') {
        deadline = producerRun.createdAt + producerTimeoutMs
        if (checkedAt >= deadline) {
          throw new Error(
            `Preview tarball for commit ${commitSha} was not published because ${producerDescription} ` +
              `did not finish within ${formatDuration(producerTimeoutMs)}. See ${producerRun.url}`
          )
        }
      } else if (producerRun.state === 'success') {
        deadline = (producerRun.completedAt ?? checkedAt) + uploadGraceMs
        if (checkedAt >= deadline) {
          throw new Error(
            `Preview tarball for commit ${commitSha} was not published within ` +
              `${formatDuration(uploadGraceMs)} after ${producerDescription} succeeded. ` +
              `Check the upload-preview-tarballs workflow triggered by ${producerRun.url}`
          )
        }
      }
    }

    if (checkedAt - lastProgressLogAt >= PROGRESS_LOG_INTERVAL_MS) {
      const producerProgress = producerRun
        ? `; build-and-deploy attempt ${producerRun.attempt} is ${producerRun.state}`
        : producerError
          ? `; producer lookup failed: ${producerError}`
          : ''
      console.info(
        `Still waiting after ${formatDuration(checkedAt - startedAt)} ` +
          `(last response: ${lastResponse}${producerProgress})`
      )
      lastProgressLogAt = checkedAt
    }

    // Capping the sleep at the active policy deadline keeps the last probe on
    // the boundary rather than after it.
    await sleep(Math.min(pollIntervalMs, deadline - checkedAt))
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
  const gitInfo = await getGitInfo()
  const commitSha = values['commit-sha'] ?? gitInfo.commitSha

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
    getProducerRun: createBuildAndDeployRunGetter(
      commitSha,
      gitInfo.branchName
    ),
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
