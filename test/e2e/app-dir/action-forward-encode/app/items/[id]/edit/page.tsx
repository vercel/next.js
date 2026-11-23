import { saveDraft } from './actions'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <form action={saveDraft.bind(null, id)}>
      <input name="value" defaultValue="hello" />
      <button type="submit" id="submit">
        save
      </button>
    </form>
  )
}
