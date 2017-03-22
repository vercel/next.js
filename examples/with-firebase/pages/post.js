import React, { Component } from 'react'
import withFirebase from '../components/withFirebase'
import Header from '../components/header'

class Post extends Component {
  render() {
    const { url: { query: { id } }, posts, user } = this.props
    return <div>
      <Header user={user} />
      <h3>Post:</h3>
      <h1>{posts && posts[id].text}</h1>
    </div>
  }
}

export default withFirebase(Post)
