import React, {Component} from 'react'
import {connect} from 'react-redux'

import {increment} from '../actions'

class AddCount extends Component {
  add = () => {
    this.props.dispatch(increment())
  }

  render () {
    const {count} = this.props
    return (
      <div>
        <style jsx>{`
          div {
            padding: 0 0 20px 0;
          }
        `}</style>
        <h1>
          AddCount: <span>{count}</span>
        </h1>
        <button onClick={this.add}>Add To Count</button>
      </div>
    )
  }
}

const mapStateToProps = ({count}) => ({count})
export default connect(mapStateToProps)(AddCount)
