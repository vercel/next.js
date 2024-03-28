export function encodeUriPath(file: string) {
  return file
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')
}
