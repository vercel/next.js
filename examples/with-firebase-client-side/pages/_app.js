import FirebaseProvider from '../context/firebaseContext'

// Custom App to wrap it with context provider
export default ({ Component, pageProps }) => (
  <FirebaseProvider>
    <Component {...pageProps} />
  </FirebaseProvider>
)
