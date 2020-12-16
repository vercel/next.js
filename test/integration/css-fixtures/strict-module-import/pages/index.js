import { nonExistentClassName } from './index.module.css'

export default function Home() {
  return (
    <div id="verify-red" className={nonExistentClassName}>
      This text should be red.
    </div>
  )
}
