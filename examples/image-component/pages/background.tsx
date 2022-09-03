import Image from 'next/image'

export default function BackgroundPage() {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          top: 0,
          left: 0,
          zIndex: -10,
          pointerEvents: 'none',
        }}
      >
        <Image
          alt="Mountains"
          src="/mountains.jpg"
          layout="fill"
          objectFit="cover"
          quality={100}
        />
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '2rem',
          lineHeight: '3rem',
          textAlign: 'center',
          textShadow: '1px 1px 1px #3c5c5e',
        }}
      >
        Image Component
        <br />
        as a Background
      </p>
    </>
  )
}
