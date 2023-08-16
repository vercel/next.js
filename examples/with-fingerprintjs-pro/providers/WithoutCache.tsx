import { PropsWithChildren } from 'react'
import {
  CacheLocation,
  FpjsProvider,
  LoadOptions,
} from '@fingerprintjs/fingerprintjs-pro-react'

const fpjsPublicApiKey = process.env.NEXT_PUBLIC_FPJS_PUBLIC_API_KEY as string

export const WithoutCache: React.FC<PropsWithChildren> = ({ children }) => {
  const loadOptions: LoadOptions = {
    apiKey: fpjsPublicApiKey,
  }

  return (
    <FpjsProvider
      loadOptions={loadOptions}
      cacheLocation={CacheLocation.NoCache}
    >
      <div className="App">
        <header className="header">
          <h2>Solution without cache</h2>
          <div className="subheader">
            New API call made on every component render
          </div>
        </header>
        {children}
      </div>
    </FpjsProvider>
  )
}
