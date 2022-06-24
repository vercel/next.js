import next from 'next'
const app = next({
  dir: '.',
  dev: process.env.NODE_ENV !== 'production',
  conf: {
    compress: false,
  },
  quiet: false,
})
// eslint-disable-next-line
const requestHandler = app.getRequestHandler()
