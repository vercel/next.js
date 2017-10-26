import React from 'react'
import { Provider } from 'mobx-react'
import { getSnapshot } from 'mobx-state-tree'
import { initStore } from '../store'
import Page from '../components/Page'

export default class Counter extends React.Component {
  static getInitialProps({ req }) {
    const isServer = !!req
    const store = initStore(isServer)
    return { initialState: getSnapshot(store), isServer }
  }

  constructor(props) {
    super(props)
    this.store = initStore(props.isServer, props.initialState)
  }

  render() {
    return (
      <Provider store={this.store}>
        <Page title='Other Page' linkTo='/' />
      </Provider>
    )
  }
}
