import React from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { namespaceConfig } from 'fast-redux'
import Link from 'next/link'

const DEFAULT_STATE = { build: 1 }

const { actionCreator, getState: getHomepageState } = namespaceConfig(
  'homepage',
  DEFAULT_STATE
)

const bumpBuild = actionCreator(function bumpBuild(state, increment) {
  return { ...state, build: state.build + increment }
})

const Homepage = ({ build, bumpBuild }) => (
  <div>
    <h1>Homepage</h1>
    <h3>Current build: {build}</h3>
    <p>
      <button onClick={(e) => bumpBuild(1)}>Bump build!</button>
    </p>
    <Link href="/about">
      <a>About Us</a>
    </Link>
  </div>
)

function mapStateToProps(state) {
  return getHomepageState(state)
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({ bumpBuild }, dispatch)
}

export default connect(mapStateToProps, mapDispatchToProps)(Homepage)
