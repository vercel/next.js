import * as React from 'react'
import {
  createTheme,
  Customizer,
  Fabric,
  initializeIcons,
} from 'office-ui-fabric-react'

import { Header } from './header'
import { Footer } from './footer'

initializeIcons()

const theme = createTheme({
  palette: {
    themePrimary: 'red',
  },
})

type Props = {
  children: React.ReactNode
}

export const Layout = function (props: Props) {
  const { children } = props

  return (
    <Customizer settings={{ theme }}>
      <Fabric applyTheme as="header">
        <Header />
      </Fabric>
      <Fabric applyTheme as="main">
        {children}
      </Fabric>
      <Fabric applyTheme as="footer">
        <Footer />
      </Fabric>
    </Customizer>
  )
}
