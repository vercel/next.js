'use client'

import { useCountUp } from 'use-count-up'

const CountUp = ({
  start,
  end,
  duration = 1,
}: {
  start: number
  end: number
  duration?: number
}) => {
  const { value } = useCountUp({
    isCounting: true,
    end,
    start,
    duration,
    decimalPlaces: 1,
  })

  return <span>{value}</span>
}

export default CountUp
