import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {namespaceConfig} from 'fast-redux'
import Link from 'next/link'

const DEFAULT_STATE = {version: 1}

const {actionCreator, getState: getAboutState} = namespaceConfig('about', DEFAULT_STATE)

const bumpVersion = actionCreator(function bumpVersion (state, increment) {
  return {...state, version: state.version + increment}
})

const About = ({ version, bumpVersion }) => (
  <div>
    <h1>About us</h1>
    <h3>Current version: {version}</h3>
    <p><button onClick={(e) => bumpVersion(1)}>Bump version!</button></p>
    <Link href='/'><a>Homepage</a></Link>
  </div>
)

function mapStateToProps (state) {
  return getAboutState(state, 'version')
}

function mapDispatchToProps (dispatch) {
  return bindActionCreators({ bumpVersion }, dispatch)
}

export default connect(mapStateToProps, mapDispatchToProps)(About)
