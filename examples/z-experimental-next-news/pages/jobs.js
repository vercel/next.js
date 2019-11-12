import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps() {
  const page = 1
  const stories = await getStories('jobstories', { page })
  return { props: { page, stories } }
}

function Jobs({ page, stories }) {
  return (
    <Page>
      <Stories page={page} stories={stories} />
    </Page>
  )
}

export default Jobs
