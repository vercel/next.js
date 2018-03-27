import React from 'react'
import Link from 'next/link'
import withRedux from 'next-redux-wrapper'
import initStore from '../redux'
import CharacterInfo from '../components/CharacterInfo'
import { rootEpic } from '../redux/epics'
import * as actions from '../redux/actions'
import { of } from 'rxjs/observable/of'

class Counter extends React.Component {
  static async getInitialProps ({ store, isServer }) {
    const resultAction = await rootEpic(
      of(actions.fetchCharacter(isServer)),
      store
    ).toPromise() // we need to convert Observable to Promise
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
    startFetchingCharacters: actions.startFetchingCharacters,
    stopFetchingCharacters: actions.stopFetchingCharacters
  }
)(Counter)
