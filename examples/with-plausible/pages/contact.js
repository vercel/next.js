import { useState } from 'react'
import Page from '../components/Page'
import { usePlausible } from 'next-plausible'

export default function Contact() {
  const [message, setMessage] = useState('')
  const plausible = usePlausible()

  const handleSubmit = (e) => {
    e.preventDefault()

    plausible('customEventName', {
      props: {
        message,
      },
    })

    // your own submit logic

    setMessage('')
  }

  return (
    <Page>
      <h1>This is the Contact page</h1>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Message:</span>
          <textarea
            onChange={(e) => setMessage(e.target.value)}
            value={message}
          />
        </label>
        <button type="submit">submit</button>
      </form>
    </Page>
  )
}
