import 'babel-polyfill'

import React from 'react'
import dynamic from 'next/dynamic'

// material ui
import AppBar from 'material-ui/AppBar'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'
import getMuiTheme from 'material-ui/styles/getMuiTheme'
import FlatButton from 'material-ui/FlatButton'

// dynamic components
const Dialog = dynamic(
  import('material-ui/Dialog'),
  { ssr: false }
)

const LoginForm = dynamic(
  import('../components/LoginForm'),
  { ssr: false }
)

// other plugin
import injectTapEventPlugin from 'react-tap-event-plugin'

try {
  if (typeof window !== 'undefined') {
    if (!process.tapEventInjected) {
      injectTapEventPlugin()
      process.tapEventInjected = true
    }
  }
} catch (e) {
  // do nothing
}

// reference: http://www.material-ui.com/#/customization/themes
const muiDetaulTheme = {
  userAgent: false
}

const muiTheme = getMuiTheme(muiDetaulTheme)

class App extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      open: false
    }
  }

  handleOpen = () => {
    this.setState({ open: true })
  };

  handleClose = () => {
    this.setState({ open: false })
  }

  renderLoginForm () {
    return (
      <Dialog
        title='Log In'
        modal={false}
        open={this.state.open}
        onRequestClose={this.handleClose}
      >
        <LoginForm />
      </Dialog>
    )
  }

  render () {
    return (
      <MuiThemeProvider muiTheme={muiTheme}>
        <div className='app'>
          <header>
            <AppBar
              title='News'
              style={{ marginBottom: 15 }}
              iconElementRight={<FlatButton onTouchTap={this.handleOpen} label='Log In' />}
            />
          </header>

          <main className='main-content'>
            {this.props.children}
          </main>

          <footer className='footer'>
            Footer
          </footer>
          {this.renderLoginForm()}
        </div>
      </MuiThemeProvider>
    )
  }
}

export default App
