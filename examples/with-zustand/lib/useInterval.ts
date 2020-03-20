import { useEffect, useRef } from 'react'

// https://overreacted.io/making-setinterval-declarative-with-react-hooks/
const useInterval = (callback: () => void, delay: number) => {
  const savedCallback = useRef(callback)
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])
  useEffect(() => {
    const handler = () => savedCallback.current()

    if (delay !== null) {
      const id = setInterval(handler, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}

export default useInterval
