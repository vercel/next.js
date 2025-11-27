import absolute from './file.test-file?absolute=data1'
import relative from './file.test-file?relative=data2'

export default function Page() {
  return (
    <div>
      <p id="absolute">{absolute}</p>
      <p id="relative">{relative}</p>
    </div>
  )
}
