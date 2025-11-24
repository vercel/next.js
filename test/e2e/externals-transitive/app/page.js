import depA from 'dep-a'
import depB from 'dep-b'

export default function page() {
  return (
    <body>
      <p>
        depA: {depA.VERSION}, depB: {depB.VERSION}
      </p>
    </body>
  )
}
