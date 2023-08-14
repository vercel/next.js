'use client'
import { useState } from 'react'
import { darkThemes, lightThemes } from './themes'
import Link from 'next/link'

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
    <div className="page-navigator">
      <hr />
      <h3>Example Page Navigator</h3>
      <nav>
        <select
          value={exampleType}
          onChange={(e) => setExampleType(e.target.value)}
        >
          <option value="themed-page">Themed Page</option>
          <option value="forced-color-scheme">
            Force Color Scheme on page
          </option>
        </select>
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
        {exampleType && exampleOption ? (
          <Link href={`/${exampleType}/${exampleOption}`}>Go</Link>
        ) : null}
      </nav>
    </div>
  )
}
