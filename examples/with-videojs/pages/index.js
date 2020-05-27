import Player from '../components/Player'

const Index = () => {
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

export default Index
