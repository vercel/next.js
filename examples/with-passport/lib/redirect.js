import Router from 'next/router'

export default function redirect (res, path) {
  if (typeof window === 'undefined') {
    res.writeHead(302, { Location: path })
    res.end()
  } else {
    Router.push(path)
  }
}
