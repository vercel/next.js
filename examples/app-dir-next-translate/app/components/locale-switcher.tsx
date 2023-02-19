'use client'

import Link from 'next/link'
import i18n from '../../i18n'

export default function LocaleSwitcher() {
  return (
    <div>
      <p>Locale switcher:</p>
      <ul>
        {i18n.locales.map((locale) => {
          return (
            <li key={locale}>
              <Link as={`/${locale}`} href={`/?lang=${locale}`}>{locale}</Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
