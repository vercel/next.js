import Image from 'next/image'

const Responsive = () => (
  <div>
    <h1>Image Component With Layout Responsive</h1>
    <Image
      alt="Mountains"
      src="/mountains.jpg"
      layout="responsive"
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

export default Responsive
