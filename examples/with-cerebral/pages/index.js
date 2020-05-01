import React from 'react'
import { Controller } from 'cerebral'
import Devtools from 'cerebral/devtools'
import { Container } from '@cerebral/react'
import Page from '../components/Page'
import clock from '../modules/clock'

export default class Counter extends React.Component {
  constructor(props) {
    super(props)
    // The controller will be instantiated for every page change and we only
    // add the devtools if we indeed are running in the browser
    this.controller = Controller({
      devtools:
        process.env.NODE_ENV === 'production' || typeof window === 'undefined'
          ? null
          : Devtools({ host: 'localhost:8787' }),
      modules: { clock },
      stateChanges: props.stateChanges,
    })
  }
  render() {
    return (
      <Container controller={this.controller}>
        <Page title="Index Page" linkTo="/other" />
      </Container>
    )
  }
}
