import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

export default class extends React.Component {
  static async getInitialProps ({ query }) {
    const { p } = query
    const page = Number(p || 1)
    const stories = await getStories('jobstories', { page })
    return { page, stories }
  }

  render () {
    const { page, stories } = this.props
    return (
      <Page>
        <Stories page={page} stories={stories} />
      </Page>
    )
  }
}
