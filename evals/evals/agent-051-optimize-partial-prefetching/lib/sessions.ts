import { connection } from 'next/server'

export type Session = {
  slug: string
  title: string
  speaker: string
  summary: string
}

const sessions: Session[] = [
  {
    slug: 'aurora-keynote',
    title: 'Aurora Keynote',
    speaker: 'Mina Park',
    summary: 'Building resilient interfaces for distributed teams.',
  },
  {
    slug: 'designing-for-delay',
    title: 'Designing for Delay',
    speaker: 'Theo Grant',
    summary: 'Making asynchronous systems feel immediate.',
  },
  {
    slug: 'operational-calm',
    title: 'Operational Calm',
    speaker: 'Rhea Stone',
    summary: 'Keeping incident response focused and humane.',
  },
]

export async function getSessions() {
  return sessions
}

export async function getSession(slug: string) {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 150))
  return sessions.find((session) => session.slug === slug) ?? null
}

export async function getRelatedSessions(slug: string) {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 350))
  return sessions.filter((session) => session.slug !== slug)
}

export async function getLiveQuestions(slug: string) {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return [`What should teams try first after ${slug}?`]
}
