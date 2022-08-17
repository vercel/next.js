import NextImage from 'next/image'
import FutureImage from 'next/future/image'
import src from '../../../public/test.jpg'

// Keep arrow function to test rsc loaders
const Page = () => {
  return (
    <div>
      <NextImage id="legacy-img" src={src} />
      <FutureImage
        id="without-loader"
        src="/test.svg"
        width={100}
        height={100}
      />
    </div>
  )
}

export default Page
