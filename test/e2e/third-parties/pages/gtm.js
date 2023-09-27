import { useEffect } from 'react'
import { useGoogleTagManager } from '@next/third-parties/google'

const Page = () => {
  const { init, sendData } = useGoogleTagManager()

  useEffect(() => {
    init({ id: 'GTM-XYZ' })
  }, [init])

  const onClick = () => {
    sendData({ event: 'buttonClicked', value: 'xyz' })
  }

  return (
    <div class="container">
      <h1>GTM</h1>
      <button id="gtm-send" onClick={onClick}>
        Click
      </button>
    </div>
  )
}

export default Page
