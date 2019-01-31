import React, { Component } from 'react'
import { graphql } from 'react-relay'
import withData from '../lib/withData'
import BlogPosts from '../components/BlogPosts'

class Index extends Component {
  static displayName = `Index`

  static async getInitialProps (context) {
    let { after, before, first, last } = context.query

    if (last === undefined) {
      first = 2
    }

    return {
      relayVariables: {
        after,
        before,
        first: parseInt(first, 10),
        last: parseInt(last, 10)
      }
    }
  }

  render (props) {
    return (
      <div>
        <BlogPosts
          viewer={this.props.viewer}
          relayVariables={this.props.relayVariables}
        />
      </div>
    )
  }
}

export default withData(Index, {
  query: graphql`
    query pages_indexQuery(
      $after: String
      $before: String
      $first: Int
      $last: Int
    ) {
      viewer(after: $after, before: $before, first: $first, last: $last) {
        ...BlogPosts_viewer
      }
    }
  `
})
