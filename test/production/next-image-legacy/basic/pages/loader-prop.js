import Image from 'next/legacy/image'

const LoaderExample = () => {
  return (
    <div>
      <p>Custom loader in both next.config.js and loader prop</p>
      <Image
        id="loader-prop-img"
        src="foo.jpg"
        width={300}
        height={400}
        loader={({ config, src, width }) => {
          if (config) {
            return 'https://next-data-api-endpoint.vercel.app/next-image-legacy/error-unexpected-config'
          }
          return `https://next-data-api-endpoint.vercel.app/next-image-legacy/${src}?width=${width}`
        }}
      />
    </div>
  )
}

export default LoaderExample
