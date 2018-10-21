import ThemeProvider from 'react-toolbox/lib/ThemeProvider'
import theme from '../static/theme'
import Head from 'next/head'

import Button from 'react-toolbox/lib/button/Button'

export default () => (
  <div>
    <Head>
      <link href='/static/theme.css' rel='stylesheet' />
    </Head>
    <ThemeProvider theme={theme}>
      <Button raised primary>
        Hello
      </Button>
    </ThemeProvider>
  </div>
)
