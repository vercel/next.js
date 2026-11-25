const AGENT_FEEDBACK_STATUS_URL =
  'https://next-agent-feedback-gate.playground-vercel.tools/api/enabled'

type Fetch = typeof fetch

export async function isAgentFeedbackEnabled(
  fetchImpl: Fetch = fetch,
  timeoutMs = 5_000
): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(AGENT_FEEDBACK_STATUS_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })

    return response.ok && (await response.text()) === 'true'
  } finally {
    clearTimeout(timeout)
  }
}
