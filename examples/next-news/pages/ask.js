import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps () {
  const page = 1
  const stories = await getStories('askstories', { page })
  return { props: { page, stories } }
}

function Ask ({ page, stories }) {
  const offset = (page - 1) * 30
  return (
    <Page>
      <Stories page={page} offset={offset} stories={stories} />
    </Page>
  )
}

export default Ask
