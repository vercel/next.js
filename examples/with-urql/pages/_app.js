import { createClient, Provider } from 'urql'

const client = createClient({ url: 'https://graphql-pokemon.now.sh/' })

const App = ({ Component, pageProps }) => (
  <Provider value={client}>
    <Component {...pageProps} />
  </Provider>
)

export default App
