import execa from 'execa'

// See https://github.com/vercel/next.js/pull/47375
const { stdout, stderr } = await execa(
  'git',
  ['config', 'index.skipHash', 'false'],
  {
    reject: false,
  }
)

console.log(stderr + stdout)
