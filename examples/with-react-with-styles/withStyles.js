import ThemedStyleSheet from 'react-with-styles/lib/ThemedStyleSheet'
import aphroditeInterface from 'react-with-styles-interface-aphrodite'
import { css, withStyles } from 'react-with-styles'
import MyDefaultTheme from './defaultTheme'

ThemedStyleSheet.registerTheme(MyDefaultTheme)
ThemedStyleSheet.registerInterface(aphroditeInterface)

export { css, withStyles, ThemedStyleSheet }
