// @ts-check
import execa from 'execa'

// See https://github.com/vercel/next.js/pull/47375
await execa('git', ['config', 'index.skipHash', 'false'], {
  stdio: 'inherit',
  reject: false,
})

// Enable the errors.json git merge driver.
// It can be disabled by running:
//
//   scripts/merge-errors-json/uninstall
//
// or by manually removing the `[merge "errors-json"]` section from your .git/config.
await execa('scripts/merge-errors-json/install', [], {
  stdio: 'inherit',
  reject: false,
})
