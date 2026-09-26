import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { runGate } from './gate'

async function main(): Promise<void> {
  // Never accept a separately supplied token: the workflow's read-only job
  // token is the only credential this action should see.
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is unavailable')
  await runGate({ github: getOctokit(token), context, core })
}

main().catch((error: unknown) => {
  // An unavailable token or unexpected entry-point error cannot make CI green:
  // open the gate so the normal, required full-CI graph still runs.
  core.warning(
    `PR stack gate could not start; running full CI: ${String(error)}`
  )
  core.setOutput('skip', 'false')
})
