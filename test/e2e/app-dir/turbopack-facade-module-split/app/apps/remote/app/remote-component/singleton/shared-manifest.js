'use client'

// Mirrors the shared-module manifests that remote-components' config plugin
// generates (`.remote-components/shared/app-remote.tsx`): a client module
// recording shared packages as dynamic imports so an installer can resolve
// each package's module ID and install a shared instance at that ID.
export const shared = {
  // Mirrors the generated manifest shape, which uses computed keys.
  // eslint-disable-next-line no-useless-computed-key
  ['/demo-pkg/index.js']: 'demo-pkg',
  // eslint-disable-next-line no-useless-computed-key
  ['__remote_shared_module_demoPkg']: () => import('demo-pkg'),
}

export const sharedManifest = {
  protocol: 'remote-components.shared.v1',
  requirements: [
    {
      id: '/demo-pkg/index.js',
      specifier: 'demo-pkg',
      required: true,
      singleton: true,
    },
  ],
}
