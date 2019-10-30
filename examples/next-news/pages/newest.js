import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

function Newest ({ page, stories }) {
  const offset = (page - 1) * 30
  return (
    <Page>
      <Stories page={page} offset={offset} stories={stories} />
    </Page>
  )
}

Newest.getInitialProps = async ({ query }) => {
  const { p } = query
  const page = Number(p || 1)
  const stories = await getStories('newstories', { page })
  return { page, stories }
}

export default Newest
