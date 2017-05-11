import React, { Component } from 'react'
import firebase from 'firebase'
import 'isomorphic-fetch'
import clientCredentials from '../credentials/client'

export default class Index extends Component {
  static async getInitialProps ({req, query}) {
    const user = req && req.session ? req.session.decodedToken : null
    const snap = await req.firebaseServer.database().ref('messages').once('value')
    return { user, messages: snap.val() }
  }

  constructor (props) {
    super(props)
    this.state = {
      user: this.props.user,
      value: '',
      messages: this.props.messages
    }

    this.addDbListener = this.addDbListener.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  componentDidMount () {
    firebase.initializeApp(clientCredentials)

    if (this.state.user) this.addDbListener()

    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        this.setState({ user: user })
        return user.getToken()
          .then((token) => {
            // eslint-disable-next-line no-undef
            return fetch('/api/login', {
              method: 'POST',
              // eslint-disable-next-line no-undef
              headers: new Headers({ 'Content-Type': 'application/json' }),
              credentials: 'same-origin',
              body: JSON.stringify({ token })
            })
          }).then((res) => this.addDbListener())
      } else {
        this.setState({ user: null })
        // eslint-disable-next-line no-undef
        fetch('/api/logout', {
          method: 'POST',
          credentials: 'same-origin'
        }).then(() => firebase.database().ref('messages').off())
      }
    })
  }

  addDbListener () {
    firebase.database().ref('messages').on('value', snap => {
      const messages = snap.val()
      if (messages) this.setState({ messages })
    })
  }

  handleChange (event) {
    this.setState({ value: event.target.value })
  }

  handleSubmit (event) {
    event.preventDefault()
    const date = new Date().getTime()
    firebase.database().ref(`messages/${date}`).set({
      id: date,
      text: this.state.value
    })
    this.setState({ value: '' })
  }

  handleLogin () {
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
  }

  handleLogout () {
    firebase.auth().signOut()
  }

  render () {
    const { user, value, messages } = this.state

    return <div>
      {
        user
        ? <button onClick={this.handleLogout}>Logout</button>
        : <button onClick={this.handleLogin}>Login</button>
      }
      {
        user &&
        <div>
          <form onSubmit={this.handleSubmit}>
            <input
              type={'text'}
              onChange={this.handleChange}
              placeholder={'add message'}
              value={value}
            />
          </form>
          <ul>
            {
              messages &&
              Object.keys(messages).map(key => <li key={key}>{messages[key].text}</li>)
            }
          </ul>
        </div>
      }
    </div>
  }
}
