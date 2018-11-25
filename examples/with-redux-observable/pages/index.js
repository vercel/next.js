import React from 'react'
import Link from 'next/link'
import { of, Subject } from 'rxjs'
import { StateObservable } from 'redux-observable'
import { connect } from 'react-redux'
import CharacterInfo from '../components/CharacterInfo'
import { rootEpic } from '../redux/epics'
import * as actions from '../redux/actions'

class Counter extends React.Component {
  static async getInitialProps ({ store, isServer }) {
    const state$ = new StateObservable(new Subject(), store.getState())
    const resultAction = await rootEpic(
      of(actions.fetchCharacter(isServer)),
      state$
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

export default connect(
  null,
  {
    startFetchingCharacters: actions.startFetchingCharacters,
    stopFetchingCharacters: actions.stopFetchingCharacters
  }
)(Counter)
