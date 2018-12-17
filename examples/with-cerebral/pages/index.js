import React from 'react'
import { Controller, UniversalController } from 'cerebral'
import Devtools from 'cerebral/devtools'
import { Container } from '@cerebral/react'
import Page from '../components/Page'
import clock from '../modules/clock'

export default class Counter extends React.Component {
  static getInitialProps ({ req }) {
    const isServer = Boolean(req)

    // On the server we prepare the state of the application. Since
    // this is a synchronous state change we just use "setState", but
    // you could do other async stuff here or even use "runSequence" to
    // grab and set the initial state of the application using
    if (isServer) {
      const controller = UniversalController({ modules: { clock } })
      controller.setState('clock.lastUpdate', Date.now())

      return { stateChanges: controller.getChanges() }
    }

    return {}
  }
  constructor (props) {
    super(props)
    // The controller will be instantiated for every page change and we only
    // add the devtools if we indeed are running in the browser
    this.controller = Controller({
      devtools:
        process.env.NODE_ENV === 'production' || typeof window === 'undefined'
          ? null
          : Devtools({ host: 'localhost:8787' }),
      modules: { clock },
      stateChanges: props.stateChanges
    })
  }
  render () {
    return (
      <Container controller={this.controller}>
        <Page title='Index Page' linkTo='/other' />
      </Container>
    )
  }
}
