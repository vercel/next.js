import { lang } from 'next/root-params'

async function getLanguage() {
  'use cache'
  return (await lang()).toUpperCase()
}

async function getSharedContent() {
  'use cache'
  return 'shared content'
}

async function getNestedLanguage() {
  'use cache'
  const [language] = await Promise.all([getLanguage(), getSharedContent()])
  return language
}

async function getDeepLanguage() {
  'use cache'
  return getNestedLanguage()
}

export async function CachedLanguage() {
  return <p id="cached-lang">{await getLanguage()}</p>
}

export async function NestedLanguage() {
  return <p id="nested-lang">{await getDeepLanguage()}</p>
}

export async function Independent() {
  return <p id="independent">{await getSharedContent()}</p>
}

export async function DirectLanguage() {
  return <p id="direct-lang">{await lang()}</p>
}
