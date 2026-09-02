import { ClientComponent } from './client-reference'
import { preinit } from 'react-dom'

import './client-reference-css.css'

export default async function Page() {
  'use cache'

  if (Date.now() < 0) {
    // Try importing anything from react-dom
    preinit('abc')
  }
  return (
    <p>
      <ClientComponent />
    </p>
  )
}
