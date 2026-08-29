export type Member = { id: number; name: string; role: string }
export type MemberPage = { members: Member[]; hasMore: boolean }

const MEMBERS: Member[] = [
  { id: 1, name: 'Ada Lovelace', role: 'Mathematician' },
  { id: 2, name: 'Grace Hopper', role: 'Computer scientist' },
  { id: 3, name: 'Alan Turing', role: 'Computer scientist' },
  { id: 4, name: 'Katherine Johnson', role: 'Mathematician' },
  { id: 5, name: 'Claude Shannon', role: 'Information theorist' },
  { id: 6, name: 'Radia Perlman', role: 'Network engineer' },
]

const PAGE_SIZE = 3

export async function getMembers(page: number): Promise<MemberPage> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  const start = (page - 1) * PAGE_SIZE
  return {
    members: MEMBERS.slice(start, start + PAGE_SIZE),
    hasMore: start + PAGE_SIZE < MEMBERS.length,
  }
}
