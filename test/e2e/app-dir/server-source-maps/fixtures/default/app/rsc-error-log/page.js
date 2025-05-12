import { someClass } from './styles.module.css'

function logError() {
  const error = new Error('rsc-error-log')
  console.error(error)
}

export default function Page() {
  logError()
  return <p className={someClass}>Hello, Dave!</p>
}
