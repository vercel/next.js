import greeting from 'greeting'
import shared from 'shared'
import { ClientValue } from './client'

export default function Page() {
  return (
    <>
      <p id="greeting">{greeting}</p>
      <p id="shared">{shared}</p>
      <ClientValue />
    </>
  )
}
