import { Gradient } from '@visx/visx'

export default function Page() {
  return (
    <svg width={400} height={400}>
      <Gradient.GradientPinkBlue id="g" from="red" to="blue" />
      <rect width={400} height={400} fill="url(#g)" />
    </svg>
  )
}
