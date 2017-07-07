import Header from "./Header"

const App = ({ children }) =>
  <main>
    <Header pathname={"test"} />
    {children}
  </main>

export default App
