import React from 'react'
import { translate } from 'react-i18next'

class Post extends React.Component {
  constructor (props) {
    super(props)
    this.t = props.t
  }

  render () {
    return (
      <div>
        {this.t('namespace1:greatMorning')}
      </div>
    )
  }
}

export default translate(['namespace1'])(Post)
