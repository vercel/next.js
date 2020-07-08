import React from 'react'
import { useTranslation } from 'react-i18next'

export function TranslateButtons() {
  const { i18n } = useTranslation()

  function changeLanguage(lng) {
    i18n.changeLanguage(lng)
  }

  return (
    <footer>
      <button onClick={() => changeLanguage('en')}>EN</button>
      <button onClick={() => changeLanguage('de')}>DE</button>
    </footer>
  )
}
