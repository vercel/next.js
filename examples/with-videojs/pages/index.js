import Head from 'next/head'
import React from 'react'
import Player from '../components/Player'

export default class Index extends React.Component {
  render () {
    const videoJsOptions = {
      techOrder: ['youtube'],
      autoplay: true,
      controls: true,
      sources: [{
        src: 'https://www.youtube.com/watch?v=jiLkBxw2pbs',
        type: 'video/youtube'
      }]
    }

    return (
      <div>
        <Head>
          <link rel='stylesheet' href='/_next/static/style.css' />
        </Head>

        <Player {...videoJsOptions} />
      </div>
    )
  }
}
