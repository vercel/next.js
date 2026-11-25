import { SUPPORT_AGENT_INSTRUCTIONS } from '@/lib/agents'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const userTurns = messages.filter(
    (message: { role: string }) => message.role === 'user'
  ).length

  return Response.json({
    role: 'assistant',
    content: `Thanks, I'm looking into that (${userTurns} message${userTurns === 1 ? '' : 's'} so far, ${SUPPORT_AGENT_INSTRUCTIONS.length} instruction characters loaded).`,
  })
}
