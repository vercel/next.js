import React, { Component } from 'react'
import { graphql } from 'react-relay'
import BlogPosts from '../components/BlogPosts'

export default class Index extends Component {
  /**
   * if you need to use variables
   *
   * static getInitialProps = async () => ({
   *   variables: {
   *     key: 'value',
   *   },
   * });
   */

  static query = graphql`
    query pages_indexQuery {
      viewer {
        ...BlogPosts_viewer
      }
    }
  `

  render () {
    return (
      <div>
        <BlogPosts viewer={this.props.viewer} />
      </div>
    )
  }
}
