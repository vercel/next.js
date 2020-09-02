function Home({ stars }) {
  return (
    <div className="container">
      <main>
        <div>
          <link rel="preload" href="already-preloaded.jpg" />
          <img src="already-preloaded.jpg" />
          <img src="tiny-image.jpg" width="20" height="20" />
          <img src="vector-image.svg" />
          <img src="hidden-image-1.jpg" hidden />
          <div hidden>
            <img src="hidden-image-2.jpg" />
          </div>
          <img src="main-image-1.jpg" />
          <img src="main-image-2.jpg" />
          <img src="main-image-3.jpg" />
          <img src="main-image-4.jpg" />
          <img src="main-image-5.jpg" />
        </div>
        <div>Next stars: {stars}</div>
      </main>
    </div>
  )
}

Home.getInitialProps = async () => {
  return { stars: Math.random() * 1000 }
}

export default Home
