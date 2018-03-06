import React, { Component } from 'react'
import { connect } from 'react-redux'

import { countIncrease, countDecrease } from '../lib/count/actions'

class PageCount extends Component {
  increase = () => {
    this.props.dispatch(countIncrease())
  }
  decrease = () => {
    this.props.dispatch(countDecrease())
  }

  render () {
    const { count } = this.props
    return (
      <div>
        <style jsx>{`
          div {
            padding: 0 0 20px 0;
          }
        `}</style>
        <h1>
          PageCount: <span>{count}</span>
        </h1>
        <button onClick={this.increase}>Increase Count (+1)</button>
        <button onClick={this.decrease}>Decrease Count (-1)</button>
      </div>
    )
  }
}

const mapStateToProps = ({ count }) => ({ count })
export default connect(mapStateToProps)(PageCount)
