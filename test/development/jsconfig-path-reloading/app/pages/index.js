import { Button1 } from '@c/button-1'
import { Button2 } from '@mybutton'
import { firstData } from '@lib/first-data'

export default function Page(props) {
  return (
    <>
      <Button1 />
      <Button2 />
      <p id="first-data">{JSON.stringify(firstData)}</p>
    </>
  )
}
