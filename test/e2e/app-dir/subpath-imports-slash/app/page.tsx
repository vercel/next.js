import { greeting } from '#/greeting'
import { value as externalValue } from 'external-slash-pkg'

export default function Page() {
  return (
    <>
      <p id="greeting">{greeting}</p>
      <p id="external">{externalValue}</p>
    </>
  )
}
