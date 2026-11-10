import { testApiInPromisePassedToAfter, REQUEST_API_NAMES } from '../common'

async function action(apiName: string) {
  'use server'
  testApiInPromisePassedToAfter('action', apiName)
}

export default async function Page() {
  return (
    <main>
      {REQUEST_API_NAMES.map((apiName) => (
        <form data-api-name={apiName} action={action.bind(null, apiName)}>
          <button type="submit">Submit - {apiName}</button>
        </form>
      ))}
    </main>
  )
}
