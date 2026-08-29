export type Member = { id: string; name: string; role: string; bio: string }
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
]

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  return MEMBERS.filter((member) => member.id !== id)
}
