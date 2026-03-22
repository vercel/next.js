import path from 'path'

export default function (f) {
  return path.join(process.cwd(), f)
}
