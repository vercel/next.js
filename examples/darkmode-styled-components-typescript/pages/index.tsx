import { useContext } from 'react'

import { ThemeContext } from '../components/ThemeProvider'

export default function Home(): JSX.Element {
  const { colorMode, setColorMode } = useContext(ThemeContext)

  if (!colorMode) {
    return null
  }

  const isDark = colorMode === 'dark' ? true : false

  return (
    <div>
      <label htmlFor="darkmode">Dark</label>
      <input
        type="checkbox"
        name="Dark"
        id=""
        checked={!!isDark}
        aria-label="Dark"
        onChange={() => (isDark ? setColorMode('light') : setColorMode('dark'))}
      />
    </div>
  )
}
