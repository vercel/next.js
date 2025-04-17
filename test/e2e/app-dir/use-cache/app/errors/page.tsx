import ErrorBoundary from './error-boundary'

import { cookies } from 'next/headers'

import { currentReferer } from './util'

async function Header() {
  'use cache'
  return <div>Referer: {currentReferer()}</div>
}

export default async function Page() {
  await cookies()
  return (
    <div>
      <ErrorBoundary id="headers">
        <Header />
      </ErrorBoundary>
    </div>
  )
}
