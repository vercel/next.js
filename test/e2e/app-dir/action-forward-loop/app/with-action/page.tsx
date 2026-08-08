import { ErrorBoundary } from './error-boundary'

export default function Page() {
  return (
    <main>
      <h1 id="with-action-page">with-action</h1>
      <ErrorBoundary>
        <form
          action={async () => {
            'use server'
          }}
        >
          <button id="run-action">Run action</button>
        </form>
      </ErrorBoundary>
    </main>
  )
}
