function Home({ stars }) {
  return (
    <div className="container">
      <main>
        <div>
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
