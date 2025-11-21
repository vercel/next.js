import depA from 'dep-a'
import depB from 'dep-b'

console.log('this is page', depA.VERSION, depB.VERSION)

export default function page() {
  return <div>hello</div>
}
