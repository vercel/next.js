import React from 'react'
import Link from 'next/link'
import fetch from 'isomorphic-unfetch'

function Preact (props) {
  return (
    <div>
      <p>Preact has {props.stars} ⭐</p>
      <Link href='/'>
        <a>I bet Next.js has more stars (?)</a>
      </Link>
    </div>
  )
}

Preact.getInitialProps = async () => {
  const res = await fetch('https://api.github.com/repos/developit/preact')
  const json = await res.json() // better use it inside try .. catch
  return { stars: json.stargazers_count }
}

export default Preact
