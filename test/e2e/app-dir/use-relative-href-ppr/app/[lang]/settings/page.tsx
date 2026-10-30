import { RelativeHrefs } from '../../relative-hrefs'

export default function SettingsPage() {
  // The page itself never reads params, so everything here except the
  // '/en/profile' link can be prerendered into the fallback shell:
  // - '/[lang]/profile' diverges from the current route at 'profile', below
  //   the unknown [lang] part, so the href ('./profile/') is invariant to it.
  // - '/[lang]/settings' (the own route) respells only the concrete
  //   'settings' part; the unknown [lang] stays in the retained prefix.
  // - '/' is pure traversal.
  // - '/en/profile' compares the concrete 'en' against the unknown [lang]
  //   value, so the href depends on it → dynamic hole in the shell.
  // - 'https://example.com/docs' isn't a root-relative path, so it's
  //   returned verbatim and never depends on route values.
  return (
    <>
      <div id="lang-settings-page">Settings</div>
      <RelativeHrefs
        id="lang-settings-hrefs"
        targets={[
          '/[lang]/profile',
          '/[lang]/settings',
          '/',
          '/en/profile',
          'https://example.com/docs',
        ]}
      />
    </>
  )
}
