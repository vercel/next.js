import Link from 'next/link';
import useTranslation from 'next-translate/useTranslation';

export default function Navbar() {
  const { t, lang } = useTranslation()

  return (
    <nav>
      <Link href="/">
        <a className="hover:underline">{t('common:home')}</a>
      </Link>
      <Link href="/about">
        <a className="hover:underline">{t('common:about')}</a>
      </Link>
      <Link href="" locale="en-US">
        <a className="hover:underline">
          {t('common:english')}
        </a>
      </Link>
      <Link href="" locale="ja">
        <a className="hover:underline">
          {t('common:japanese')}
        </a>
      </Link>
      <Link href="" locale="pt-BR">
        <a className="hover:underline">
          {t('common:portuguese')}
        </a>
      </Link>
    </nav>
  )
}
