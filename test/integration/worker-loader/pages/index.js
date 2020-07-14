import * as React from 'react'
import DemoWorker from '../lib/demo.worker'
import { Expensive } from '../lib/sharedCode'

export default function Home() {
  const [expensiveWebStatus, setExpensiveWebStatus] = React.useState('WAIT')
  const [expensiveWorkerStatus, setExpensiveWorkerComplete] = React.useState(
    'WAIT'
  )
  const worker = React.useRef()

  React.useEffect(() => {
    worker.current = new DemoWorker()
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
      <h2 className="title">$RefreshRegistry repro</h2>
      <div className="web-status">Web: {expensiveWebStatus}</div>
      <div className="worker-status">Worker: {expensiveWorkerStatus}</div>
    </main>
  )
}
