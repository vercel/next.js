import Header from './Header'

const Layout = ({ children }) => (
  <>
    <Header />
    <main>{children}</main>
  </>
)

export default Layout
