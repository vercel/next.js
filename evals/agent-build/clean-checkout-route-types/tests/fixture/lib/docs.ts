export type Doc = {
  path: string
  title: string
  body: string
}

const docs: Doc[] = [
  {
    path: 'getting-started/install',
    title: 'Install the Relay CLI',
    body: 'Install the CLI with npm and sign in with your team token.',
  },
  {
    path: 'getting-started/first-deploy',
    title: 'Your first deployment',
    body: 'Run relay deploy from the project root to create a preview.',
  },
  {
    path: 'reference/regions',
    title: 'Regions',
    body: 'Relay runs in iad1, fra1 and sfo1. Pick the region closest to your users.',
  },
]

export function getDoc(path: string): Doc | undefined {
  return docs.find((doc) => doc.path === path)
}

export function listDocs(): Doc[] {
  return docs
}
