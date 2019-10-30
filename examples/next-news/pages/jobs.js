import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

function Jobs ({ page, stories }) {
  return (
    <Page>
      <Stories page={page} stories={stories} />
    </Page>
  )
}

Jobs.getInitialProps = async ({ query }) => {
  const { p } = query
  const page = Number(p || 1)
  const stories = await getStories('jobstories', { page })
  return { page, stories }
}

export default Jobs
