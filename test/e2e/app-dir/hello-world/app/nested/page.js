import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/">Home</Link>
      <p>nested</p>
      <video controls width="250">
        <source
          src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
          type="video/mp4"
        />
      </video>
    </>
  )
}
