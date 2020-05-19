import React from 'react'
import Player from '../components/Player'

export default class Index extends React.Component {
  render() {
    const videoJsOptions = {
      techOrder: ['youtube'],
      autoplay: false,
      controls: true,
      sources: [
        {
          src: 'https://www.youtube.com/watch?v=IxQB14xVas0',
          type: 'video/youtube',
        },
      ],
    }

    return <Player {...videoJsOptions} />
  }
}
