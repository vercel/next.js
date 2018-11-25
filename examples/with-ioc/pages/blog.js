import React from 'react'
import { provide, types } from 'ioc'
import { Link, Router } from '../routes'
import Component1 from '../components/component1'

const posts = [
  { slug: 'hello-world', title: 'Hello world' },
  { slug: 'another-blog-post', title: 'Another blog post' }
]

@provide({
  @types.func.isRequired
  Link,

  @types.object
  Router
})
export default class extends React.Component {
  static async getInitialProps ({ query, res }) {
    const post = posts.find(post => post.slug === query.slug)

    if (!post && res) {
      res.statusCode = 404
    }

    return { post }
  }

  render () {
    const { post } = this.props

    if (!post) return <h1>Post not found</h1>

    return (
      <div>
        <h1>{post.title}</h1>
        <Component1 />
      </div>
    )
  }
}
