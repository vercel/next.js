import 'babel-polyfill'

import React from 'react'
import AppBar from 'material-ui/AppBar'

// material ui
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'
import getMuiTheme from 'material-ui/styles/getMuiTheme'

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
  userAgent: false,
}

const muiTheme = getMuiTheme(muiDetaulTheme)


function App(props) {
  return (
    <MuiThemeProvider muiTheme={muiTheme}>
      <div className="app">
        <header>
          <AppBar
            title="News"
            iconClassNameRight="muidocs-icon-navigation-expand-more"
            style={{ marginBottom: 15 }}
          />
        </header>

        <main className="main-content">
          {props.children}
        </main>

        <footer className="footer">
        </footer>
      </div>
    </MuiThemeProvider>
  )
}

export default App
