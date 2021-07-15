import {useRouter} from 'next/router';
import Link from 'next/link';
import {FormattedMessage, useIntl} from 'react-intl';

import useLocaleSwitcher from '../hooks/useLocaleSwitcher';

export default function IndexPage() {
  const {locale, locales, defaultLocale} = useRouter();
  const localeSwitcher = useLocaleSwitcher();

  const intl = useIntl();

  return (
    <div>
      <div>
        <FormattedMessage
          defaultMessage="Current locale: {locale}"
          values={{locale}}
        />
      </div>

      <div>
        <FormattedMessage
          defaultMessage="Supported locales: {locales}"
          values={{locales: locales.join(', ')}}
        />
      </div>

      <div>
        <FormattedMessage
          defaultMessage="Default locale: {locale}"
          values={{locale: defaultLocale}}
        />
      </div>

      <hr />

      <FormattedMessage defaultMessage="Change current page locale using a selector:" />

      <br />

      <select
        value={locale}
        placeholder={intl.formatMessage({
          defaultMessage: 'Choose your language',
        })}
        onChange={function (event) {
          localeSwitcher(event.target.value);
        }}
      >
        {locales.map(function (tempLocale) {
          return (
            <option key={tempLocale} value={tempLocale}>
              {tempLocale}
            </option>
          );
        })}
      </select>

      <hr />

      <FormattedMessage defaultMessage="Change current page locale using links:" />

      <br />

      <div>
        <Link href="/" locale="fr">
          <a lang="fr">Français</a>
        </Link>
      </div>

      <div>
        <Link href="/" locale="en">
          <a lang="en">English</a>
        </Link>
      </div>
    </div>
  );
}
