import React from 'react'

import defaultPage from '../../hocs/defaultPage'
import { show } from '../../utils/lock'

const CONTAINER_ID = 'put-lock-here'

class SignIn extends React.Component {
  componentDidMount () {
    show(CONTAINER_ID)
  }
  render () {
    return <div id={CONTAINER_ID} />
  }
}

export default defaultPage(SignIn)
