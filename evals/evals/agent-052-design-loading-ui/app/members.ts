export type Member = { id: number; name: string; role: string }

const MEMBERS: Member[] = [
  { id: 1, name: 'Ada Lovelace', role: 'Mathematician' },
  { id: 2, name: 'Grace Hopper', role: 'Computer scientist' },
  { id: 3, name: 'Alan Turing', role: 'Computer scientist' },
  { id: 4, name: 'Katherine Johnson', role: 'Mathematician' },
  { id: 5, name: 'Claude Shannon', role: 'Information theorist' },
  { id: 6, name: 'Barbara Liskov', role: 'Language designer' },
  { id: 7, name: 'Donald Knuth', role: 'Professor' },
  { id: 8, name: 'Radia Perlman', role: 'Network engineer' },
]

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getStats() {
  await delay(250)
  return { people: MEMBERS.length, teams: 4 }
}

export async function getMembers() {
  await delay(450)
  return MEMBERS
}
