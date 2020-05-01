import React from 'react';
import LocaleProvider from "../lib/useLocale";

export default function MyApp({Component, pageProps}) {
    return (
        <LocaleProvider langDict={pageProps.langDict}>
            <Component {...pageProps}/>
        </LocaleProvider>
    )
}