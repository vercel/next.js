import React, {Component} from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { addCount } from '../store'

class AddCount extends Component {
  constructor (props, context) {
    super(props, context)
    this.add = this.add.bind(this)
  }

  add = () => {
    this.props.addCount()
  }

  render () {
    const { count } = this.props
    return (
      <div style={{paddingBottom: 20 + 'px'}}>
        <h1>AddCount: <span>{count}</span></h1>
        <button onClick={this.add}>Add To Count</button>
      </div>
    )
  }
}

const mapStateToProps = (state, ownProps) => {
  return {
    count: state.count
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    addCount: bindActionCreators(addCount, dispatch)
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(AddCount)
