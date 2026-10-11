import 'server-only'

export default async function ProductionSubject({ label }: { label: string }) {
  const value = await Promise.resolve(label)
  return (
    <section>
      {value}: {process.env.NODE_ENV}
    </section>
  )
}
