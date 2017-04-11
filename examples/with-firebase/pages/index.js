import React, { Component } from 'react'
import Link from 'next/link'
import firebase from 'firebase'

// you have to select your provider on the firebase panel
const provider = new firebase.auth.GoogleAuthProvider();

export default class Index extends Component {
  static async getInitialProps ({req, query}) {
    const user = req && req.session ? req.session.decodedToken : null;
    return { user }
  }

  constructor (props) {
    super(props)
    this.state = {
      user: this.props.user
    }
  }

  componentDidMount() {
    firebase.initializeApp({
      // firebase client config goes here
    })

    firebase.auth().onAuthStateChanged(user => {
      console.log('user', user);

      if (user) {
        this.setState({ user: user })
        return user.getToken()
          .then((token) => {
            return fetch('/api/login', {
              method: 'POST',
              headers: new Headers({
                'Content-Type': 'application/json'
              }),
              credentials: 'same-origin',
              body: JSON.stringify({token})
            })
          })
          .then((res) => {
            console.log(res);
          })
      } else {
        this.setState({ user: null })
        fetch('/api/logout', {
          method: 'POST',
          credentials: 'same-origin'
        })
      }
    })
  }

  handleLogin() {
    firebase.auth().signInWithPopup(provider)
  }

  handleLogout() {
    firebase.auth().signOut()
  }

  render() {
    const { user } = this.state
    return <div>
      {
        user
        ? <button onClick={this.handleLogout}>Logout</button>
        : <button onClick={this.handleLogin}>Login</button>
      }
    </div>
  }
}
