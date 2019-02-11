import { compose, withState, setStatic } from 'recompose'

// the setStatic HOC allow us to define the getInitialProps props to the enhanced component
// it needs to be at the top of the compose
const enhance = compose(
  // set the static async method getInitialProps
  setStatic('getInitialProps', async ({ req }) => {
    const isServer = !!req
    // log if we're server or client side
    if (isServer) console.log('from server')
    else console.log('from client')
    // return a prop to know if we're server or client side
    return { isServer }
  }),
  withState('counter', 'setCounter', 0)
)

// our enhanced page component
export default enhance(({ counter, setCounter, isServer }) => (
  <button onClick={() => setCounter(counter + 1)}>
    {isServer ? 'from server' : 'from client'} Counter:{counter}
  </button>
))
