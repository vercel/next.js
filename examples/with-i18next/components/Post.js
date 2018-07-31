import React from 'react'
import { translate } from 'react-i18next'

class Post extends React.Component {
  render () {
    const { t } = this.props

    return (
      <div>
        {t('namespace1:greatMorning')}
      </div>
    )
  }
}

export default translate(['namespace1'])(Post)
