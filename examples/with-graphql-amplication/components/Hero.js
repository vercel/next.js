import { useState, useEffect } from 'react'
import { useGuestbookEntries, createGuestbookEntry } from '../graphql/api'
import Header from './Header'
import GuestbookEntry from './GuestbookEntry'
import GuestbookEntryDivider from './GuestbookEntryDivider'
import styles from './Hero.module.css'

function getEntries(data) {
  return data ? data.guestbookEntries.reverse() : []
}

export default function Hero(props) {
  const { data, errorMessage } = useGuestbookEntries()
  const [entries, setEntries] = useState([])
  const [twitterHandle, setTwitterHandle] = useState('')
  const [story, setStory] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!entries.length) {
      setEntries(getEntries(data))
    }
  }, [data, entries.length])

  function handleSubmit(event) {
    event.preventDefault()
    if (twitterHandle.trim().length === 0) {
      alert('Please provide a valid twitter handle :)')
      return
    }
    if (story.trim().length === 0) {
      alert('No favorite memory? This cannot be!')
      return
    }
    setSubmitting(true)
    createGuestbookEntry(twitterHandle, story)
      .then((data) => {
        entries.unshift(data.data.createGuestbookEntry)
        setTwitterHandle('')
        setStory('')
        setEntries(entries)
        setSubmitting(false)
      })
      .catch((error) => {
        console.log(`boo :( ${error}`)
        alert('🤷‍♀️')
        setSubmitting(false)
      })
  }

  function handleStoryChange(event) {
    setStory(event.target.value)
  }

  function handleTwitterChange(event) {
    setTwitterHandle(event.target.value.replace('@', ''))
  }

  return (
    <div className={styles.heroContainer}>
      <div className={styles.hero}>
        <Header />
        <form className={styles.heroForm} onSubmit={handleSubmit}>
          <fieldset
            className={styles.heroFormFieldset}
            disabled={submitting && 'disabled'}
          >
            <textarea
              className={styles.heroFormTextArea}
              rows="5"
              cols="50"
              name="story"
              placeholder="What is your favorite memory as a developer?"
              onChange={handleStoryChange}
              value={story}
            />
            <input
              className={styles.heroFormTwitterInput}
              type="text"
              placeholder="twitter handle (no '@')"
              onChange={handleTwitterChange}
              value={twitterHandle}
            />
            <input
              className={styles.heroFormSubmitButton}
              type="submit"
              value="Submit"
            />
          </fieldset>
        </form>
      </div>
      <div className={styles.heroEntries}>
        {errorMessage ? (
          <p>{errorMessage}</p>
        ) : !data ? (
          <p>Loading entries...</p>
        ) : (
          entries.map((entry, index, allEntries) => {
            const date = new Date(entry.createdAt)
            return (
              <div key={entry.id}>
                <GuestbookEntry
                  twitter_handle={entry.twitterHandle}
                  story={entry.story}
                  date={date}
                />
                {index < allEntries.length - 1 && <GuestbookEntryDivider />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
