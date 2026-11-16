import { submitState } from '../actions'
import { StateForm } from '../state-form'

export const instant = false

export default async function Page({ searchParams }: PageProps<'/blocking'>) {
  const { query } = await searchParams
  return (
    <>
      <p>Query: {query ?? 'none'}</p>
      <StateForm name="blocking" action={submitState.bind(null, 'blocking')} />
    </>
  )
}
