import { openSans, sourceCodePro, abel } from '../fonts'

function MyApp({ Component, pageProps }) {
  return (
    <div className={openSans.variable}>
      <div className={sourceCodePro.variable}>
        <div style={abel.style}>
          <Component {...pageProps} />
        </div>
      </div>
    </div>
  )
}

export default MyApp
