import React from 'react'
import fetch from 'isomorphic-unfetch'
import Link from 'next/link'

const Index = (props) => (
  <div>
      <h2>This is the Index page</h2>
      <Link href="/about"><a>Check the about page</a></Link>

    <ul>
      {props.shows.map(({show}) => (
        <li key={show.id}>

            <a>{show.name}</a>

        </li>
      ))}
    </ul>
  </div>
)

Index.getInitialProps = async function() {
  const res = await fetch('https://api.tvmaze.com/search/shows?q=batman')
  const data = await res.json()

  return {
    shows: data
  }
}

export default Index
