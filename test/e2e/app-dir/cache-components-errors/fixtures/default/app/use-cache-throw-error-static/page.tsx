export default async function Page() {
  const message = await throwAnError()

  return (
    <>
      <p>
        This page doesn't catch an error that's thrown in `'use cache'` during
        prerendering.
      </p>
      <p id="message">{message}</p>
    </>
  )
}

async function throwAnError(): Promise<string> {
  'use cache'

  throw new Error('Kaputt!')
}
