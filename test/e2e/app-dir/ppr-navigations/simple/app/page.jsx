import { redirect } from 'next/navigation'
import { locales } from '../components/page'

export default () => {
  // Redirect to the default locale
  return redirect(`/${locales[0]}`)
}
