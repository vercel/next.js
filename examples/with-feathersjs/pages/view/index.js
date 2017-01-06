import React from 'react'
import Link from 'next/link'

import Feathers from '../../front/lib/Feathers'

import Layout from '../../front/components/Layout'

export default class Mobile extends React.Component {

  constructor (props) {
    super(props)

    this.state = {
      posts: props.posts
    }
  }

  static async getInitialProps (ctx) {
    let posts = []

    const results = await Feathers.service('posts').find()

    if (results.total > 0) {
      posts = results.data
    }

    return { posts }
  }

  render () {
    if (!this.state.posts) {
      return (
        <Layout>
          <h1>No posts</h1>
          <Link href='/'>
            <a className='waves-effect waves-light btn light-blue darken-3'>Back</a>
          </Link>
        </Layout>
      )
    }

    const { posts } = this.state

    return (
      <Layout>
        <Link href='/'>
          <a className='waves-effect waves-light btn light-blue darken-3'>Back</a>
        </Link>

        <div className='row'>
          {posts.map(post => (
            <div key={`image-${post.id}`} className='col s3'>
              <img src={post.url} className='responsive-img' />
            </div>
          ))}
        </div>
      </Layout>
    )
  }
}
