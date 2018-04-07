import React from 'react'
import Link from 'next/link'
import delay from '../modules/delay'
import applyLayout from '../modules/next-layouts'
import ContentLayout from '../components/ContentLayout'

class IndexPage extends React.Component {
  static layout = ContentLayout
  static async getInitialProps () {
    return {
      delay: await delay(3000)
    }
  }

  render () {
    return (
      <div>
        index
        <Link href='/about'>
          <a>about</a>
        </Link>
      </div>
    )
  }
}

export default applyLayout(IndexPage)
