import ReactDOM from 'react-dom'
import Image from 'next/image'

export default function Index() {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  console.log('__render__')
  return (
    <div>
      <p id="react-dom-version">{ReactDOM.version}</p>
      <Image
        id="priority-image"
        priority
        src="/noop.png"
        width={300}
        height={400}
      />
    </div>
  )
}

export const config = {
  // runtime: 'experimental-edge'
}
