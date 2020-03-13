export default async function unstablePostHydration() {
  // Remove the server-side injected CSS.
  const jssStyles = document.querySelector('#jss-server-side')
  if (jssStyles) {
    jssStyles.parentNode.removeChild(jssStyles)
  }
}
