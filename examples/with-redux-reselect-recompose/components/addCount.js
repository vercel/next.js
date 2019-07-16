import PropTypes from 'prop-types'
import { compose, setDisplayName, pure, setPropTypes } from 'recompose'

const AddCount = ({ count, addCount }) => (
  <div>
    <style jsx>{`
      div {
        padding: 0 0 20px 0;
      }
    `}</style>
    <h1>
      AddCount: <span>{count}</span>
    </h1>
    <button onClick={addCount}>Add To Count</button>
  </div>
)

export default compose(
  setDisplayName('AddCount'),
  setPropTypes({
    count: PropTypes.number,
    addCount: PropTypes.func
  }),
  pure
)(AddCount)
