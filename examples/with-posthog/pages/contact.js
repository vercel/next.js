import posthog from 'posthog-js'
import { useState } from 'react'

const Contact = () => {
  const [message, setMessage] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    // Track a custom event
    posthog.capture('contactForm', { message })
    setMessage('')
  }

  return (
    <div>
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

      <style jsx>{`
        label span {
          display: block;
          margin-bottom: 12px;
        }

        textarea {
          min-width: 300px;
          min-height: 120px;
        }

        button {
          margin-top: 12px;
          display: block;
        }
      `}</style>
    </div>
  )
}
export default Contact
