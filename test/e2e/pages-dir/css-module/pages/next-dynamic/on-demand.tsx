import dynamic from 'next/dynamic'
import { useState } from 'react'

const NextDynamicRedButton = dynamic(
  () =>
    import('../../components/red-button').then((module) => module.RedButton),
  { ssr: false }
)

export default function NextDynamic() {
  const [showRedButton, setShowRedButton] = useState(false)

  const handleClick = () => {
    setShowRedButton(true)
  }

  return (
    <>
      {showRedButton ? (
        <NextDynamicRedButton />
      ) : (
        <button onClick={handleClick}>My background should be gray!</button>
      )}
    </>
  )
}
