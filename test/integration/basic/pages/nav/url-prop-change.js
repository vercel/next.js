import React from 'react'
import Link from 'next/link'

export default class UrlPropChange extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      previousUrl: {},
      url: props.url
    }
  }

  componentWillReceiveProps (nextProps) {
    this.setState(() => {
      return {
        previousUrl: this.props.url,
        url: nextProps.url
      }
    })
  }

  render () {
    const {previousUrl, url} = this.state
    return <div>
      Current:
      <div id='url-result'>
        {JSON.stringify(url)}
      </div>
      <br /><br />
      Previous:
      <div id='previous-url-result'>
        {JSON.stringify(previousUrl)}
      </div>
      <Link href='/nav/url-prop-change?added=yes'><a id='add-query'>Add querystring</a></Link>
    </div>
  }
}
