import { ConfigProvider } from 'antd'
import { ReactNode } from 'react'

const withTheme = (node: ReactNode) => (
  <>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#389e0d',
        },
      }}
    >
      <ConfigProvider
        theme={{
          token: {
            borderRadius: 8,
          },
        }}
      >
        {node}
      </ConfigProvider>
    </ConfigProvider>
  </>
)

export default withTheme
