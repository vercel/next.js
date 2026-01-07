import * as React from 'react'
import { Expensive } from '../lib/sharedCode'

export default function Home() {
  const [expensiveWebStatus, setExpensiveWebStatus] = React.useState('WAIT')
  const [expensiveWorkerStatus, setExpensiveWorkerComplete] =
    React.useState('WAIT')
  const worker = React.useRef()

  React.useEffect(() => {
    worker.current = new Worker(new URL('../lib/worker.js', import.meta.url))
    worker.current.addEventListener('message', ({ data }) => {
      if (data) {
        setExpensiveWorkerComplete('PASS')
      }
    })
    worker.current.addEventListener('error', (data) => {
      setExpensiveWorkerComplete('FAIL')
    })
  }, [worker, setExpensiveWorkerComplete])
  React.useEffect(() => {
    try {
      Expensive()
      setExpensiveWebStatus('PASS')
    } catch {
      setExpensiveWebStatus('FAIL')
    }
  }, [])

  return (
    <main>
      <h1>$RefreshRegistry repro</h1>
      <div id="web-status">Web: {expensiveWebStatus}</div>
      <div id="worker-status">Worker: {expensiveWorkerStatus}</div>
    </main>
  )
}
