import { bold, cyan } from '../../../../../lib/picocolors'

export function getGlobalImportError() {
  return `Global CSS ${bold(
    'cannot'
  )} be imported from files other than your ${bold(
    'Custom <App>'
  )}. Due to the Global nature of stylesheets, and to avoid conflicts, Please move all first-party global CSS imports to ${cyan(
    'pages/_app.js'
  )}. Or convert the import to Component-Level CSS (CSS Modules).\nRead more: https://nextjs.org/docs/messages/css-global`
}

export function getGlobalModuleImportError() {
  return `Global CSS ${bold('cannot')} be imported from within ${bold(
    'node_modules'
  )}.\nRead more: https://nextjs.org/docs/messages/css-npm`
}

export function getLocalModuleImportError() {
  return `CSS Modules ${bold('cannot')} be imported from within ${bold(
    'node_modules'
  )}.\nRead more: https://nextjs.org/docs/messages/css-modules-npm`
}

export function getCustomDocumentError() {
  return `CSS ${bold('cannot')} be imported within ${cyan(
    'pages/_document.js'
  )}. Please move global styles to ${cyan('pages/_app.js')}.`
}
