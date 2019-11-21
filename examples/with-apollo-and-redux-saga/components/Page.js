import React from 'react'
import { connect } from 'react-redux'

import PageCount from './PageCount'
import Clock from './Clock'
import Placeholder from './Placeholder'

function Page({ clock, placeholder, linkTo, title }) {
  return (
    <React.Fragment>
      <h1>{title}</h1>
      <Clock lastUpdate={clock.lastUpdate} light={clock.light} />
      <PageCount />
      <Placeholder placeholder={placeholder} />
    </React.Fragment>
  )
}

export default connect(state => state)(Page)
