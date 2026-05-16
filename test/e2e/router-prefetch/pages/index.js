import { useState } from 'react'
import { useRouter } from 'next/router'

export default function RouterPrefetch() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const handleClick = async () => {
    await router.prefetch(
      process.env.NODE_ENV === 'development' ? '/another-page' : 'vercel.com'
    )
    setVisible(true)
  }

  return (
    <div>
      <button type="button" id="prefetch-button" onClick={handleClick}>
        click
      </button>
      {visible && <div id="hidden-until-click">visible</div>}
    </div>
  )
}
