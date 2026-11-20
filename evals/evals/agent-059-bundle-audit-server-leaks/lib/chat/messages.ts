import { SUPPORT_AGENT_INSTRUCTIONS } from '@/lib/agents'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function createConversation(): ChatMessage[] {
  return [
    { role: 'system', content: SUPPORT_AGENT_INSTRUCTIONS },
    { role: 'assistant', content: 'Hi! How can I help with your order today?' },
  ]
}
