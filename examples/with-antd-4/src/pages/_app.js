import { ConfigProvider } from 'antd'

import '../main.css'

export default ({ Component, pageProps }) => (
  <ConfigProvider>
    <Component {...pageProps} />
  </ConfigProvider>
)
