import { useState } from 'react'
import Page from '../components/Page'

const Contact = ({onTrack}) => {
  const [message, setMessage] = useState("")

  function handleInput (e) {
    setMessage(e.target.value)
  }

  function handleSubmit(e) {
    e.preventDefault()

    onTrack({
      action: 'Contact',
      category: 'submit_form',
      label: message
    })

    setMessage('')
  }

  return (
    <Page>
      <h1>This is the Contact page</h1>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Message:</span>
          <textarea onChange={handleInput} value={message} />
        </label>
        <button type="submit">submit</button>
      </form>
    </Page>
  )
}

export default Contact
