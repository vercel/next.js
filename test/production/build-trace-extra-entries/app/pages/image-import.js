import fs from 'fs'
import path from 'path'
import Image from 'next/image'
import testImage from '../public/test.jpg'

export default function Page(props) {
  return (
    <div>
      <Image src={testImage} placeholder="blur" alt="test" />
    </div>
  )
}

export function getServerSideProps() {
  try {
    // this should be included in the trace since it's not an
    // import
    fs.readFileSync(path.join(process.cwd(), 'public/another.jpg'))
  } catch (_) {}

  return {
    props: {},
  }
}
