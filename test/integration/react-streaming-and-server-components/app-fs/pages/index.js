let F_OK

if (typeof window === 'undefined') {
  F_OK = require('fs').constants.F_OK
}

export default function Index() {
  console.log(F_OK)
  return 'Access Node.js fs'
}
