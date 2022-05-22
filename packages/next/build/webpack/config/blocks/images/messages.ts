import chalk from 'next/dist/compiled/chalk'

export function getCustomDocumentImageError() {
  return `Images ${chalk.bold('cannot')} be imported within ${chalk.cyan(
    'pages/_document.js'
  )}. Please move image imports that need to be displayed on every page into ${chalk.cyan(
    'pages/_app.js'
  )}.\nRead more: https://nextjs.org/docs/messages/custom-document-image-import`
}
