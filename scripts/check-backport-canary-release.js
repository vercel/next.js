#!/usr/bin/env node
// @ts-check

const fs = require('fs/promises')
const path = require('path')
const semver = require('semver')

const PUBLISH_RELEASE_JOB_NAME = 'Potentially publish release'
const TRIGGER_RELEASE_WORKFLOW = 'trigger_release.yml'
const RELEASE_COMMIT_REGEX = /^v\d+\.\d+\.\d+(-\w+\.\d+)?$/

// This helper is used by a workflow_run listener on build-and-deploy.
// It decides whether a successful stable backport publish should trigger
// a canary preminor release so canary stays semver-ahead of the backport.

function getArgValue(flag) {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function parseReleaseVersion(commitMessage) {
  const versionString = commitMessage.split(' ').pop()?.trim()
  return versionString && RELEASE_COMMIT_REGEX.test(versionString)
    ? versionString.slice(1)
    : null
}

async function fetchGitHubJson(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
    headers['X-GitHub-Api-Version'] = '2022-11-28'
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}) for ${url}: ${await response.text()}`
    )
  }

  return response.json()
}

async function appendOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) {
    return
  }

  let output = ''

  for (const [key, value] of Object.entries(outputs)) {
    output += `${key}=${String(value ?? '').replace(/\n/g, ' ')}\n`
  }

  await fs.appendFile(process.env.GITHUB_OUTPUT, output)
}

async function getWorkflowRunJobs(owner, repo, workflowRunId, token) {
  const jobs = []

  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      per_page: '100',
      page: String(page),
    })
    const data = await fetchGitHubJson(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${workflowRunId}/jobs?${params}`,
      token
    )

    jobs.push(...data.jobs)

    if (jobs.length >= data.total_count || data.jobs.length === 0) {
      return jobs
    }
  }
}

async function getActiveTriggerReleaseRun(owner, repo, token) {
  for (const status of ['queued', 'in_progress']) {
    const params = new URLSearchParams({
      branch: 'canary',
      status,
      per_page: '100',
    })
    const data = await fetchGitHubJson(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${TRIGGER_RELEASE_WORKFLOW}/runs?${params}`,
      token
    )

    if (data.total_count > 0) {
      return data.workflow_runs[0]
    }
  }

  return null
}

async function getCommitMessage(owner, repo, sha, token) {
  const data = await fetchGitHubJson(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
    token
  )
  return data.commit.message.trim()
}

async function finish(outputs) {
  await appendOutputs(outputs)

  if (outputs.should_dispatch === 'true') {
    console.log(outputs.reason)
  } else {
    console.log(`Skipping canary sync: ${outputs.reason}`)
  }
}

async function main() {
  const workflowRunId = getArgValue('--workflow-run-id')
  const headSha = getArgValue('--head-sha')
  const headCommitMessage = process.env.HEAD_COMMIT_MESSAGE?.trim()

  if (!workflowRunId) {
    throw new Error('Missing --workflow-run-id')
  }

  if (!headSha) {
    throw new Error('Missing --head-sha')
  }

  const token = process.env.RELEASE_BOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  const repoFullName = process.env.GITHUB_REPOSITORY

  if (!token) {
    throw new Error('Missing RELEASE_BOT_GITHUB_TOKEN or GITHUB_TOKEN')
  }

  if (!repoFullName) {
    throw new Error('Missing GITHUB_REPOSITORY')
  }

  const [owner, repo] = repoFullName.split('/')
  const currentCanaryVersion = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'lerna.json'), 'utf8')
  ).version

  const releaseCommitMessage =
    headCommitMessage || (await getCommitMessage(owner, repo, headSha, token))
  const releasedVersion = parseReleaseVersion(releaseCommitMessage)

  if (!releasedVersion) {
    await finish({
      should_dispatch: 'false',
      reason: 'Head commit is not a release commit',
      current_canary_version: currentCanaryVersion,
    })
    return
  }

  const jobs = await getWorkflowRunJobs(owner, repo, workflowRunId, token)
  const publishJob = jobs.find((job) => job.name === PUBLISH_RELEASE_JOB_NAME)

  // Only continue if the upstream workflow really reached the publish step.
  // A successful build-and-deploy run can still skip publishing entirely.
  if (publishJob?.conclusion !== 'success') {
    await finish({
      should_dispatch: 'false',
      reason: `${PUBLISH_RELEASE_JOB_NAME} did not complete successfully`,
      current_canary_version: currentCanaryVersion,
      publish_job_conclusion: publishJob?.conclusion ?? 'missing',
      released_version: releasedVersion,
    })
    return
  }

  if (releasedVersion.includes('-')) {
    await finish({
      should_dispatch: 'false',
      reason: `Released version ${releasedVersion} is not a stable release`,
      current_canary_version: currentCanaryVersion,
      released_version: releasedVersion,
    })
    return
  }

  if (semver.gt(currentCanaryVersion, releasedVersion)) {
    await finish({
      should_dispatch: 'false',
      reason: `Current canary version ${currentCanaryVersion} is already ahead of ${releasedVersion}`,
      current_canary_version: currentCanaryVersion,
      released_version: releasedVersion,
    })
    return
  }

  const activeTriggerReleaseRun = await getActiveTriggerReleaseRun(
    owner,
    repo,
    token
  )

  // Avoid stacking multiple canary bumps if several workflow_run events land
  // while a previous Trigger Release dispatch is still being processed.
  if (activeTriggerReleaseRun) {
    await finish({
      should_dispatch: 'false',
      reason: `Trigger Release is already ${activeTriggerReleaseRun.status} on canary`,
      active_trigger_release_url: activeTriggerReleaseRun.html_url,
      current_canary_version: currentCanaryVersion,
      released_version: releasedVersion,
    })
    return
  }

  await finish({
    should_dispatch: 'true',
    reason: `Dispatching canary preminor release because stable release ${releasedVersion} is ahead of ${currentCanaryVersion}`,
    current_canary_version: currentCanaryVersion,
    released_version: releasedVersion,
  })
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
