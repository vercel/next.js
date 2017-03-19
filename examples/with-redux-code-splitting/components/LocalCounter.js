import { connect } from 'react-redux'

const LocalCounter = ({ count, dispatch }) => {
  return (
    <div>
      <h2>Local Count: {count}</h2>
      <button onClick={() => dispatch({ type: 'INCREMENT_LOCAL_COUNTER' })}>
        increment counter
      </button>
    </div>
  )
}

export default connect(state => ({ count: state.localCounter }))(LocalCounter)

export const reducer = (state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT_LOCAL_COUNTER':
      return state + 1
    default:
      return state
  }
}
