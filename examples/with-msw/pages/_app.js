// Enable API mocking in all environments, this is only for the sake of the example.
// In a real app you should remove this code and uncomment the code below.
if (true) {
  require('../mocks')
}

// if (process.env.NODE_ENV !== 'production') {
//   require('../mocks')
// }

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
