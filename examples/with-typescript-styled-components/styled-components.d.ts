
export const themeProvider = {
    white: 'white',
    red: 'red',
    green: 'green',
    blue: 'blue',
    black: 'black'
}

type Theme = typeof themeProvider

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
