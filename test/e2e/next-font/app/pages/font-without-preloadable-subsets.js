import { Single_Day } from 'next/font/google'

const singleDay = Single_Day({ weight: '400' })

export default function FontWithoutPreloadableSubsets() {
  return <p className={singleDay.className}>{JSON.stringify(singleDay)}</p>
}
