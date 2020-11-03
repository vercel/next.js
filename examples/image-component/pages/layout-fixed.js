import Image from 'next/image'

const Fixed = () => (
  <div>
    <h1>Image Component With Layout Fixed</h1>
    <Image
      alt="Mountains"
      src="/mountains.jpg"
      layout="fixed"
      width={700}
      height={475}
    />
    <style jsx global>{`
      body {
        margin: 0;
        padding: 0;
        background: black;
        color: white;
      }
    `}</style>
  </div>
)

export default Fixed
