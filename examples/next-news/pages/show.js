import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

function Show ({ page, stories }) {
  const offset = (page - 1) * 30
  return (
    <Page>
      <Stories page={page} offset={offset} stories={stories} />
    </Page>
  )
}

Show.getInitialProps = async ({ query }) => {
  const { p } = query
  const page = Number(p || 1)
  const stories = await getStories('showstories', { page })
  return { page, stories }
}

export default Show
