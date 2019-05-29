import React from 'react'
import { inject } from 'ioc'
import PropTypes from 'prop-types'

@inject({
  Router: PropTypes.object,
})
export default class extends React.Component {
  render() {
    const { Router } = this.props

    return (
      <div
        style={{
          marginTop: '5px',
          border: '1px dashed #00ff00',
          padding: '10px',
        }}
      >
        <h3>EndButton</h3>
        Uses injected `Router` component without direct dependency on one
        <br />
        <button onClick={() => Router.pushRoute('about', { foo: 'bar' })}>
          Route to About foo bar
        </button>
        <br />
        <button onClick={() => Router.pushRoute('/')}>go Home</button>
      </div>
    )
  }
}
