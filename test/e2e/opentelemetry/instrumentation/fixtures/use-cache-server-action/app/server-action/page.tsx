export default function Page() {
  async function cachedServerFunction() {
    'use cache'
  }

  return (
    <form action={cachedServerFunction}>
      <button id="run-cached-server-function">
        Run cached Server Function
      </button>
    </form>
  )
}
