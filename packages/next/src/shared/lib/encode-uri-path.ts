export function encodeURIPath(file: string) {
  return file
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')
}
