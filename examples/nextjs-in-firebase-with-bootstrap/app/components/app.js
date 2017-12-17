import Head from './head'
import Nav from './nav'

const App = ({ children }) => (
  <main>
    <Head title="Home" id="top"/>
    <Nav />
    {children}
  </main>
)
export default App
