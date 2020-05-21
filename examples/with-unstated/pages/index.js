import Link from 'next/link'
import ClockContainer from '../containers/clock'
import CounterContainer from '../containers/counter'
import Clock from '../components/Clock'
import Counter from '../components/Counter'

export default function Index() {
  return (
    <CounterContainer.Provider>
      <ClockContainer.Provider>
        <div>
          <Link href="/about">
            <a>go to About</a>
          </Link>
          <br />
          <br />
          <div>
            <Clock />
            <Counter />
          </div>
        </div>
      </ClockContainer.Provider>
    </CounterContainer.Provider>
  )
}
