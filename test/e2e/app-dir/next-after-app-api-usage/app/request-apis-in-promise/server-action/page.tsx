import { testApiInPromisePassedToAfter, REQUEST_API_NAMES } from '../common'

async function action(apiName: string, requestId: string) {
  'use server'
  testApiInPromisePassedToAfter('action', apiName, requestId)
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ requestId: string }>
}) {
  const { requestId } = await searchParams
  return (
    <main>
      {REQUEST_API_NAMES.map((apiName) => (
        <form
          data-api-name={apiName}
          action={action.bind(null, apiName, requestId)}
        >
          <button type="submit">Submit - {apiName}</button>
        </form>
      ))}
    </main>
  )
}
