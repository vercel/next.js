import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState } from 'react'

const NextDynamicRedButton = dynamic(
  () =>
    import('../../components/red-button').then((module) => module.RedButton),
  { ssr: false }
)

export default function Home() {
  const [button, setButton] = useState(<button>Red Button on Standby</button>)
  const handleClick = () => {
    setButton(<NextDynamicRedButton />)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '400px',
      }}
    >
      <Link href="/">/</Link>
      <button onClick={handleClick}>Click to load red button</button>
      {button}
    </div>
  )
}
