import {useCallback} from 'react';
import {useRouter} from 'next/router';

export default function useLocaleSwitcher() {
  const router = useRouter();

  const handleChangeLocale = useCallback(
    function (locale) {
      // Persist the lang across navigation even if the route has an undefined locale.
      // @see https://nextjs.org/docs/advanced-features/i18n-routing#leveraging-the-next_locale-cookie
      document.cookie = `NEXT_LOCALE=${locale};SameSite=Lax`;

      router.replace(router.pathname, router.asPath, {locale});
    },
    [router]
  );

  return handleChangeLocale;
}
