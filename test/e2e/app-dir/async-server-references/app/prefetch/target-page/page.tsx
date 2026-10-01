import { action } from './async-module-with-actions'

export default async function Page() {
  return (
    <main id="target-page">
      <h1>A page that uses an async server reference</h1>
      <form action={action}>
        <button type="submit">Submit</button>
      </form>
    </main>
  )
}
