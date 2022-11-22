import { Provider } from '@skynexui/components'

export default function App({ Component, pageProps }) {
  return (
    <Provider
      theme={{
        components: {
          textField: {
            variant: 'basicBordered', // or put "bottomBorder"
          },
        },
      }}
    >
      <Component {...pageProps} />
    </Provider>
  )
}
