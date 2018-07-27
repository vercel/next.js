import React from 'react'

import withReduxSaga from '../lib/withReduxSaga'

import { startClock } from '../lib/clock/actions'
import { countIncrease } from '../lib/count/actions'
import { loadData } from '../lib/placeholder/actions'

import App from '../components/App'
import Header from '../components/Header'
import Page from '../components/Page'

class PageIndex extends React.Component {
  static async getInitialProps ({ store }) {
    store.dispatch(countIncrease())
    if (!store.getState().placeholder.data) {
      store.dispatch(loadData())
    }
  }

  componentDidMount () {
    this.props.dispatch(startClock())
  }

  render () {
    return (
      <App>
        <Header />
        <Page title='Home Page' />
      </App>
    )
  }
}

export default withReduxSaga(PageIndex)
