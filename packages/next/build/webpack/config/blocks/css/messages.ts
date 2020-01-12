import chalk from 'chalk'

export function getGlobalImportError(file: string | null) {
  return `Global CSS ${chalk.bold(
    'cannot'
  )} be imported from files other than your ${chalk.bold(
    'Custom <App>'
  )}. Please move all global CSS imports to ${chalk.cyan(
    file ? file : 'pages/_app.js'
  )}.\nRead more: https://err.sh/next.js/css-global`
}

export function getGlobalModuleImportError() {
  return `Global CSS ${chalk.bold(
    'cannot'
  )} be imported from within ${chalk.bold(
    'node_modules'
  )}.\nRead more: https://err.sh/next.js/css-npm`
}

export function getLocalModuleImportError() {
  return `CSS Modules ${chalk.bold(
    'cannot'
  )} be imported from within ${chalk.bold(
    'node_modules'
  )}.\nRead more: https://err.sh/next.js/css-modules-npm`
}
