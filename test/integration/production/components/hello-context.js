import React from 'react'
import PropTypes from 'prop-types'

export default class extends React.Component {
  static contextTypes = {
    data: PropTypes.object
  }

  render () {
    const { data } = this.context
    return <div>{data.title}</div>
  }
}
