import type { AppProps } from 'next/app'
import { ConfigProvider } from 'antd'
import theme from './themeConfig'
import '@/styles/globals.css'

function App({ Component, pageProps }: AppProps) {
  return (
    <ConfigProvider theme={theme}>
      <Component {...pageProps} />
    </ConfigProvider>
  )
}

export default App
