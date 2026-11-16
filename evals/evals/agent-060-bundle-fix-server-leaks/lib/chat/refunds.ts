import { REFUND_DRAFT_INSTRUCTIONS } from '@/lib/agents/refund-agent'

export function createRefundPrompt(orderNumber: string): string {
  return `${REFUND_DRAFT_INSTRUCTIONS}\n\nOrder number: ${orderNumber || '[enter order number]'}`
}
