import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { withStyles, createStyleSheet, MuiThemeProvider } from 'material-ui/styles'
import { getDefaultContext } from '../styles/createDefaultContext'

const styleSheet = createStyleSheet('App', theme => ({
  '@global': {
    html: {
      background: theme.palette.background.default,
      fontFamily: theme.typography.fontFamily,
      WebkitFontSmoothing: 'antialiased', // Antialiasing.
      MozOsxFontSmoothing: 'grayscale' // Antialiasing.
    },
    body: {
      margin: 0
    },
    a: {
      color: 'inherit'
    }
  }
}))

let AppWrapper = props => props.children

AppWrapper = withStyles(styleSheet)(AppWrapper)

class App extends Component {
  componentDidMount () {
    // Remove the server-side injected CSS.
    const jssStyles = document.querySelector('#jss-server-side')
    if (jssStyles && jssStyles.parentNode) {
      jssStyles.parentNode.removeChild(jssStyles)
    }
  }

  render () {
    const { styleManager, theme } = getDefaultContext()
    return (
      <MuiThemeProvider styleManager={styleManager} theme={theme}>
        <AppWrapper>
          {this.props.children}
        </AppWrapper>
      </MuiThemeProvider>
    )
  }
}

App.propTypes = {
  children: PropTypes.node.isRequired
}

export default App
