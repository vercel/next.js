import React from 'react'
import { inject } from 'ioc'
import PropTypes from 'prop-types'

@inject({
  // keep it `isRequired`-free to allow mock injection via props
  Link: PropTypes.func,
})
export default class extends React.Component {
  static propTypes = {
    // you can add `isRequired` to the component's propTypes definition
    Link: PropTypes.func.isRequired,
  }

  render() {
    const { Link } = this.props

    return (
      <div
        style={{
          marginTop: '5px',
          border: '1px dashed #00ff00',
          padding: '10px',
        }}
      >
        <h3>Endpoint</h3>
        Uses injected `Link` component without direct dependency on one
        <br />
        <Link route="about" params={{ foo: 'baz' }}>
          <a>About: foo baz</a>
        </Link>
        <br />
        <Link route="/">
          <a>go Home</a>
        </Link>
      </div>
    )
  }
}
