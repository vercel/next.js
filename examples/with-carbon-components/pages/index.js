import React, { Component, Fragment } from 'react'
import { Button } from 'carbon-components-react'

import '../static/myCustomTheme.scss'

export default class DemoApp extends Component {
  render() {
    return (
      <Fragment>
        <Button>Hello, world!</Button>
      </Fragment>
    )
  }
}
