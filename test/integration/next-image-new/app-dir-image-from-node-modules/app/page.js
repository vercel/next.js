import MyCoolImage from 'my-cool-image'

const Page = () => {
  return (
    <div>
      <h1>next/image from node_modules</h1>

      <MyCoolImage
        id="image-from-node-modules"
        width={1404}
        height={936}
        src="https://i.imgur.com/CgezKMb.jpg"
      />
    </div>
  )
}

export default Page
