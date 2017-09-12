import React from 'react'
import Helmet from 'react-helmet'

export default class About extends React.Component {
  static async getInitialProps ({ req }) {
    if (req) {
      Helmet.renderStatic()
    }
    return { title: 'About' }
  }

  render () {
    const { title } = this.props
    return (
      <div>
        <Helmet
          title={`${title} | Hello next.js!`}
          meta={[{ property: 'og:title', content: title }]}
        />
        About the World
      </div>
    )
  }
}
