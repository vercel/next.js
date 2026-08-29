export type Member = { id: number; name: string; role: string }

const MEMBERS: Member[] = [
  { id: 1, name: 'Ada Lovelace', role: 'Mathematician' },
  { id: 2, name: 'Grace Hopper', role: 'Computer scientist' },
  { id: 3, name: 'Alan Turing', role: 'Computer scientist' },
  { id: 4, name: 'Katherine Johnson', role: 'Mathematician' },
]

export async function searchMembers(query: string) {
  await new Promise((resolve) =>
    setTimeout(resolve, query.toLowerCase().includes('a') ? 700 : 350)
  )
  const normalized = query.trim().toLowerCase()
  return normalized
    ? MEMBERS.filter(
        (member) =>
          member.name.toLowerCase().includes(normalized) ||
          member.role.toLowerCase().includes(normalized)
      )
    : MEMBERS
}
