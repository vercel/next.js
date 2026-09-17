const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { quote } = require('shell-quote')

function markdownCommands(files) {
  const relativeFiles = files.map((file) =>
    path.relative(process.cwd(), file).replaceAll(path.sep, '/')
  )
  const ignoredFiles = new Set(
    execFileSync(
      'git',
      [
        '--literal-pathspecs',
        'ls-files',
        '--cached',
        '--ignored',
        '--exclude-from=.alexignore',
        '-z',
        '--',
        ...relativeFiles,
      ],
      { encoding: 'utf8' }
    )
      .split('\0')
      .filter(Boolean)
  )
  const alexFiles = relativeFiles.filter((file) => !ignoredFiles.has(file))

  return [
    `prettier --with-node-modules --ignore-path .prettierignore --write ${quote(files)}`,
    ...(alexFiles.length > 0 ? [`alex --quiet ${quote(alexFiles)}`] : []),
  ]
}

module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'eslint --config eslint.config.mjs --fix',
  ],
  '*.md': markdownCommands,
  '*.{json,css,html,yml,yaml,scss}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.rs': ['rustfmt --edition 2024 --'],
}
