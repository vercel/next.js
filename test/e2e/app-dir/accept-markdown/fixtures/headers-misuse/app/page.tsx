import { headers } from 'next/headers'

export async function markdown() {
  const h = await headers()
  return `# ${h.get('user-agent')}\n`
}

export default function Page() {
  return <p>headers misuse</p>
}
