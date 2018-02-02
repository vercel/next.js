import React, { Component } from 'react'
import { graphql } from 'react-relay'
import withData from '../lib/withData'
import BlogPosts from '../components/BlogPosts'

class Index extends Component {
  static displayName = `Index`

  render (props) {
    return (
      <div>
        <BlogPosts viewer={this.props.viewer} />
      </div>
    )
  }
}

export default withData(Index, {
  query: graphql`
        query pages_indexQuery {
            viewer {
                ...BlogPosts_viewer
            }
        }
    `
})
