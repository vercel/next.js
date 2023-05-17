/* Core */
import { Provider } from 'react-redux'
import type { AppType } from 'next/app'

/* Instruments */
import { reduxStore } from '@/lib/redux'
import '@/styles/globals.css'

const App: AppType = (props) => {
  return (
    <Provider store={reduxStore}>
      {/* @ts-expect-error reason: react-redux and next.js type mismatch https://github.com/vercel/next.js/issues/37421 */}
      <props.Component {...props.pageProps} />
    </Provider>
  )
}

export default App
