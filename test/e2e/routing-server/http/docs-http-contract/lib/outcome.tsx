import {
  forbidden,
  notFound,
  permanentRedirect,
  redirect,
  unauthorized,
} from 'next/navigation'

export function outcome(name: string): never {
  switch (name) {
    case 'not-found':
      return notFound()
    case 'redirect':
      return redirect('/destination')
    case 'permanent-redirect':
      return permanentRedirect('/destination')
    case 'unauthorized':
      return unauthorized()
    case 'forbidden':
      return forbidden()
    default:
      throw new Error('Unknown outcome: ' + name)
  }
}
