import * as Log from '../../build/output/log'
import { bold, cyan, dim, green } from '../picocolors'
import { chooseOption } from './choose-option'
import { withHiddenInput } from './secret-input'

export type AgentAuth =
  | 'codex-openai-api-key'
  | 'claude-anthropic-api-key'
  | 'claude-subscription'

type Secret = {
  name: string
  title: string
  description: string[]
  // What the pasted value is called.
  label: string
  // The page that creates the value, or null when a command creates it.
  createUrl: string | null
  // What to do on the page that creates the value.
  createSteps: string[]
  // A reason the value cannot be right, shown to the user.
  problem?: (value: string) => string | null
}

export type SecretResult = { secret: Secret; registered: boolean }

// The page GitHub pre-fills from the URL. It cannot pre-fill the repository.
// The resource owner is left out: users report that a pre-filled owner shows
// on the page while the token is still created under their own account.
function publishTokenUrl(repo: string) {
  const query = new URLSearchParams({
    name: `next-upgrade ${repo.split('/')[1]}`.slice(0, 40),
    description: `Opens scheduled Next.js upgrade pull requests in ${repo}`,
    expires_in: '366',
    contents: 'write',
    pull_requests: 'write',
  })
  return `https://github.com/settings/personal-access-tokens/new?${query}`
}

// The agent credential is not checked here: what each provider issues can
// change, and the workflow checks the credential with the provider before
// the agent runs.
function agentSecretFor(auth: AgentAuth, name: string): Secret {
  switch (auth) {
    case 'codex-openai-api-key':
      return {
        name,
        title: 'OpenAI API key',
        description: ['An OpenAI API key for the hosted Codex agent.'],
        label: 'Key',
        createUrl: null,
        createSteps: ['Create an API key in your OpenAI account and copy it.'],
      }
    case 'claude-anthropic-api-key':
      return {
        name,
        title: 'Anthropic API key',
        description: ['An Anthropic API key for the hosted Claude Code agent.'],
        label: 'Key',
        createUrl: null,
        createSteps: [
          'Create an API key in your Claude Console account and copy it.',
        ],
      }
    case 'claude-subscription':
      return {
        name,
        title: 'Claude subscription token',
        description: [
          'A long-lived token for your Claude subscription, used by the hosted',
          'Claude Code agent.',
        ],
        label: 'Token',
        createUrl: null,
        createSteps: [
          'In another terminal, run: claude setup-token',
          'Sign in, then copy the token it prints.',
        ],
      }
    default:
      throw new Error(`Unknown agent authentication ${String(auth)}.`)
  }
}

export function setupSecrets({
  repo,
  auth,
  agentSecret,
  publishSecret,
}: {
  repo: string
  auth: AgentAuth
  agentSecret: string
  publishSecret: string
}): Secret[] {
  const [owner] = repo.split('/')
  return [
    agentSecretFor(auth, agentSecret),
    {
      name: publishSecret,
      title: 'Publication token',
      description: [
        'A fine-grained personal access token for this repository with',
        'read and write access to Contents and Pull requests.',
      ],
      label: 'Token',
      createUrl: publishTokenUrl(repo),
      createSteps: [
        'The name, permissions, and a one-year expiration are filled in.',
        `1. Resource owner: ${owner}`,
        `2. Repository access: Only select repositories > ${repo}`,
        '3. Generate token and copy it.',
      ],
      problem: (value) =>
        value.startsWith('github_pat_')
          ? null
          : 'This is not a fine-grained token. It should start with github_pat_.',
    },
  ]
}

// Walk the user through each secret that is not registered yet. Nothing here
// fails setup, because the setup pull request already exists.
export async function registerSecrets({
  secrets,
  repo,
  isRegistered,
  register,
  openUrl,
}: {
  secrets: Secret[]
  repo: string
  isRegistered: (name: string) => boolean
  // Stores the value and returns whether GitHub accepted it.
  register: (name: string, value: string) => boolean
  openUrl: (url: string) => void
}): Promise<SecretResult[]> {
  const results: SecretResult[] = []
  // Esc in any menu leaves the remaining secrets for later.
  let stopped = false
  for (const [index, secret] of secrets.entries()) {
    let registered = isRegistered(secret.name)
    if (!stopped) {
      Log.bootstrap('')
      Log.bootstrap(
        `  ${bold(`Step ${index + 1} of ${secrets.length}: ${secret.title}`)}`
      )
      if (registered) {
        Log.bootstrap(
          `  ${green('✓')} ${secret.name} is already registered in ${repo}`
        )
      } else {
        for (const line of secret.description) {
          Log.bootstrap(`  ${line}`)
        }
        const outcome = await registerSecret(secret, repo, register, openUrl)
        registered = outcome === true
        stopped = outcome === null
      }
    }
    results.push({ secret, registered })
  }
  return results
}

// Resolves to null when the user leaves the menu with Esc or Ctrl+C.
async function registerSecret(
  secret: Secret,
  repo: string,
  register: (name: string, value: string) => boolean,
  openUrl: (url: string) => void
): Promise<boolean | null> {
  let choice = await chooseOption(
    `${secret.name} is not registered in ${repo}.`,
    {
      open: secret.createUrl
        ? 'Open the page to create one'
        : 'Show how to create one',
      paste: 'Paste one I already have',
      later: 'Do it later',
    },
    0,
    true
  )
  while (choice === 'open' || choice === 'paste' || choice === 'again') {
    const opening = choice === 'open'
    // Typing stays hidden from here until GitHub has answered.
    const outcome = await withHiddenInput<
      { problem: string } | { registered: boolean } | null
    >(async (read) => {
      // A blank line sets each block apart from the menu above it.
      Log.bootstrap('')
      if (opening) {
        // Print before opening, which can take a while without a browser.
        if (secret.createUrl) {
          Log.bootstrap(`  ${dim('Opening')} ${secret.createUrl}`)
          Log.bootstrap('')
        }
        for (const line of secret.createSteps) {
          Log.bootstrap(`  ${line}`)
        }
        Log.bootstrap('')
        if (secret.createUrl) {
          openUrl(secret.createUrl)
        }
      }
      Log.bootstrap(`  ${dim('Paste it here. Input is hidden.')}`)
      const value = (await read(secret.label))?.trim()
      if (value === undefined) {
        return null
      }
      const problem = value
        ? (secret.problem?.(value) ?? null)
        : 'Nothing was pasted.'
      if (problem) {
        return { problem }
      }
      Log.bootstrap('')
      Log.bootstrap(`  ${dim(`Registering ${secret.name}...`)}`)
      return { registered: register(secret.name, value) }
    })
    if (outcome === null) {
      return null
    }
    if ('registered' in outcome) {
      Log.bootstrap(
        outcome.registered
          ? `  ${green('✓')} Registered ${secret.name} in ${repo}`
          : `  Could not register ${secret.name}. Check that the GitHub CLI can manage secrets in ${repo}.`
      )
      return outcome.registered
    }
    choice = await chooseOption(
      outcome.problem,
      { again: 'Paste again', later: 'Do it later' },
      0,
      true
    )
  }
  return choice === 'later' ? false : null
}

// The closing list: what is done, then what is left, in order.
export function remainingSteps({
  results,
  repo,
  url,
}: {
  results: SecretResult[]
  repo: string
  url: string
}): string {
  const done = results.filter((result) => result.registered)
  const left = results.filter((result) => !result.registered)
  const count = left.length + 1
  const lines = [
    '',
    `  ${bold(count === 1 ? 'One step left' : `Finish setup in ${count} steps`)}`,
    '',
    ...done.map(({ secret }) => `  ${green('✓')} ${secret.title} registered`),
    ...(done.length ? [''] : []),
  ]
  // A single step needs no number.
  const heading = (index: number, text: string) =>
    `  ${bold(count === 1 ? text : `${index}. ${text}`)}`
  left.forEach(({ secret }, index) => {
    lines.push(
      heading(index + 1, `Add ${secret.name}`),
      ...secret.description.map((line) => `     ${line}`),
      '',
      ...(secret.createUrl
        ? [`     ${dim('Create one:')} ${secret.createUrl}`]
        : secret.createSteps.map((line) => `     ${line}`)),
      // The host keeps the command on GitHub.com when the GitHub CLI defaults
      // to another host.
      `     ${cyan(`gh secret set ${secret.name} --repo github.com/${repo}`)}`,
      ''
    )
  })
  lines.push(
    heading(count, 'Merge the setup pull request'),
    `     ${cyan(url)}`,
    '',
    '     Review and merge it. Upgrades then run every week.',
    `     ${dim('Run one now:')} Actions > Next.js upgrade > Run workflow`,
    ''
  )
  return lines.join('\n')
}
