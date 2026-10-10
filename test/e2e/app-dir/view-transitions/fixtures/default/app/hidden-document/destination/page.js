import { ViewTransition } from 'react'

export default function Page() {
  return (
    <ViewTransition name="hidden-document-page">
      <main data-page="destination">Destination</main>
    </ViewTransition>
  )
}
