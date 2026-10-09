import { existsSync } from 'fs'
import { createHash } from 'crypto'
import { dirname, join, relative, sep } from 'path'

import type { AgentUpgradePolicy } from '../../telemetry/events/agent-upgrade'
import {
  chooseOption,
  getHarnessDisplayName,
  runHandoff,
  type UpgradeHarnessName,
} from './harness'

// The upgrade action lives beside the upgrade package and is pinned per release.
export const UPGRADE_ACTION_REPOSITORY = 'vercel/next.js'
export const UPGRADE_ACTION_PATH = 'packages/next-upgrade/action'
// Keep in sync with the pinned checkout used across this repository's workflows.
const CHECKOUT_ACTION =
  'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2'

export type CISchedule = 'weekly' | 'daily' | 'manual'

export const CI_SCHEDULES: Record<CISchedule, string | null> = {
  weekly: '0 9 * * 1',
  daily: '0 9 * * *',
  manual: null,
}

const POLICIES: readonly AgentUpgradePolicy[] = [
  'security',
  'latest',
  'experimental-future',
]

const POLICY_LABELS: Record<AgentUpgradePolicy, string> = {
  security: 'Security — upgrade when a security advisory affects the app',
  latest: 'Latest — upgrade to the latest release',
  'experimental-future':
    'Experimental Future — upgrade to the latest release and adopt Future Defaults',
}

const SCHEDULE_LABELS: Record<CISchedule, string> = {
  weekly: 'Weekly (Mondays at 09:00 UTC)',
  daily: 'Daily (09:00 UTC)',
  manual: 'Manual only',
}

export type CISetupInput = {
  agent: UpgradeHarnessName
  model: string | null
  effort: string
  policy: AgentUpgradePolicy
  schedule: CISchedule
  // The app directory relative to the Git root, using `/` separators.
  directory: string
  // The Next.js version that ships the pinned action.
  nextVersion: string
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function getSecretName(agent: UpgradeHarnessName): string {
  return agent === 'codex' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
}

export function buildCISetupPrompt(input: CISetupInput): string {
  const tag = `v${input.nextVersion}`
  const secret = getSecretName(input.agent)
  const cron = CI_SCHEDULES[input.schedule]
  const actionReference = `${UPGRADE_ACTION_REPOSITORY}/${UPGRADE_ACTION_PATH}`
  // Keep root-app setup compatible while giving each monorepo app its own file.
  const appKey =
    input.directory === '.'
      ? null
      : createHash('sha256').update(input.directory).digest('hex').slice(0, 12)
  const workflowName =
    appKey === null ? 'next-upgrade' : `next-upgrade-${appKey}`

  const triggers = cron
    ? `on:\n  schedule:\n    - cron: '${cron}'\n  workflow_dispatch:`
    : 'on:\n  workflow_dispatch:'
  const inputs = [
    `agent: ${input.agent}`,
    `api-key: \${{ secrets.${secret} }}`,
    `policy: ${input.policy}`,
    ...(input.directory !== '.'
      ? [`directory: ${yamlString(input.directory)}`]
      : []),
    ...(input.model !== null ? [`model: ${yamlString(input.model)}`] : []),
    ...(input.effort !== 'default'
      ? [`effort: ${yamlString(input.effort)}`]
      : []),
  ]

  const workflow = `name: Upgrade Next.js
${triggers}
permissions:
  contents: write
  pull-requests: write
concurrency:
  group: ${workflowName}
  cancel-in-progress: false
jobs:
  upgrade:
    runs-on: ubuntu-latest
    steps:
      - uses: ${CHECKOUT_ACTION}
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: ${actionReference}@<commit SHA> # ${tag}
        with:
${inputs.map((line) => `          ${line}`).join('\n')}`

  return `Set up a GitHub Actions workflow that keeps the Next.js app in ${JSON.stringify(input.directory)} (relative to the Git repository root) upgraded with ${getHarnessDisplayName(input.agent)}. Work in the current checkout.

1. Confirm this is a Git repository with a GitHub remote. If it is not, explain that the workflow needs one and stop.
2. Check for duplicates first: look in \`.github/workflows/\` for a workflow that already uses \`${actionReference}\` or runs \`next upgrade --agent\` for this app. If one exists, update it to match the workflow below instead of adding another one.
3. Resolve the commit SHA of the \`${tag}\` tag with \`git ls-remote https://github.com/${UPGRADE_ACTION_REPOSITORY} refs/tags/${tag}\`. Confirm that \`${UPGRADE_ACTION_PATH}/action.yml\` exists at that commit, for example from \`https://raw.githubusercontent.com/${UPGRADE_ACTION_REPOSITORY}/<commit SHA>/${UPGRADE_ACTION_PATH}/action.yml\`. If the tag or the action is missing, stop and report it. Never guess another ref.
4. Write \`.github/workflows/${workflowName}.yml\` at the Git repository root with exactly this content, replacing \`<commit SHA>\` with the resolved SHA. If a workflow for this app already exists, update that file instead. Never overwrite a workflow for another app. If the selected filename belongs to another app, stop and report the conflict:

\`\`\`yaml
${workflow}
\`\`\`

Keep these constraints even when updating an existing workflow:
- Trigger only on ${cron ? `\`schedule\` (\`${cron}\`) and ` : ''}\`workflow_dispatch\`. Never add \`pull_request\`, \`pull_request_target\`, \`issue_comment\`, or other triggers that run on untrusted input.
- Grant only \`contents: write\` and \`pull-requests: write\`.
- Reference the API key only as \`\${{ secrets.${secret} }}\`. Never write a secret value into any file.

5. Check that the YAML parses and that the action is pinned to the full commit SHA.
6. Ask the user before committing, pushing, or opening a pull request. With their permission, commit the workflow on a new branch and open a draft pull request.
7. Finally, tell the user to:
   - Add the \`${secret}\` repository secret (Settings → Secrets and variables → Actions).
   - Enable "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General).
   - Optionally set \`NEXT_TELEMETRY_DISABLED: 1\` in the workflow \`env\` to opt out of Next.js telemetry.`
}

export function findGitRoot(directory: string): string | null {
  let current = directory
  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

export function getAppDirectoryFromGitRoot(directory: string): string {
  const root = findGitRoot(directory)
  const relativePath = root ? relative(root, directory) : ''
  return relativePath ? relativePath.split(sep).join('/') : '.'
}

type CISetupOptions = {
  directory: string
  nextVersion: string
  defaultPolicy: AgentUpgradePolicy
}

async function chooseCIAgent(
  previous: UpgradeHarnessName | undefined,
  firstPrompt: boolean
) {
  const agents: UpgradeHarnessName[] = ['claude', 'codex']
  const choice = await chooseOption(
    'Which coding agent should run upgrades in GitHub Actions?',
    Object.fromEntries(
      agents.map((agent) => [agent, getHarnessDisplayName(agent)])
    ),
    Math.max(0, agents.indexOf(previous ?? 'claude')),
    firstPrompt
  )
  if (choice === null || choice === undefined) {
    return choice
  }
  const agent = agents.find((value) => value === choice)
  if (!agent) {
    throw new Error(`Unknown CI agent: ${choice}`)
  }
  return agent
}

// Policy and schedule complete the shared agent stages. Esc on the policy
// question returns to the previous stage, and Esc on schedule returns to policy.
async function chooseWorkflowSettings(
  state: { policy: AgentUpgradePolicy; schedule: CISchedule },
  firstPrompt: boolean
): Promise<boolean | null | undefined> {
  let stage: 'policy' | 'schedule' = 'policy'
  while (true) {
    if (stage === 'policy') {
      const policy = await chooseOption(
        'Which upgrade policy should the workflow use?',
        POLICY_LABELS,
        POLICIES.indexOf(state.policy),
        firstPrompt
      )
      if (policy === null || policy === undefined) {
        return policy
      }
      const selected = POLICIES.find((value) => value === policy)
      if (!selected) {
        throw new Error(`Unknown upgrade policy: ${policy}`)
      }
      state.policy = selected
      stage = 'schedule'
    } else {
      const schedules = Object.keys(SCHEDULE_LABELS) as CISchedule[]
      const schedule = await chooseOption(
        'When should the workflow run?',
        SCHEDULE_LABELS,
        schedules.indexOf(state.schedule)
      )
      if (schedule === null) {
        return null
      }
      if (schedule === undefined) {
        stage = 'policy'
        continue
      }
      const selected = schedules.find((value) => value === schedule)
      if (!selected) {
        throw new Error(`Unknown workflow schedule: ${schedule}`)
      }
      state.schedule = selected
      return true
    }
  }
}

export async function handoffCISetup(
  options: CISetupOptions
): Promise<'handed_off' | 'cancelled' | 'failed'> {
  const directory = getAppDirectoryFromGitRoot(options.directory)
  const settings = {
    policy: options.defaultPolicy,
    schedule: 'weekly' as CISchedule,
  }
  let copyAgent: UpgradeHarnessName | undefined

  const prompt = (
    agent: UpgradeHarnessName,
    model: string | null,
    effort: string
  ) =>
    buildCISetupPrompt({
      agent,
      model,
      effort,
      policy: settings.policy,
      schedule: settings.schedule,
      directory,
      nextVersion: options.nextVersion,
    })

  return runHandoff(
    {
      promptName: 'GitHub Action setup prompt',
      printPrompt: (existingAgent) =>
        prompt(
          existingAgent === 'codex' || existingAgent === 'claude'
            ? existingAgent
            : 'claude',
          null,
          'default'
        ),
      copyPrompt: async (firstPrompt) => {
        // Without a local agent to read from, ask which agent runs in CI.
        let stage: 'agent' | 'settings' = 'agent'
        while (true) {
          if (stage === 'agent') {
            const agent = await chooseCIAgent(copyAgent, firstPrompt)
            if (agent === null || agent === undefined) {
              return agent
            }
            copyAgent = agent
            stage = 'settings'
          } else {
            const result = await chooseWorkflowSettings(settings, false)
            if (result === null) {
              return null
            }
            if (result === undefined) {
              stage = 'agent'
              continue
            }
            return prompt(copyAgent!, null, 'default')
          }
        }
      },
      finish: async ({ harness, model, effort }) => {
        const result = await chooseWorkflowSettings(settings, false)
        return result === null || result === undefined
          ? result
          : prompt(harness, model, effort)
      },
    },
    options.directory,
    null
  )
}
