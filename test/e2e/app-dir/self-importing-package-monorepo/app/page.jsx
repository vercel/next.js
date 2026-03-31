import value from 'internal-pkg'
import localValue from 'next-app'

export default function Home() {
  return (
    <h1>
      Hello world {value} {localValue}
    </h1>
  )
}
