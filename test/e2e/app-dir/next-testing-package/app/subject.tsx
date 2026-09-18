import 'server-only'

export default async function Subject({ name }: { name: string }) {
  return <section>Hello {name}</section>
}
