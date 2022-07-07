import { initPlasmicLoader } from '@plasmicapp/loader-nextjs'

const PLASMIC_PROJECT_ID = process.env['NEXT_PUBLIC_PLASMIC_PROJECT_ID']
const PLASMIC_PROJECT_API_TOKEN =
  process.env['NEXT_PUBLIC_PLASMIC_PROJECT_API_TOKEN']

const PLASMIC_CONFIG = {
  projects: [
    {
      id: PLASMIC_PROJECT_ID,
      token: PLASMIC_PROJECT_API_TOKEN,
    },
  ],
}

export const PLASMIC = initPlasmicLoader({
  ...PLASMIC_CONFIG,
  preview: false,
})

export const PREVIEW_PLASMIC = initPlasmicLoader({
  ...PLASMIC_CONFIG,
  // Fetches the latest revisions, whether or not they were unpublished!
  // Disable for production to ensure you render only published changes.
  preview: true,
})
