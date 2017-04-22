import React, { Component } from 'react'
import Link from 'next/link'
import { database } from 'firebase'
import Header from '../components/header'
import withFirebase from '../components/withFirebase'

class Index extends Component {
  constructor () {
    super()
    this.state = {
      value: ''
    }
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange (e) {
    this.setState({ value: e.target.value })
  }

  handleSubmit (e) {
    e.preventDefault()
    const { value } = this.state
    database().ref('posts').push({ text: value })
    this.setState({ value: '' })
  }

  render () {
    const { user, posts } = this.props
    const { value } = this.state

    return (
      <div>
        <Header user={user} />
        {
          user
          ? <div>
            <form onSubmit={this.handleSubmit}>
              <label>Add a post</label>
              <input type={'text'} onChange={this.handleChange} value={value} />
            </form>
            <ul>
              { posts &&
                Object.keys(posts).map(id => (
                  <li key={id}>
                    <Link href={`/post?id=${id}`}>
                      <a>{posts[id].text}</a>
                    </Link>
                  </li>
                ))
              }
            </ul>
          </div>
          : <div>
            Please log in!
          </div>
        }
      </div>
    )
  }
}

export default withFirebase(Index)
