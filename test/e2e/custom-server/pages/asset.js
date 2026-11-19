/* global __webpack_public_path__ */
import { useEffect, useState } from 'react'

export default function Asset() {
  const [publicPath, setPublicPath] = useState('')
  useEffect(() => setPublicPath(__webpack_public_path__), [])
  return (
    <>
      <div id="asset-page">asset page</div>
      <p id="public-path">{publicPath}</p>
    </>
  )
}

export async function getServerSideProps() {
  return { props: {} }
}
