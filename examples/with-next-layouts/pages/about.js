import React from 'react'
import delay from '../modules/delay'
import applyLayout from '../modules/next-layouts'
import ContentLayout from '../components/ContentLayout'

class AboutPage extends React.Component {
  static layout = ContentLayout
  static async getInitialProps () {
    return {
      delay: await delay(3000)
    }
  }

  render () {
    return (
      <p>about</p>
    )
  }
}

export default applyLayout(AboutPage, {
  getInitialPropsMode: 'concurrent'
})
