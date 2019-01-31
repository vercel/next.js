import React, {Component} from 'react'
import firebase from 'firebase/app'
import 'firebase/auth'

const INITIAL_STATE = {
    user: null,
    handleLogin: () => firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()),
    handleLogout: () => firebase.auth().signOut()
}

export const AuthContext = React.createContext(INITIAL_STATE)

export default class Provider extends Component{
    constructor(props){
        super(props)

        this.state = {
            ...INITIAL_STATE,
            ...props.initialState
        }

        firebase.auth().onAuthStateChanged(user => {
            if (user) {
              this.setState({ user: user })
              return user
                .getIdToken()
                .then(token => {
                  // eslint-disable-next-line no-undef
                  return fetch('/api/login', {
                    method: 'POST',
                    // eslint-disable-next-line no-undef
                    headers: new Headers({ 'Content-Type': 'application/json' }),
                    credentials: 'same-origin',
                    body: JSON.stringify({ token })
                  })
                })
            } else {
              this.setState({ user: null })
              // eslint-disable-next-line no-undef
              fetch('/api/logout', {
                method: 'POST',
                credentials: 'same-origin'
              })
            }
          })
    }

    render() {
        return (
            <AuthContext.Provider value={this.state}>
                {this.props.children}
            </AuthContext.Provider>
        )
    }
}