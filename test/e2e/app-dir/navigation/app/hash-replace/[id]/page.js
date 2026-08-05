import { ReplaceButton } from '../replace-button'

export default async function Page({ params }) {
  const { id } = await params

  return (
    <div id="hash-replace-dynamic">
      <div id="id">{id}</div>
      <ReplaceButton />
    </div>
  )
}
