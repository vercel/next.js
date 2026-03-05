import type { AgentRoute } from 'next'

export async function generateAgent(): Promise<AgentRoute.Document> {
  return {
    title: 'Manual Agent',
    summary: 'Manually authored agent output.',
    sections: [
      {
        title: 'Details',
        content: 'This section is emitted by generateAgent.',
      },
    ],
  }
}

export default function ManualPage() {
  return (
    <main>
      <h1>Manual Page</h1>
      <p>Human HTML content.</p>
    </main>
  )
}
