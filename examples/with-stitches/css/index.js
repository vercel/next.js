import { createConfig } from '@stitches/css'
import * as React from 'react'

const config = createConfig({
  tokens: {
    colors: {
      RED: 'tomato',
    },
  },
})

/*
  With Typescript:
  const context = React.createContext<TCss<typeof config>>(null)
*/
const context = React.createContext(null)

/*
  With Typescript:
  const Provider: React.FC<{ css: TCss<typeof config> }> = ({ css, children }) => {
    return <context.Provider value={css}>{children}</context.Provider>
  }
*/
const Provider = ({ css, children }) => {
  return <context.Provider value={css}>{children}</context.Provider>
}

const useCss = () => React.useContext(context)

export { config, Provider, useCss }
