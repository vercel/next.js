import React, {Component} from 'react'
import { connect } from 'react-redux'
import { addCount } from '../store'

class AddCount extends Component {
  add = () => {
    const {dispatch} = this.props
    dispatch(addCount())
  }

  render () {
    const { count } = this.props
    return (
      <div>
        <h1>AddCount: <span>{count}</span></h1>
        <button onClick={this.add}>Add To Count</button>
      </div>
    )
  }
}

function mapStateToProps (state) {
  const {count} = state
  return {count}
}

export default connect(mapStateToProps)(AddCount)
