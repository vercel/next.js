import testImage from '../public/test.jpg'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <p>hello pages edge</p>
      <Image src={testImage} alt="test image" />
      <p id="deploymentId">{process.env.NEXT_DEPLOYMENT_ID}</p>

      <button
        onClick={() => {
          import('../data').then((mod) => {
            console.log('loaded data', mod)
          })
        }}
        id="dynamic-import"
      >
        click me
      </button>
    </>
  )
}

export const config = {
  runtime: 'experimental-edge',
}
