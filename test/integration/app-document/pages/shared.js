import currentState from '../shared-module'

export default function Page() {
  return <p id="currentstate">{currentState()}</p>
}
