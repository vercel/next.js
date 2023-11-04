import { bold, cyan } from '../../../../../lib/picocolors'

export function getCustomDocumentImageError() {
  return `Images ${bold('cannot')} be imported within ${cyan(
    'pages/_document.js'
  )}. Please move image imports that need to be displayed on every page into ${cyan(
    'pages/_app.js'
  )}.\nRead more: https://nextjs.org/docs/messages/custom-document-image-import`
}
