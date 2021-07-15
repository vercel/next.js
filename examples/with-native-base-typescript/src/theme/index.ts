import { extendTheme } from 'native-base'

// Define the config
const config = {
  useSystemColorMode: false,
  initialColorMode: 'dark',
}

// extend the theme
export const theme = extendTheme({ config })
