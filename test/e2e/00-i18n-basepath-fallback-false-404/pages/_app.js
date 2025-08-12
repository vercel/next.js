function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export const getStaticProps = ({ locale }) => ({
  props: {
    locale,
  },
})

export default MyApp
