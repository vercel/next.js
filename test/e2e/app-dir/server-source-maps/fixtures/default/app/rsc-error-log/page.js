import { someClass } from './styles.module.css'
import { connection } from 'next/server'

function logError() {
  const error = new Error('rsc-error-log')
  console.error(error)
}

export default async function Page() {
  await connection()

  logError()
  return <p className={someClass}>Hello, Dave!</p>
}
