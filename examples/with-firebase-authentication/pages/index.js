import React, { Component } from 'react'
import firebase from 'firebase/app'
import 'firebase/auth'
import 'firebase/firestore'
import 'isomorphic-unfetch'
import {AuthContext} from '../env/auth-context'

export default class Index extends Component {
  static async getInitialProps ({ req, query }) {
    // don't fetch anything from firebase if the user is not found
    // const snap = user && await req.firebaseServer.database().ref('messages').once('value')
    // const messages = snap && snap.val()
    const messages = null
    return { messages }
  }

  constructor (props) {
    super(props)
    this.state = {
      value: '',
      messages: this.props.messages
    }

    this.addDbListener = this.addDbListener.bind(this)
    this.removeDbListener = this.removeDbListener.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  componentDidMount () {
    this.props.user &&
      this.addDbListener()
  }

  componentWillUnmount() {
    this.removeDbListener()
  }

  addDbListener () {
    var db = firebase.firestore()
    // Disable deprecated features
    db.settings({
      timestampsInSnapshots: true
    })
    let unsubscribe = db.collection('messages').onSnapshot(
      querySnapshot => {
        var messages = {}
        querySnapshot.forEach(function (doc) {
          messages[doc.id] = doc.data()
        })
        if (messages) this.setState({ messages })
      },
      error => {
        console.error(error)
      }
    )
    this.setState({ unsubscribe })
  }

  removeDbListener () {
    // firebase.database().ref('messages').off()
    if (this.state.unsubscribe) {
      this.state.unsubscribe()
    }
  }

  handleChange (event) {
    this.setState({ value: event.target.value })
  }

  handleSubmit (event) {
    event.preventDefault()
    var db = firebase.firestore()
    // Disable deprecated features
    db.settings({
      timestampsInSnapshots: true
    })
    const date = new Date().getTime()
    db.collection('messages')
      .doc(`${date}`)
      .set({
        id: date,
        text: this.state.value
      })
    this.setState({ value: '' })
  }


  render () {
    const { value, messages } = this.state

    return (
      <AuthContext.Consumer>
        {({handleLogin, handleLogout, user}) => (
          <div>
          {user ? (
            <button onClick={handleLogout}>Logout</button>
          ) : (
            <button onClick={handleLogin}>Login</button>
          )}
          {user && (
            <div>
              <form onSubmit={this.handleSubmit}>
                <input
                  type={'text'}
                  onChange={this.handleChange}
                  placeholder={'add message...'}
                  value={value}
                />
              </form>
              <ul>
                {messages &&
                  Object.keys(messages).map(key => (
                    <li key={key}>{messages[key].text}</li>
                  ))}
              </ul>
            </div>
          )}
        </div>
        )}
      </AuthContext.Consumer>
    )
  }
}
