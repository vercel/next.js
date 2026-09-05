// The disclaimer is imported as a raw string straight from the txt file, so
// legal can edit disclaimer.txt without anyone touching a component.
import disclaimer from '../disclaimer.txt?raw'

export default function Footer() {
  return (
    <footer id="site-footer">
      <p style={{ whiteSpace: 'pre-line' }}>{disclaimer}</p>
    </footer>
  )
}
