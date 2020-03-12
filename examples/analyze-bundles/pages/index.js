import React from 'react'
import Link from 'next/link'

export default class Index extends React.Component {
  render () {
    const { name } = this.props
    return (
      <div>
        <h1>Home Page</h1>
        <p>Welcome, {name}</p>
        <div>
          <Link href='/about'>
            <a>About Page</a>
          </Link>
        </div>
      </div>
    )
  }
}

export async function getServerSideProps({req}) {
  if (req) {
      // Runs only in the server
      const faker = require('faker')
      const name = faker.name.findName()
      return { props : { name } }
    }

    // Runs only in the client
    return { name: 'Arunoda' }
}
