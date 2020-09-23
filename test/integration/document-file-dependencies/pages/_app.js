import '../css/app.css'

function App({ Component, pageProps }) {
  return (
    <div className="global">
      <Component {...pageProps} />
    </div>
  )
}

export default App
