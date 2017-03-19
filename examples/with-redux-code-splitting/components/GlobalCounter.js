import { connect } from 'react-redux'

const GlobalCounter = ({ count, dispatch }) => {
  return (
    <div>
      <h2>Global Count: {count}</h2>
      <button onClick={() => dispatch({ type: 'INCREMENT_GLOBAL_COUNTER' })}>
        increment counter
      </button>
    </div>
  )
}

export default connect(state => ({ count: state.globalCounter }))(GlobalCounter)

export const reducer = (state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT_GLOBAL_COUNTER':
      return state + 1
    default:
      return state
  }
}
