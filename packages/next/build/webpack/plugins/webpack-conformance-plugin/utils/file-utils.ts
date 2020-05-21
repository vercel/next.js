const cwd = process.cwd()

export function getLocalFileName(request: string) {
  return request.substr(request.lastIndexOf(cwd) + cwd.length)
}
