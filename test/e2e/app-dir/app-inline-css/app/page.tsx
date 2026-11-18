import { font } from './font'
import Box from './Box'
import LoadLazy from './LoadLazy'

export default function Home() {
  return (
    <div>
      <p>Home</p>
      <p id="with-font" className={font.className}>
        Text with custom font
      </p>
      <Box />
      <LoadLazy />
    </div>
  )
}
