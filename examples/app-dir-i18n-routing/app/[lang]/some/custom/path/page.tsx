import { getDictionary } from '../../../../../get-dictionary'
import { Locale } from '../../../../../i18n-config'
import Counter from './counter'

export default async function IndexPage({
  params: { lang },
}: {
  params: { lang: Locale }
}) {
  const dictionary = await getDictionary(lang)

  return (
    <div>
      <p>Current locale: {lang}</p>
      <p>
        This text is rendered on the server:{' '}
        {dictionary['server-component'].welcome}
      </p>
      <Counter dictionary={dictionary.counter} />
    </div>
  )
}
