import React, { Component } from 'react'
import PropTypes from 'prop-types'

import ThemeWrapper from '../components/ThemeWrapper'
import getTheme from 'react-uwp/styles/getTheme'

import { Button, ColorPicker, DatePicker, ProgressRing } from 'react-uwp'

class Index extends Component {
  static async getInitialProps ({ req }) {
    let userAgent
    if (process.browser) {
      userAgent = navigator.userAgent
    } else {
      userAgent = req.headers['user-agent']
    }

    return { userAgent }
  }
  static contextTypes = { theme: PropTypes.object }

  render () {
    const { userAgent } = this.props
    return (
      <ThemeWrapper
        style={{
          padding: '20px 0',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-around'
        }}
        theme={getTheme({ userAgent })}
      >
        <Button>Test Button</Button>
        <DatePicker />
        <ColorPicker />
        <ProgressRing size={50} />
        <p style={{ textAlign: 'center' }}>{userAgent.slice(12)}...</p>
      </ThemeWrapper>
    )
  }
}

export default Index
