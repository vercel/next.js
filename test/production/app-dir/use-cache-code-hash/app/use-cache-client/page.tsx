import { ClientComponent } from './client-reference'

import './client-reference-css.css'

export default async function Page() {
  'use cache'
  return (
    <p>
      <ClientComponent />
    </p>
  )
}
