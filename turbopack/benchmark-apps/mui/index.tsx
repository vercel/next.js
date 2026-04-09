import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import ThemeProvider from '@mui/material/styles/ThemeProvider'
import CssBaseline from '@mui/material/CssBaseline'
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
import ModeSwitch from './components/ModeSwitch'
import theme from './theme'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <InitColorSchemeScript attribute="class" />
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ModeSwitch />
        <App />
      </ThemeProvider>
    </ThemeProvider>
  </React.StrictMode>
)
