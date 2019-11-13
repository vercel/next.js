import React, { useState } from 'react'
import { createGuestbookEntry } from '../graphql/api'
import Header from './Header'
import GuestbookEntry from './GuestbookEntry'
import GuestbookEntryDivider from './GuestbookEntryDivider'
import {
  hero,
  heroForm,
  heroFormFieldset,
  heroFormTextArea,
  heroFormTwitterInput,
  heroFormSubmitButton,
  heroEntries,
} from '../styles/hero'

export default props => {
  let initEntries = []
  try {
    initEntries = props.initialEntries.slice(0)
  } catch (err) {
    console.log(`No initial entries`)
  }
  const [entries, setEntries] = useState(initEntries)
  const [twitterHandle, setTwitterHandle] = useState('')
  const [story, setStory] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      .then(data => {
        entries.unshift(data.data.createGuestbookEntry)
        setTwitterHandle('')
        setStory('')
        setEntries(entries)
        setSubmitting(false)
      })
      .catch(error => {
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
    <>
      <div className={hero.className}>
        <Header />
        <form className={heroForm.className} onSubmit={handleSubmit}>
          <fieldset
            className={heroFormFieldset.className}
            disabled={submitting && 'disabled'}
          >
            <textarea
              className={heroFormTextArea.className}
              rows="5"
              cols="50"
              name="story"
              placeholder="What is your favorite memory as a developer?"
              onChange={handleStoryChange}
              value={story}
            />
            <input
              className={heroFormTwitterInput.className}
              type="text"
              placeholder="twitter handle (no '@')"
              onChange={handleTwitterChange}
              value={twitterHandle}
            />
            <input
              className={heroFormSubmitButton.className}
              type="submit"
              value="Submit"
            />
          </fieldset>
        </form>
      </div>
      <div className={heroEntries.className}>
        {entries.map((entry, index, allEntries) => {
          const date = new Date(entry._ts / 1000)
          return (
            <div key={entry._id}>
              <GuestbookEntry
                twitter_handle={entry.twitter_handle}
                story={entry.story}
                date={date}
              />
              {index < allEntries.length - 1 && <GuestbookEntryDivider />}
            </div>
          )
        })}
      </div>
      {heroEntries.styles}
      {heroFormSubmitButton.styles}
      {heroFormTwitterInput.styles}
      {heroFormTextArea.styles}
      {heroFormFieldset.styles}
      {heroForm.styles}
      {hero.styles}
    </>
  )
}
