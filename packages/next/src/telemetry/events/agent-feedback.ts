export const eventNameAgentFeedback = 'NEXT_AGENT_FEEDBACK'

export const agentFeedbackTypes = [
  'inefficient_task',
  'excessive_searching',
  'permissions_denied',
  'missing_documentation',
  'broken_documentation_link',
  'network_failure',
  'typescript_error',
  'build_failure',
  'test_failure_systematic',
  'lint_failure',
  'missing_configuration',
  'unclear_pattern',
  'timeout',
  'pnpm_failure',
  'other',
] as const

export const agentFeedbackOutcomes = [
  'blocked',
  'abandoned',
  'recovered_with_workaround',
] as const

export const agentFeedbackSeverities = ['critical', 'warning', 'info'] as const

export const agentFeedbackModels = {
  openai: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
  anthropic: [
    'claude-fable-5',
    'claude-opus-5',
    'claude-opus-4.8',
    'claude-sonnet-5',
  ],
  google: ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3-pro-preview'],
  xai: ['grok-4.6', 'grok-4.5'],
  zai: ['glm-5.3', 'glm-5.2'],
  moonshot: ['kimi-k3'],
  alibaba: ['qwen3.8-max', 'qwen3.7-max', 'qwen3.7-plus'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  minimax: ['minimax-m3'],
  other: ['other'],
  unknown: ['unknown'],
} as const

export type AgentFeedbackType = (typeof agentFeedbackTypes)[number]
export type AgentFeedbackOutcome = (typeof agentFeedbackOutcomes)[number]
export type AgentFeedbackSeverity = (typeof agentFeedbackSeverities)[number]
export type AgentFeedbackModelProvider = keyof typeof agentFeedbackModels
export type AgentFeedbackModel =
  (typeof agentFeedbackModels)[AgentFeedbackModelProvider][number]

export type EventAgentFeedback = {
  feedbackType: AgentFeedbackType
  outcome: AgentFeedbackOutcome
  severity: AgentFeedbackSeverity
  modelProvider: AgentFeedbackModelProvider
  model: AgentFeedbackModel
  inputTokens: number
  outputTokens: number
  durationMilliseconds: number
  toolCallCount: number
}

export function eventAgentFeedback(event: EventAgentFeedback): {
  eventName: string
  payload: EventAgentFeedback
} {
  return {
    eventName: eventNameAgentFeedback,
    payload: event,
  }
}
