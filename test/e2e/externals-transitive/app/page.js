import depA from 'dep-a'
import depB from 'dep-b'

export default function page() {
  return (
    <body>
      <p>
        depA: {depA}, depB: {depB.join(', ')}
      </p>
    </body>
  )
}
