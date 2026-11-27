import { setupSecrets } from './setup-secrets'

describe('setupSecrets', () => {
  it('asks for the key of the chosen credential', () => {
    const agentSecrets = (
      [
        'codex-openai-api-key',
        'claude-anthropic-api-key',
        'codex-ai-gateway-api-key',
        'claude-ai-gateway-api-key',
      ] as const
    ).map((auth) => {
      const [secret] = setupSecrets({
        repo: 'acme/web',
        auth,
        agentSecret: 'NEXT_UPGRADE_AGENT_CREDENTIAL',
        publishSecret: 'NEXT_UPGRADE_PUBLISH_TOKEN',
      })
      return [secret.name, secret.title, secret.description, secret.createUrl]
    })

    expect(agentSecrets).toMatchInlineSnapshot(`
     [
       [
         "NEXT_UPGRADE_AGENT_CREDENTIAL",
         "OpenAI API key",
         [
           "An OpenAI API key for the hosted Codex agent.",
         ],
         "https://platform.openai.com/api-keys",
       ],
       [
         "NEXT_UPGRADE_AGENT_CREDENTIAL",
         "Anthropic API key",
         [
           "An Anthropic API key for the hosted Claude Code agent.",
         ],
         "https://platform.claude.com/settings/keys",
       ],
       [
         "NEXT_UPGRADE_AGENT_CREDENTIAL",
         "Vercel AI Gateway API key",
         [
           "A Vercel AI Gateway API key for the hosted Codex agent.",
         ],
         "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys%3FshowCreateKeyModal",
       ],
       [
         "NEXT_UPGRADE_AGENT_CREDENTIAL",
         "Vercel AI Gateway API key",
         [
           "A Vercel AI Gateway API key for the hosted Claude Code agent.",
         ],
         "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys%3FshowCreateKeyModal",
       ],
     ]
    `)
  })
})
