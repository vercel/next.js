import { getValue } from 'wrapper-pkg'

export default function Page() {
  return (
    <div>
      <p id="result">{getValue()}</p>
    </div>
  )
}
