/* Core */
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'

/* Instruments */
import { makeReduxStore } from '@/lib/redux'

export const renderApp = (props: React.PropsWithChildren) => {
  const store = makeReduxStore()

  render(<Provider store={store}>{props.children}</Provider>)
}
