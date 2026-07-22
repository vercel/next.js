import { RelativeHrefs } from '../../../relative-hrefs'

export default async function ParallelSlot({
  params,
}: {
  params: Promise<{ catchAll: string[] }>
}) {
  const { catchAll } = await params
  return (
    <div>
      <p>Slot for {catchAll.join('/')}</p>
      <RelativeHrefs
        id="parallel-slot-hrefs"
        targets={['/parallel/[id]', '/parallel', '/']}
      />
    </div>
  )
}
