import { yellow } from 'picocolors'
import isGitClean from 'is-git-clean'

export function checkGitStatus(force) {
  let clean = false
  let errorMessage = 'Unable to determine if git directory is clean'
  try {
    clean = isGitClean.sync(process.cwd())
    errorMessage = 'Git directory is not clean'
  } catch (err) {
    if (err && err.stderr && err.stderr.includes('Not a git repository')) {
      clean = true
    }
  }

  if (!clean) {
    if (force) {
      console.log(`WARNING: ${errorMessage}. Forcibly continuing.`)
    } else {
      console.log('Thank you for using @next/codemod!')
      console.log(
        yellow(
          '\nBut before we continue, please stash or commit your git changes.'
        )
      )
      console.log(
        '\nYou may use the --force flag to override this safety check.'
      )
      process.exit(1)
    }
  }
}

export const CODEMOD_CHOICES = [
  // TODO: missing doc & version
  {
    title:
      'next-dynamic-access-named-export: Transforms dynamic imports that return the named export itself to a module like object.',
    value: 'next-dynamic-access-named-export',
  },
  {
    title:
      'next-async-request-api: Transforms usage of Next.js async Request APIs',
    value: 'next-async-request-api',
    version: '15.0',
  },
  {
    title:
      'next-request-geo-ip: Install `@vercel/functions` to replace `geo` and `ip` properties on `NextRequest`',
    value: 'next-request-geo-ip',
    version: '15.0',
  },
  {
    title:
      'next-og-import: Transforms imports from `next/server` to `next/og` for usage of Dynamic OG Image Generation.',
    value: 'next-og-import',
    version: '14.0',
  },
  {
    title:
      'metadata-to-viewport-export: Migrates certain viewport related metadata from the `metadata` export to a new `viewport` export.',
    value: 'metadata-to-viewport-export',
    version: '14.0',
  },
  {
    title:
      'built-in-next-font: Uninstall `@next/font` and transform imports to `next/font`',
    value: 'built-in-next-font',
    version: '13.2',
  },
  {
    title:
      'next-image-to-legacy-image: safely migrate Next.js 10, 11, 12 applications importing `next/image` to the renamed `next/legacy/image` import in Next.js 13',
    value: 'next-image-to-legacy-image',
    version: '13.0',
  },
  {
    title:
      'next-image-experimental (experimental): dangerously migrates from `next/legacy/image` to the new `next/image` by adding inline styles and removing unused props',
    value: 'next-image-experimental',
    version: '13.0',
  },
  {
    title: 'new-link: Ensures your <Link> usage is backwards compatible.',
    value: 'new-link',
    version: '13.0',
  },
  {
    title:
      'cra-to-next (experimental): automatically migrates a Create React App project to Next.js',
    value: 'cra-to-next',
    version: '11.0',
  },
  {
    title:
      'add-missing-react-import: Transforms files that do not import `React` to include the import in order for the new React JSX transform',
    value: 'add-missing-react-import',
    version: '10.0',
  },
  {
    title:
      'name-default-component: Transforms anonymous components into named components to make sure they work with Fast Refresh',
    value: 'name-default-component',
    version: '9.0',
  },
  {
    title:
      'withamp-to-config: Transforms the withAmp HOC into Next.js 9 page configuration',
    value: 'withamp-to-config',
    version: '8.0',
  },
  {
    title:
      'url-to-withrouter: Transforms the deprecated automatically injected url property on top level pages to using withRouter',
    value: 'url-to-withrouter',
    version: '6.0',
  },
]
