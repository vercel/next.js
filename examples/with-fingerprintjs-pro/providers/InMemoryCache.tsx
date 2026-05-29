import { PropsWithChildren } from "react";
import {
  CacheLocation,
  FpjsProvider,
  LoadOptions,
} from "@fingerprintjs/fingerprintjs-pro-react";

const fpjsPublicApiKey = process.env.NEXT_PUBLIC_FPJS_PUBLIC_API_KEY as string;

export const InMemoryCache: React.FC<PropsWithChildren> = ({ children }) => {
  const loadOptions: LoadOptions = {
    apiKey: fpjsPublicApiKey,
  };

  return (
    <FpjsProvider
      loadOptions={loadOptions}
      cacheLocation={CacheLocation.Memory}
    >
      <div className="App">
        <header className="header">
          <h2>Solution with an in-memory cache</h2>
          <div className="subheader">
            New API call made after a key expires, a page is reloaded or the
            provider is unmounted
          </div>
        </header>
        {children}
      </div>
    </FpjsProvider>
  );
};
