import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        This page is beneath a layout that opted into runtime prefetching, and
        is missing a suspense boundary around dynamic content, so it should fail
        validation. However, the parent layout opted out of validation using{' '}
        <code>unstable_disableValidation</code>, so we shouldn't error.
      </p>
    </main>
  )
}
