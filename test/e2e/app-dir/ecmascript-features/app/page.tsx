import { useEffect } from 'react'

class Disposer {
  [Symbol.dispose]() {
    console.log('Disposed')
  }
}

export default function Page({ children }) {
  useEffect(() => {
    using _disposer = new Disposer()
  }, [])

  return <p>hello world</p>
}
