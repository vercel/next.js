import chalk from 'next/dist/compiled/chalk'

export function getGlobalImportError() {
  return `Global CSS ${chalk.bold(
    'cannot'
  )} be imported from files other than your ${chalk.bold(
    'Custom <App>'
  )}. Due to the Global nature of stylesheets, and to avoid conflicts, Please move all first-party global CSS imports to ${chalk.cyan(
    'pages/_app.js'
  )}. Or convert the import to Component-Level CSS (CSS Modules).\nRead more: https://nextjs.org/docs/messages/css-global`
}

export function getGlobalModuleImportError() {
  return `Global CSS ${chalk.bold(
    'cannot'
  )} be imported from within ${chalk.bold(
    'node_modules'
  )}.\nRead more: https://nextjs.org/docs/messages/css-npm`
}

export function getLocalModuleImportError() {
  return `CSS Modules ${chalk.bold(
    'cannot'
  )} be imported from within ${chalk.bold(
    'node_modules'
  )}.\nRead more: https://nextjs.org/docs/messages/css-modules-npm`
}

export function getCustomDocumentError() {
  return `CSS ${chalk.bold('cannot')} be imported within ${chalk.cyan(
    'pages/_document.js'
  )}. Please move global styles to ${chalk.cyan('pages/_app.js')}.`
}
