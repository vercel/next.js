import { redirect } from 'next/navigation'

export default async function Page({ params: { id } }) {
  if (id === 'source') redirect('/dynamic/dest')

  return (
    <div>
      <p>{`id:${id}`}</p>
    </div>
  )
}
