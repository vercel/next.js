import Image from 'next/image'

const Fill = () => (
  <div>
    <h1>Image Component With Layout Fill</h1>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        className="cover"
      />
    </div>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        className="contain"
      />
    </div>
    <div style={{ position: 'relative', width: '300px', height: '500px' }}>
      <Image
        alt="Mountains"
        src="/mountains.jpg"
        layout="fill"
        className="none"
        quality={100}
      />
    </div>
    <style jsx global>{`
      body {
        margin: 0;
        padding: 0;
        background: black;
        color: white;
      }
      .contain {
        object-fit: contain;
      }
      .cover {
        object-fit: cover;
      }
      .none {
        object-fit: none;
      }
    `}</style>
  </div>
)

export default Fill
