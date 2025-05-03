const execa = require('execa')

export function exec(command) {
  return execa(command, {
    stdio: 'inherit',
    shell: true,
  })
}
