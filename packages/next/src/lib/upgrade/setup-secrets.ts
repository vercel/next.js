import { bold, cyan, dim } from '../picocolors'

export type AgentAuth = 'codex-openai-api-key' | 'claude-anthropic-api-key'

type Secret = {
  name: string
  title: string
  description: string[]
  createUrl: string | null
  createSteps: string[]
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
    // The agent credential is not checked here: what each provider issues can
    // change, and the workflow checks the credential with the provider before
    // the agent runs.
    auth === 'codex-openai-api-key'
      ? {
          name: agentSecret,
          title: 'OpenAI API key',
          description: ['An OpenAI API key for the hosted Codex agent.'],
          createUrl: null,
          createSteps: [
            'Create an API key in your OpenAI account and copy it.',
          ],
        }
      : {
          name: agentSecret,
          title: 'Anthropic API key',
          description: [
            'An Anthropic API key for the hosted Claude Code agent.',
          ],
          createUrl: null,
          createSteps: [
            'Create an API key in your Claude Console account and copy it.',
          ],
        },
    {
      name: publishSecret,
      title: 'Publication token',
      description: [
        'A fine-grained personal access token for this repository with',
        'read and write access to Contents and Pull requests.',
      ],
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
    },
  ]
}

export function remainingSteps({
  secrets,
  repo,
  url,
}: {
  secrets: Secret[]
  repo: string
  url: string
}): string {
  const count = secrets.length + 1
  const lines = ['', `  ${bold(`Finish setup in ${count} steps`)}`, '']
  secrets.forEach((secret, index) => {
    lines.push(
      `  ${bold(`${index + 1}. Add ${secret.name}`)}`,
      ...secret.description.map((line) => `     ${line}`),
      '',
      ...(secret.createUrl
        ? [`     ${dim('Create one:')} ${secret.createUrl}`]
        : []),
      ...secret.createSteps.map((line) => `     ${line}`),
      // The host keeps the command on GitHub.com when the GitHub CLI defaults
      // to another host.
      `     ${cyan(`gh secret set ${secret.name} --repo github.com/${repo}`)}`,
      ''
    )
  })
  lines.push(
    `  ${bold(`${count}. Merge the setup pull request`)}`,
    `     ${cyan(url)}`,
    '',
    '     Review and merge it. Upgrades then run every day.',
    `     ${dim('Run one now:')} Actions > Next.js upgrade > Run workflow`,
    ''
  )
  return lines.join('\n')
}
