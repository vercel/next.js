import { Button } from '@portable/ui/button'
import { markers } from '../lib/markers'

export default function Page() {
  return (
    <>
      <ul>
        {markers.map((marker) => (
          <li key={marker}>{marker}</li>
        ))}
      </ul>
      <Button />
    </>
  )
}
