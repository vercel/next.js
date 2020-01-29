import React from 'react'
import { useMachine } from '@xstate/react'
import { Counter, Toggle } from '../components'
import { toggleMachine } from '../machines/toggleMachine'
import { counterMachine } from '../machines/counterMachine'

const IndexPage = ({ count }) => {
  const [toggleCurrent, toggleSend] = useMachine(toggleMachine)
  const [counterCurrent, counterSend] = useMachine(counterMachine, {
    context: { count },
  })

  return (
    <div>
      <Counter
        counter={{
          count: counterCurrent.context.count,
          increment: () => counterSend('INC'),
          decrement: () => counterSend('DEC'),
          reset: () => counterSend('RESET'),
        }}
      />
      <hr />
      <Toggle
        onToggle={() => toggleSend('TOGGLE')}
        active={toggleCurrent.matches('active')}
      />
    </div>
  )
}

IndexPage.getInitialProps = async () => {
  return { count: 999 }
}

export default IndexPage
