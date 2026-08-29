export type Member = {
  id: string
  name: string
  role: string
  bio: string
}

export type MemberPage = { members: Member[]; hasMore: boolean }
export type ActivityItem = { id: string; label: string }

const MEMBERS: Member[] = [
  {
    id: 'ada',
    name: 'Ada Lovelace',
    role: 'Mathematician',
    bio: 'Wrote the first algorithm intended for a machine.',
  },
  {
    id: 'grace',
    name: 'Grace Hopper',
    role: 'Computer scientist',
    bio: 'Pioneered machine-independent programming languages.',
  },
  {
    id: 'alan',
    name: 'Alan Turing',
    role: 'Computer scientist',
    bio: 'Formalized computation and artificial intelligence.',
  },
  {
    id: 'katherine',
    name: 'Katherine Johnson',
    role: 'Mathematician',
    bio: 'Calculated trajectories for human spaceflight.',
  },
  {
    id: 'claude',
    name: 'Claude Shannon',
    role: 'Information theorist',
    bio: 'Founded the field of information theory.',
  },
  {
    id: 'barbara',
    name: 'Barbara Liskov',
    role: 'Language designer',
    bio: 'Developed foundational ideas in data abstraction.',
  },
  {
    id: 'donald',
    name: 'Donald Knuth',
    role: 'Professor',
    bio: 'Advanced the analysis of algorithms.',
  },
  {
    id: 'radia',
    name: 'Radia Perlman',
    role: 'Network engineer',
    bio: 'Designed the spanning tree protocol.',
  },
]

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getStats() {
  await delay(250)
  return { people: MEMBERS.length, teams: 4 }
}

export async function getMembers(page = 1, query = ''): Promise<MemberPage> {
  await delay(query.length === 1 ? 700 : 450)
  const matches = MEMBERS.filter((member) =>
    `${member.name} ${member.role}`.toLowerCase().includes(query.toLowerCase())
  )
  const end = page * 4
  return { members: matches.slice(0, end), hasMore: end < matches.length }
}

export async function getMember(id: string) {
  await delay(800)
  return MEMBERS.find((member) => member.id === id) ?? null
}

export async function getActivity(id: string): Promise<ActivityItem[]> {
  await delay(300)
  return [{ id: '1', label: `${id} shipped a design document` }]
}

export async function getRelated(id: string) {
  await delay(500)
  return MEMBERS.filter((member) => member.id !== id).slice(0, 3)
}
