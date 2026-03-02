import { foo } from './actions'

export default function page() {
  return (
    <div>
      hello
      <button onClick={foo}>Click</button>
    </div>
  )
}
