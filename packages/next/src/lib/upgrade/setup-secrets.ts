import * as Log from '../../build/output/log'
import { bold, cyan, dim, green } from '../picocolors'
import { chooseOption } from './choose-option'
import { withHiddenInput } from './secret-input'

export type AgentAuth =
  | 'codex-openai-api-key'
  | 'claude-anthropic-api-key'
  | 'codex-ai-gateway-api-key'
  | 'claude-ai-gateway-api-key'

type Secret = {
  name: string
  title: string
  description: string[]
  label: string
  createUrl: string
  createSteps: string[]
  problem: ((value: string) => string | null) | null
}

type SecretResult = { secret: Secret; registered: boolean }

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
  const gatewaySecret = {
    name: agentSecret,
    title: 'Vercel AI Gateway API key',
    label: 'Key',
    createUrl:
      'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys%3FshowCreateKeyModal',
    createSteps: ['Create a key, then paste it below.'],
    problem: null,
  }
  const agentSecrets: Record<AgentAuth, Secret> = {
    'codex-openai-api-key': {
      name: agentSecret,
      title: 'OpenAI API key',
      description: ['An OpenAI API key for the hosted Codex agent.'],
      label: 'Key',
      createUrl: 'https://platform.openai.com/api-keys',
      createSteps: ['Create a secret key, then paste it below.'],
      problem: null,
    },
    'claude-anthropic-api-key': {
      name: agentSecret,
      title: 'Anthropic API key',
      description: ['An Anthropic API key for the hosted Claude Code agent.'],
      label: 'Key',
      createUrl: 'https://platform.claude.com/settings/keys',
      createSteps: ['Create a key, then paste it below.'],
      problem: null,
    },
    'codex-ai-gateway-api-key': {
      ...gatewaySecret,
      description: ['A Vercel AI Gateway API key for the hosted Codex agent.'],
    },
    'claude-ai-gateway-api-key': {
      ...gatewaySecret,
      description: [
        'A Vercel AI Gateway API key for the hosted Claude Code agent.',
      ],
    },
  }
  return [
    // The agent credential is not checked here: what each provider issues can
    // change, and the workflow checks the credential with the provider before
    // the agent runs.
    agentSecrets[auth],
    {
      name: publishSecret,
      title: 'Publication token',
      description: [
        'A fine-grained personal access token for this repository with',
        'read and write access to Contents and Pull requests.',
      ],
      label: 'Token',
      // The page GitHub pre-fills from the URL. It cannot pre-fill the
      // repository. The resource owner is left out: users report that a
      // pre-filled owner shows on the page while the token is still created
      // under their own account.
      createUrl: `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams(
        {
          name: `next-upgrade ${repo.split('/')[1]}`.slice(0, 40),
          description: `Opens scheduled Next.js upgrade pull requests in ${repo}`,
          contents: 'write',
          pull_requests: 'write',
        }
      )}`,
      createSteps: [
        'The name and permissions are filled in.',
        `1. Resource owner: ${owner}`,
        `2. Repository access: Only select repositories > ${repo}`,
        '3. Expiration: 90 days or longer. The workflow stops when it expires.',
        '4. Generate token, then paste it below.',
      ],
      problem: (value) =>
        value.startsWith('github_pat_')
          ? null
          : 'This is not a fine-grained token. It should start with github_pat_.',
    },
  ]
}

// Walk the user through each secret, and offer to replace one that is already
// registered. Nothing here fails setup, because the setup pull request already
// exists.
export async function registerSecrets({
  secrets,
  repo,
  isRegistered,
  register,
  openUrl,
}: {
  secrets: Secret[]
  repo: string
  isRegistered: (name: string) => boolean | null
  register: ({ name, value }: { name: string; value: string }) => string | null
  openUrl: (url: string) => void
}): Promise<SecretResult[]> {
  // Look every secret up first: a lookup between two hidden inputs would run
  // with the terminal echoing again.
  const lookups = secrets.map((secret) => isRegistered(secret.name))
  const results: SecretResult[] = []
  // Esc in any menu leaves the remaining secrets for later.
  let stopped = false
  for (const [index, secret] of secrets.entries()) {
    const lookup = lookups[index]
    // An unknown lookup stays a step left, so the closing list shows it.
    let registered = lookup === true
    if (!stopped) {
      Log.bootstrap('')
      Log.bootstrap(
        `  ${bold(`Step ${index + 1} of ${secrets.length}: ${secret.title}`)}`
      )
      for (const line of secret.description) {
        Log.bootstrap(`  ${line}`)
      }

      // A registered secret can be the wrong kind, such as an OpenAI key left
      // from an earlier setup that chose Codex, so it can be replaced.
      const later = registered ? 'Keep the registered one' : 'Do it later'
      let choice = await chooseOption({
        question:
          lookup === null
            ? `Could not check whether ${secret.name} is registered in ${repo}. Registering one replaces any that is there.`
            : registered
              ? `${secret.name} is already registered in ${repo}. Keep it only if it holds the ${secret.title}.`
              : `${secret.name} is not registered in ${repo}.`,
        values: {
          open: 'Open the page to create one',
          paste: 'Paste one I already have',
          later,
        },
        defaultValue: registered ? 2 : 0,
        firstPrompt: true,
      })
      while (choice === 'open' || choice === 'paste' || choice === 'again') {
        const opening = choice === 'open'
        // Typing stays hidden from here until GitHub has answered.
        const outcome = await withHiddenInput<
          { problem: string } | { failure: string | null } | null
        >({
          input: process.stdin,
          output: process.stdout,
          task: async (read) => {
            Log.bootstrap('')
            if (opening) {
              Log.bootstrap(`  ${dim('Open')} ${secret.createUrl}`)
              Log.bootstrap('')
              for (const line of secret.createSteps) {
                Log.bootstrap(`  ${line}`)
              }

              Log.bootstrap('')
              openUrl(secret.createUrl)
            } else {
              Log.bootstrap(`  ${dim('Paste it below.')}`)
            }

            const line = await read(secret.label)
            if (line === null) {
              return null
            }

            const value = line.trim()
            const problem = !value
              ? 'Nothing was pasted.'
              : secret.problem === null
                ? null
                : secret.problem(value)
            if (problem) {
              return { problem }
            }

            Log.bootstrap('')
            Log.bootstrap(`  ${dim(`Registering ${secret.name}...`)}`)
            return { failure: register({ name: secret.name, value }) }
          },
        })
        if (outcome === null) {
          choice = null
          break
        }

        if ('failure' in outcome) {
          Log.bootstrap(
            outcome.failure === null
              ? `  ${green('✓')} Registered ${secret.name} in ${repo}`
              : `  Could not register ${secret.name} in ${repo}. ${outcome.failure}`
          )
          // A failed replacement may have left a secret the user rejected, so
          // it stays a step left.
          registered = outcome.failure === null
          break
        }

        choice = await chooseOption({
          question: outcome.problem,
          values: { again: 'Paste again', later },
          defaultValue: 0,
          firstPrompt: true,
        })
      }

      stopped = choice === null || choice === undefined
    }

    results.push({ secret, registered })
  }

  return results
}

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
    ...done.map(({ secret }) => `  ${green('✓')} ${secret.name} registered`),
    ...(done.length ? [''] : []),
  ]
  left.forEach(({ secret }, index) => {
    lines.push(
      `  ${bold(`${index + 1}. Add ${secret.name}`)}`,
      ...secret.description.map((line) => `     ${line}`),
      '',
      `     ${dim('Create one:')} ${secret.createUrl}`,
      ...secret.createSteps.map((line) => `     ${line}`),
      // The host keeps the command on GitHub.com when the GitHub CLI defaults
      // to another host.
      `     ${cyan(`gh secret set ${secret.name} --repo github.com/${repo}`)}`,
      ''
    )
  })
  lines.push(
    `  ${bold(count === 1 ? 'Merge the setup pull request' : `${count}. Merge the setup pull request`)}`,
    `     ${cyan(url)}`,
    '',
    '     Review and merge it. Upgrades then run every day.',
    `     ${dim('Run one now:')} Actions > Next.js upgrade > Run workflow`,
    ''
  )
  return lines.join('\n')
}
