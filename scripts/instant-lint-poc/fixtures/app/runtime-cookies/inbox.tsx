export async function Inbox({ token }: { token: string | undefined }) {
  const res = await fetch(`https://api.example.com/inbox?token=${token}`)
  const email = await res.json()
  return <ul>{email.length}</ul>
}
