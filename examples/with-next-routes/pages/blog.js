import React from 'react'

const posts = [
  { slug: 'hello-world', title: 'Hello world' },
  { slug: 'another-blog-post', title: 'Another blog post' }
]

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

    return <h1>{post.title}</h1>
  }
}
