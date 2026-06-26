// @ts-expect-error -- data URL import
import textData from 'data:text/plain,Hello World'
// @ts-expect-error -- data URL import
import jsData from 'data:text/javascript,export default "Hello JS"'
// @ts-expect-error -- data URL import
import imageData from 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

export default function Page() {
  return (
    <div>
      <p id="text">{textData}</p>
      <p id="js">{jsData}</p>
      <p id="image">{imageData}</p>
    </div>
  )
}
