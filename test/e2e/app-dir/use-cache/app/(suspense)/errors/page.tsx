import ErrorBoundary from './error-boundary'

import { cookies } from 'next/headers'

import { currentUser, currentReferer, isEditing } from './util'

async function Cookie() {
  'use cache'
  return <div>User: {currentUser()}</div>
}

async function Header() {
  'use cache'
  return <div>Referer: {currentReferer()}</div>
}

async function DraftMode() {
  'use cache'
  return <div>Editing: {isEditing()}</div>
}

export default async function Page() {
  await cookies()
  return (
    <div>
      <ErrorBoundary id="cookies">
        <Cookie />
      </ErrorBoundary>
      <ErrorBoundary id="headers">
        <Header />
      </ErrorBoundary>
      <ErrorBoundary id="draft-mode">
        <DraftMode />
      </ErrorBoundary>
    </div>
  )
}
