import { StyletronProvider } from 'styletron-react'
import getStyletron from './styletron'

export default ({ children }) => (
  <StyletronProvider styletron={getStyletron()}>
    {children}
  </StyletronProvider>
)
