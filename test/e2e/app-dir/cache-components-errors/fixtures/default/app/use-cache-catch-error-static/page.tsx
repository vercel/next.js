export default async function Page() {
  let message = 'fallback'

  try {
    message = await throwAnError()
  } catch {}

  return (
    <>
      <p>
        This page catches an error that's thrown in `'use cache'` during
        prerendering, and renders a fallback.
      </p>
      <p id="message">{message}</p>
    </>
  )
}

async function throwAnError(): Promise<string> {
  'use cache'

  throw new Error('Kaputt!')
}
