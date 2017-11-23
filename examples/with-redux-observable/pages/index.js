import React from 'react'
import Link from 'next/link'
import withRedux from 'next-redux-wrapper'
import initStore from '../lib'
import { startFetchingCharacters, stopFetchingCharacters } from '../lib/reducer'
import * as api from '../lib/api'
import CharacterInfo from '../components/CharacterInfo'

class Counter extends React.Component {
  static async getInitialProps ({ store, isServer }) {
    const nextCharacterId = store.getState().nextCharacterId
    const resultAction = await api.fetchCharacter(nextCharacterId, isServer).toPromise() // we need to convert observable to Promise
    store.dispatch(resultAction)

    return { isServer }
  }

  componentDidMount () {
    this.props.startFetchingCharacters()
  }

  componentWillUnmount () {
    this.props.stopFetchingCharacters()
  }

  render () {
    return (
      <div>
        <h1>Index Page</h1>
        <CharacterInfo />
        <br />
        <nav>
          <Link href='/other'><a>Navigate to "/other"</a></Link>
        </nav>
      </div>
    )
  }
}

export default withRedux(
  initStore,
  null,
  {
    startFetchingCharacters,
    stopFetchingCharacters
  },
)(Counter)
