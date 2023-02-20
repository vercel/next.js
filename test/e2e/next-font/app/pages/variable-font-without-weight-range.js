import { Nabla } from 'next/font/google'

const nabla = Nabla()

export default function VariableFontWithoutWeightRange() {
  return (
    <p id="nabla" className={nabla.className}>
      {JSON.stringify(nabla)}
    </p>
  )
}
