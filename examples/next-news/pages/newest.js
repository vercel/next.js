import React from 'react'
import Page from '../components/page'
import Stories from '../components/stories'
import getStories from '../lib/get-stories'

export default class extends React.Component {
  static async getInitialProps ({ query }) {
    const { p } = query
    const page = Number(p || 1)
    const stories = await getStories('newstories', { page })
    return { page, stories }
  }

  render () {
    const { page, stories } = this.props
    const offset = (page - 1) * 30
    return (
      <Page>
        <Stories page={page} offset={offset} stories={stories} />
      </Page>
    )
  }
}
