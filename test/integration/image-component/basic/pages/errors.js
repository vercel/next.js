import React from '../integration/image-component/basic/pages/react'
import Image from '../integration/image-component/basic/pages/next/image'

const Errors = () => {
  return (
    <div>
      <p id="stubtext">This is a page with errors</p>
      <Image id="nonexistant-host" host="nope" src="wronghost.jpg"></Image>
    </div>
  )
}

export default Errors
