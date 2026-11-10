import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import {
  getLiveQuestions,
  getRelatedSessions,
  getSession,
} from '@/lib/sessions'
import { saveSessionSummary } from './actions'

export default function SessionPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p>Loading session…</p>}>
        <SessionSummary params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading related sessions…</p>}>
        <RelatedSessions params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading live questions…</p>}>
        <LiveQuestions params={params} />
      </Suspense>
    </main>
  )
}

async function SessionSummary({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await getSession(slug)
  if (!session) notFound()

  return (
    <header data-testid="session-summary">
      <h1>{session.title}</h1>
      <p>{session.speaker}</p>
      <p data-testid="session-summary-text">{session.summary}</p>
      <form action={saveSessionSummary}>
        <input name="slug" type="hidden" value={slug} />
        <label htmlFor="summary">Summary</label>
        <input defaultValue={session.summary} id="summary" name="summary" />
        <button type="submit">Save summary</button>
      </form>
    </header>
  )
}

async function RelatedSessions({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const sessions = await getRelatedSessions(slug)

  return (
    <section data-testid="related-sessions">
      <h2>Related sessions</h2>
      {sessions.map((session) => (
        <p key={session.slug}>{session.title}</p>
      ))}
    </section>
  )
}

async function LiveQuestions({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const questions = await getLiveQuestions(slug)

  return (
    <section data-testid="live-questions">
      <h2>Live audience questions</h2>
      {questions.map((question) => (
        <p key={question}>{question}</p>
      ))}
    </section>
  )
}
