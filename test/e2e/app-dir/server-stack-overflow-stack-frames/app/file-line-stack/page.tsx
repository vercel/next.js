export default function Page() {
  const error = new RangeError('Maximum call stack size exceeded')
  error.stack =
    'RangeError: Maximum call stack size exceeded\n' +
    '    at fail (app/file-line-stack/page.tsx:27)'
  throw error
}
