// Keep newly launched upgrade sessions aligned with the default eval models.
// Gateway identifiers are used by the eval adapter, not by native user CLIs.
export const UPGRADE_MODELS = {
  codex: {
    cli: 'gpt-5.6-luna',
    gateway: 'openai/gpt-5.6-luna',
  },
  claude: {
    cli: 'claude-haiku-4-5',
    gateway: 'anthropic/claude-haiku-4.5',
  },
} as const
