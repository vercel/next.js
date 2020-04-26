import chalk from 'next/dist/compiled/chalk'

export function getPublicImportError() {
  return 'Public files '
    .concat(chalk.bold('cannot'), ' be directly imported from within the ')
    .concat(
      chalk.bold('root directory'),
      '.\nRead more: https://err.sh/next.js/public-assets-npm'
    )
}
