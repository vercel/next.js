'use client'
import { sendEmail } from './actions'

export default function Page() {
  return (
    <form action={sendEmail}>
      <input type="submit" value="Send mail" />
    </form>
  )
}
