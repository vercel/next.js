'use client'
import { tokenA, counterA, compCounterA } from '../lib/a'
import { tokenB, counterB, compCounterB } from '../lib/b'

export default function Page() {
  return (
    <div>
      <p id="tokenA">{tokenA}</p>
      <p id="tokenB">{tokenB}</p>
      <p id="counterA">{counterA}</p>
      <p id="counterB">{counterB}</p>
      <p id="compCounterA">{compCounterA}</p>
      <p id="compCounterB">{compCounterB}</p>
    </div>
  )
}
