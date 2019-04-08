/* global fetch */

import React, { Component } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { withRouter } from 'next/router'

import parseUri from '../src/parse-uri'

/**
 * @param  {Array<Object>}  posts
 * @param  {String}         searchQuery [description]
 * @return {Array<Object>}  the set of posts where the title contains searchQuery
 */
const filterPosts = (posts, searchQuery) =>
  posts.filter(post => post.title.includes(searchQuery))

class Posts extends Component {
  componentDidMount () {
    // When re-hydrating a statically compiled Next.js page, Next.js will ignore query parameters.
    // For example, for the URL http://myapp.com?page=1, `this.props.router.query` is an empty
    // Object. The reason for this is that if Next.js were to process the parameters, React's
    // virtual DOM might not match the statically rendered one which can cause React to fail in
    // weird ways. The problem can be fixed in Next.js by triggering a second render if there are
    // query parameters. I proposed that solution in the PR below, but it was closed without a
    // resolution.
    // https://github.com/zeit/next.js/pull/4341
    const queryParams = parseUri(this.props.router.asPath).queryParams || {}
    const searchQuery = queryParams.searchQuery ? queryParams.searchQuery : ``

    // The data in this example is public, but for many applications, data fetching requires a user
    // session which is not known at build time. Since getInitialProps isn't run on the first load
    // of a static page, we use componentDidMount instead.
    fetch(`https://jsonplaceholder.typicode.com/posts?_page=1`)
      .then(response => response.json())
      .then(posts =>
        this.setState({
          allPosts: posts,
          filteredPosts: filterPosts(posts, searchQuery),
          searchQuery
        })
      )
  }

  state = {
    allPosts: [],
    filteredPosts: [],
    searchQuery: ``
  }

  handleUpdateSearch = ev => {
    const searchQuery = ev.target.value

    // Set search value into URL
    const href = `${this.props.router.pathname}?searchQuery=${searchQuery}`
    this.props.router.replace(href, href, { shallow: true })

    // Filter Posts by title
    this.setState({
      searchQuery,
      filteredPosts: filterPosts(this.state.allPosts, searchQuery)
    })
  }

  render () {
    return (
      <main>
        <Head>
          <title>Home page</title>
        </Head>

        <h1>All Blog Posts</h1>

        <label>
          Search
          <input
            onChange={this.handleUpdateSearch}
            type='text'
            value={this.state.searchQuery}
          />
        </label>

        <section>
          <ul>
            {this.state.filteredPosts.map(post => (
              <li key={post.id}>
                {/*
                  Since this link points to a dynamically defined route, we use `as` + `href`. For
                  routes that are defined statically, you do not need `as`.
                */}
                <Link as={`/posts/${post.id}`} href={{ pathname: `/post` }}>
                  <a>{post.title}</a>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    )
  }
}

export default withRouter(Posts)
