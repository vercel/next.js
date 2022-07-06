let EOF

if (typeof window === 'undefined') {
  EOF = require('dns').EOF
}

export default function Index() {
  console.log(EOF)
  return 'Access Node.js native module dns'
}

export const config = {
  runtime: 'experimental-edge',
}
