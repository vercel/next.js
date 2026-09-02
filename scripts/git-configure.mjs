// @ts-check
import execa from 'execa'

// See https://github.com/vercel/next.js/pull/47375
await execa('git', ['config', 'index.skipHash', 'false'], {
  stdio: 'inherit',
  reject: false,
})
