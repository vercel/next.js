import App from './App'
import Header from './Header'

export default ({ children }) => (
  <App>
    <Header />
    {children}
  </App>
)
