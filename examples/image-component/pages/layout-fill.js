import Image from 'next/image'

const Fill = () => (
  <div>
    <h1>Image Component With Layout Fill</h1>
    <div style={{ position: 'relative', width: '250px', height: '500px' }}>
      <Image alt="Mountains" src="/mountains.jpg" layout="fill" />
    </div>
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

export default Fill
