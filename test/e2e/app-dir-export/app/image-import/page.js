import Link from 'next/link'
import img from './test.png'

export default function ImageImport() {
  return (
    <main>
      <h1>Image Import</h1>
      <ul>
        <li>
          <Link href="/">Visit the home page</Link>
        </li>
        <li>
          <a href={img.src}>View the image</a>
        </li>
      </ul>
    </main>
  )
}
