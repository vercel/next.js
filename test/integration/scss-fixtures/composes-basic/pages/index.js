import { subClass } from './index.module.scss'

export default function Home() {
  return (
    <div id="verify-yellow" className={subClass}>
      This text should be yellow on blue.
    </div>
  )
}
