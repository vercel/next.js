import App from 'next/app'

export default class MyApp extends App {
  componentDidMount() {
    const style = document.getElementById('server-side-styles')

    if (style) {
      style.parentNode.removeChild(style)
    }
  }
}
