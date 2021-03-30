import * as React from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'

const theme = {
  colors: {
    a: '#000',
  },
}

const AllTheProviders: React.FC = ({ children }) => {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}

const customRender = (
  ui: React.ReactElement<any>,
  options?: Record<string, unknown>
) => render(ui, { wrapper: AllTheProviders, ...options })

// re-export everything
export * from '@testing-library/react'

// override render method
export { customRender as render }
