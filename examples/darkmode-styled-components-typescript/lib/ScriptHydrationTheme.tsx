import { Theme } from '../styles/Theme'

function injection() {
  const theme = 'substitutedForTheme'
  function getInitialColorMode() {
    const persistedColorPreference = window.localStorage.getItem('color-mode')
    const hasPersistedPreference = typeof persistedColorPreference === 'string'
    // If the user has explicitly chosen light or dark,
    // let's use it. Otherwise, this value will be null.
    if (hasPersistedPreference) {
      return persistedColorPreference
    }
    // If they haven't been explicit, let's check the media
    // query
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const hasMediaQueryPreference = typeof mql.matches === 'boolean'
    if (hasMediaQueryPreference) {
      return mql.matches ? 'dark' : 'light'
    }
    // If they are using a browser/OS that doesn't support
    // color themes, let's default to 'light'.
    return 'light'
  }

  const colorMode = getInitialColorMode()
  const root = document.documentElement

  root.style.setProperty('--initial-color-mode', colorMode)

  Object.entries(theme[colorMode]).forEach(([name, colorByTheme]) => {
    const cssVarName = `--color-${name}`
    root.style.setProperty(cssVarName, String(colorByTheme))
  })
}

export function ScriptHydrationTheme(): JSX.Element {
  const functionString = String(injection).replace(
    "'substitutedForTheme'",
    JSON.stringify(Theme)
  )
  const codeToRunOnClient = `(${functionString})()`
  // eslint-disable-next-line react/no-danger
  return (
    <script
      id="theme-rehydrate"
      dangerouslySetInnerHTML={{ __html: codeToRunOnClient }}
    />
  )
}
