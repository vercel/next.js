import React from 'react'
import Image from 'next/image'

const Page = () => {
  const [isLoaded, setIsLoaded] = React.useState(false)

  return (
    <div>
      <p>Home Page</p>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-image"
        src="/test.jpg"
        width="400"
        height="400"
        data-loaded={isLoaded}
        onLoad={() => setIsLoaded(true)}
      ></Image>
      <p id="stubtext">This is the index page</p>
    </div>
  )
}

export default Page
