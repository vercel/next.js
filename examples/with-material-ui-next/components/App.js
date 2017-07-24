import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { JssProvider } from 'react-jss'
import { withStyles, createStyleSheet, MuiThemeProvider } from 'material-ui/styles'
import { getContext } from '../styles/context'

// Apply some reset
const styleSheet = createStyleSheet('App', theme => ({
  '@global': {
    html: {
      background: theme.palette.background.default,
      WebkitFontSmoothing: 'antialiased', // Antialiasing.
      MozOsxFontSmoothing: 'grayscale' // Antialiasing.
    },
    body: {
      margin: 0
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
    const context = getContext()

    return (
      <JssProvider registry={context.sheetsRegistry} jss={context.jss}>
        <MuiThemeProvider theme={context.theme} sheetsManager={context.sheetsManager}>
          <AppWrapper>
            {this.props.children}
          </AppWrapper>
        </MuiThemeProvider>
      </JssProvider>
    )
  }
}

App.propTypes = {
  children: PropTypes.node.isRequired
}

export default App
