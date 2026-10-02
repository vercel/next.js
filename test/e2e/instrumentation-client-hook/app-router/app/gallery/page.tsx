import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1 id="gallery">Gallery</h1>
      <Link href="/gallery/photos/1">Photo 1</Link>
    </div>
  )
}
