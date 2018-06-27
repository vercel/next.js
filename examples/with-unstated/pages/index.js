import React from 'react'
import { Subscribe } from 'unstated'
import { ClockContainer, CounterContainer } from '../containers'
import { Clock, Counter } from '../components'

class Index extends React.Component {
  componentWillUnmount () {
    clearInterval(this.timer)
  }
  render () {
    return (
      <Subscribe to={[ClockContainer, CounterContainer]}>
        {
          (clock, counter) => {
            this.timer = clock.interval
            return (
              <div>
                <Clock clock={clock} />
                <Counter counter={counter} />
              </div>
            )
          }
        }
      </Subscribe>
    )
  }
}

export default Index
