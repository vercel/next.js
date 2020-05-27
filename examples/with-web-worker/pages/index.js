import { useEffect, useRef, useCallback } from 'react'

export default function Index() {
  const workerRef = useRef()
  useEffect(() => {
    workerRef.current = new Worker('../worker.js', { type: 'module' })
    workerRef.current.onmessage = (evt) =>
      alert(`WebWorker Response => ${evt.data}`)
    return () => {
      workerRef.current.terminate()
    }
  }, [])

  const handleWork = useCallback(async () => {
    workerRef.current.postMessage(100000)
  }, [])

  return (
    <div>
      <p>Do work in a WebWorker!</p>
      <button onClick={handleWork}>Calculate PI</button>
    </div>
  )
}
