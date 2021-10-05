import fs from 'fs/promises'
import path from 'path'

type LoadI18nMessagesProps = {
  locale: string
  defaultLocale: string
}

type MessageConfig = { [key: string]: string }

export default async function loadI18nMessages({
  locale,
  defaultLocale,
}: LoadI18nMessagesProps): Promise<MessageConfig> {
  // If the default locale is being used we can skip it
  if (locale === defaultLocale) {
    return {}
  }

  if (locale !== defaultLocale) {
    const languagePath = path.join(
      process.cwd(),
      `compiled-lang/${locale}.json`
    )
    try {
      const contents = await fs.readFile(languagePath, 'utf-8')
      return JSON.parse(contents)
    } catch (error) {
      console.info(
        'Could not load compiled language files. Please run "npm run i18n:compile" first"'
      )
      console.error(error)
    }
  }
}
