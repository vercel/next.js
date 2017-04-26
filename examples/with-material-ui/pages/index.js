import React, {Component} from 'react'
import RaisedButton from 'material-ui/RaisedButton'
import Dialog from 'material-ui/Dialog'
import {deepOrange500} from 'material-ui/styles/colors'
import FlatButton from 'material-ui/FlatButton'
import getMuiTheme from 'material-ui/styles/getMuiTheme'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'
import injectTapEventPlugin from 'react-tap-event-plugin'

// Needed for onTouchTap
// http://stackoverflow.com/a/34015469/988941
try {
  if (typeof window !== 'undefined') {
    injectTapEventPlugin()
  }
} catch (e) {
  // do nothing
}

const styles = {
  container: {
    textAlign: 'center',
    paddingTop: 200
  }
}

const _muiTheme = getMuiTheme({
  palette: {
    accent1Color: deepOrange500
  }
})

class Main extends Component {
  static getInitialProps ({ req }) {
    const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
    const isServer = !!req
    return {isServer, userAgent}
  }

  constructor (props, context) {
    super(props, context)

    this.state = {
      open: false
    }
  }

  handleRequestClose = () => {
    this.setState({
      open: false
    })
  }

  handleTouchTap = () => {
    this.setState({
      open: true
    })
  }

  render () {
    const standardActions = (
      <FlatButton
        label='Ok'
        primary={Boolean(true)}
        onTouchTap={this.handleRequestClose}
      />
    )

    const { userAgent } = this.props
    /* https://github.com/callemall/material-ui/issues/3336 */
    const muiTheme = getMuiTheme(getMuiTheme({userAgent: userAgent}), _muiTheme)

    return (
      <MuiThemeProvider muiTheme={muiTheme}>
        <div style={styles.container}>
          <Dialog
            open={this.state.open}
            title='Super Secret Password'
            actions={standardActions}
            onRequestClose={this.handleRequestClose}
          >
            1-2-3-4-5
          </Dialog>
          <h1>Material-UI</h1>
          <h2>example project</h2>
          <RaisedButton
            label='Super Secret Password'
            secondary={Boolean(true)}
            onTouchTap={this.handleTouchTap}
          />
        </div>
      </MuiThemeProvider>
    )
  }
}

export default Main
