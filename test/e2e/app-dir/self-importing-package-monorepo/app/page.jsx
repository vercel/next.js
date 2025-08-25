import value from '@next-test-self-importing-package-monorepo/internal-pkg'
import localValue from 'next-app'

export default function Home() {
  return (
    <h1>
      Hello world {value} {localValue}
    </h1>
  )
}
