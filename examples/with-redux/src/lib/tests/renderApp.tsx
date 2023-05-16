/* Core */
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'

/* Instruments */
import { makeStore } from '@/lib/redux'

export const renderApp = (props: React.PropsWithChildren) => {
  const store = makeStore()

  render(<Provider store={store}>{props.children}</Provider>)
}
