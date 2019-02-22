import connect from './dev-error-overlay/hot-dev-client'

export default ({ assetPrefix }) => {
  const options = {
    path: `${assetPrefix}/_next/webpack-hmr`
  }

  const devClient = connect(options)

  devClient.subscribeToHmrEvent((obj) => {
    if (obj.action === 'reloadPage') {
      return window.location.reload()
    }
    if (obj.action === 'removedPage') {
      const [page] = obj.data
      if (page === window.next.router.pathname) {
        return window.location.reload()
      }
      return
    }
    if (obj.action === 'addedPage') {
      const [page] = obj.data
      if (page === window.next.router.pathname && typeof window.next.router.components[page] === 'undefined') {
        return window.location.reload()
      }
      return
    }
    throw new Error('Unexpected action ' + obj.action)
  })

  return devClient
}
