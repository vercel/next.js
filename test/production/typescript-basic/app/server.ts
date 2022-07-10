import next from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const config = bundleAnalyzer({})

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
