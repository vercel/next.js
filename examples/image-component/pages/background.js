import Image from 'next/image'

const Background = () => (
  <div>
    <div className="container">
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        quality={100}
        className="cover"
      />
    </div>
    <h1>
      Image Component
      <br />
      as a Background
    </h1>
    <style jsx>{`
      .container {
        position: fixed;
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        z-index: -1;
      }
      .cover {
        object-fit: cover;
      }
      h1 {
        margin: 0;
        font-size: 2rem;
        line-height: 3rem;
        text-align: center;
        padding-top: 40vh;
      }
    `}</style>
  </div>
)

export default Background
