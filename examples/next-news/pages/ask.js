import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

function Ask ({ page, stories }) {
  const offset = (page - 1) * 30
  return (
    <Page>
      <Stories page={page} offset={offset} stories={stories} />
    </Page>
  )
}

Ask.getInitialProps = async ({ query }) => {
  const { p } = query
  const page = Number(p || 1)
  const stories = await getStories('askstories', { page })
  return { page, stories }
}

export default Ask
