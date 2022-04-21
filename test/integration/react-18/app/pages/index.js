import ReactDOM from 'react-dom'
import Image from 'next/image'

function sideEffectCall() {
  console.log('sideEffectCall')
}

export default function Index() {
  sideEffectCall()

  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  return (
    <div>
      <p id="react-dom-version">{ReactDOM.version}</p>
      <Image
        id="priority-image"
        priority
        host="secondary"
        src="withpriority2.png"
        width={300}
        height={400}
      />
    </div>
  )
}

export const config = {
  // runtime: 'edge'
}
