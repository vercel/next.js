// Use `require` to skip the api check
require('next/navigation')

export default function handle(_, res) {
  res.send('just work')
}
