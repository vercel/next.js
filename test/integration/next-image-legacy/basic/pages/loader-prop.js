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
            return 'https://example.vercel.sh/error-unexpected-config'
          }
          return `https://example.vercel.sh/success/${src}?width=${width}`
        }}
      />
    </div>
  )
}

export default LoaderExample
