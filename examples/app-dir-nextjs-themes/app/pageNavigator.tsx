'use client'
import { useState } from 'react'
import { darkThemes, lightThemes } from './themes'
import Link from 'next/link'
import styles from './page.module.css'

export default function PageNavigator() {
  const [exampleType, _setExampleType] = useState('themed-page')
  const [exampleOption, setExampleOption] = useState(darkThemes[0])
  const [exampleOptions, setExampleOptions] = useState([
    ...darkThemes,
    ...lightThemes,
  ])
  const setExampleType = (exampleType: string) => {
    const exampleOptions =
      exampleType === 'themed-page' ? [] : ['system', 'dark', 'light']
    setExampleOptions(exampleOptions)
    console.log(exampleType, exampleOptions)
    setExampleOption(exampleOptions[0])
    _setExampleType(exampleType)
  }
  return (
    <div className={styles.card}>
      <h2>
        Pages Navigator
        <Link href={`/${exampleType}/${exampleOption}`}>
          {' '}
          <span>-&gt;</span>
        </Link>
      </h2>
      <p>
        Pages with forced <code>theme</code>/<code>colorScheme</code>
      </p>
      <br />
      <nav>
        <select
          value={exampleType}
          onChange={(e) => setExampleType(e.target.value)}
        >
          <option value="themed-page">Themed Page</option>
          <option value="forced-color-scheme">Forced ColorScheme</option>
        </select>{' '}
        <select
          value={exampleOption}
          onChange={(e) => setExampleOption(e.target.value)}
        >
          {exampleOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </nav>
    </div>
  )
}
