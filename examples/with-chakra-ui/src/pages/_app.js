import NextApp from 'next/app'
import { ThemeProvider, CSSReset, ColorModeProvider } from '@chakra-ui/core'

import theme from '../theme'

class App extends NextApp {
  render() {
    const { Component } = this.props
    return (
      <ThemeProvider theme={theme}>
        <ColorModeProvider>
          <CSSReset />
          <Component />
        </ColorModeProvider>
      </ThemeProvider>
    )
  }
}

export default App
