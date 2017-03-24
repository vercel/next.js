import React, { Component } from 'react'
import { initializeApp, auth, database } from 'firebase'
import firebaseConfig from '../firebaseConfig'

try {
  initializeApp(firebaseConfig)
} catch (err) {
  if (!/already exists/.test(err.message)) {
    console.error('Firebase initialization error', err.stack)
  }
}

const store = {
  user: null,
  posts: null
}

export default function withFirebase (WrappedComponent) {
  return class extends Component {
    constructor (props) {
      super(props)
      this.state = {
        user: store.user,
        messages: store.messages
      }
      this.updateUserState = this.updateUserState.bind(this)
      this.updateMessages = this.updateMessages.bind(this)
    }

    componentDidMount () {
      this.unsubscribe = auth().onAuthStateChanged(this.updateUserState)
    }

    componentWillUnmount () {
      this.unsubscribe()
      database().ref('posts').off()
    }

    updateUserState (user) {
      if (user) {
        database().ref('posts').on('value', snap => this.updateMessages(snap.val()))
      } else {
        database().ref('posts').off()
      }
      store.user = user
      this.setState({ user })
    }

    updateMessages (posts) {
      store.messages = posts
      this.setState({ posts })
    }

    render () {
      const { user, posts } = this.state
      return <WrappedComponent user={user} posts={posts} {...this.props} />
    }
  }
}
