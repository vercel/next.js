import depA from 'externals-transitive-dep-a'
import depB from 'externals-transitive-dep-b'

export default function page() {
  return (
    <body>
      <p>
        depA: {depA}, depB: {depB.join(', ')}
      </p>
    </body>
  )
}
