import dataText from './test.txt'
import dataBinary from './test.mp4'

export default function Page() {
  return (
    <div>
      <p id="text">{dataText}</p>
      <p id="binary">{dataBinary}</p>
    </div>
  )
}
