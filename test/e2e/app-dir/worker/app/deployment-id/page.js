'use client'
import { useState } from 'react'

export default function Home() {
  const [workerDeploymentId, setWorkerDeploymentId] = useState('default')
  const mainDeploymentId = process.env.NEXT_DEPLOYMENT_ID

  return (
    <div>
      <button
        onClick={() => {
          const worker = new Worker(
            new URL('../deployment-id-worker', import.meta.url),
            {
              type: 'module',
            }
          )
          worker.addEventListener('message', (event) => {
            setWorkerDeploymentId(event.data)
          })
        }}
      >
        Get deployment ID from worker
      </button>
      <p>
        Main deployment ID:{' '}
        <span id="main-deployment-id">{mainDeploymentId}</span>
      </p>
      <p>
        Worker deployment ID:{' '}
        <span id="worker-deployment-id">{workerDeploymentId}</span>
      </p>
    </div>
  )
}
