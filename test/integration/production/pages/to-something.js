import React from 'react'
import Link from 'next/link'

export const config = {
  experimentalPrerender: true
}

class Page extends React.Component {
  static async getInitialProps () {
    if (typeof window !== 'undefined') {
      throw new Error(`this shouldn't be called`)
    }
    return {
      title: 'some interesting title'
    }
  }

  render () {
    return (
      <>
        <h3>{this.props.title}</h3>
        <Link href='/something'>
          <a id='something'>Click to something</a>
        </Link>
      </>
    )
  }
}

export default Page
