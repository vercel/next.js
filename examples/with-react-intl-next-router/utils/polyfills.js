import {shouldPolyfill as shouldPolyfillGetCanonicalLocales} from '@formatjs/intl-getcanonicallocales/should-polyfill';
import {shouldPolyfill as shouldPolyfillPluralRules} from '@formatjs/intl-pluralrules/should-polyfill';
import {shouldPolyfill as shouldPolyfillNumberFormat} from '@formatjs/intl-numberformat/should-polyfill';
import {shouldPolyfill as shouldPolyfillDateTimeFormat} from '@formatjs/intl-datetimeformat/should-polyfill';
import {shouldPolyfill as shouldPolyfillRelativeTimeFormat} from '@formatjs/intl-relativetimeformat/should-polyfill';

export default function polyfills(locale) {
  return Promise.all([
    shouldPolyfillGetCanonicalLocales() &&
      import(
        /* webpackChunkName: "intl-getcanonicallocales" */ '@formatjs/intl-getcanonicallocales/polyfill'
      ),
    shouldPolyfillPluralRules() &&
      import(
        /* webpackChunkName: "intl-pluralrules" */ '@formatjs/intl-pluralrules/polyfill'
      ).then(function () {
        if (Intl.PluralRules.polyfilled) {
          return import(
            /* webpackChunkName: "intl-pluralrules" */ `@formatjs/intl-pluralrules/locale-data/${locale}`
          ).catch(function () {});
        }
      }),
    shouldPolyfillNumberFormat() &&
      import(
        /* webpackChunkName: "intl-numberformat" */ '@formatjs/intl-numberformat/polyfill'
      ).then(function () {
        if (Intl.NumberFormat.polyfilled) {
          return import(
            /* webpackChunkName: "intl-numberformat" */ `@formatjs/intl-numberformat/locale-data/${locale}`
          ).catch(function () {});
        }
      }),
    shouldPolyfillDateTimeFormat() &&
      import(
        /* webpackChunkName: "intl-datetimeformat" */ '@formatjs/intl-datetimeformat/polyfill'
      ).then(function () {
        if (Intl.DateTimeFormat.polyfilled) {
          return Promise.all([
            import('@formatjs/intl-datetimeformat/add-all-tz'),
            import(
              /* webpackChunkName: "intl-datetimeformat" */ `@formatjs/intl-datetimeformat/locale-data/${locale}`
            ),
          ]);
        }
      }),
    shouldPolyfillRelativeTimeFormat() &&
      import(
        /* webpackChunkName: "intl-relativetimeformat" */ '@formatjs/intl-relativetimeformat/polyfill'
      ).then(function () {
        if (Intl.RelativeTimeFormat.polyfilled) {
          return import(
            /* webpackChunkName: "intl-relativetimeformat" */ `@formatjs/intl-relativetimeformat/locale-data/${locale}`
          );
        }
      }),
  ]);
}
