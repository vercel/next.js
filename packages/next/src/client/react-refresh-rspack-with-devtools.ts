if (
  process.env.NODE_ENV !== 'production' &&
  process.env.__NEXT_REACT_DEVTOOLS
) {
  require('../next-react-devtools/install-hook') as typeof import('../next-react-devtools/install-hook')
}

require('next/dist/compiled/@next/react-refresh-utils/dist/rspack-runtime') as typeof import('next/dist/compiled/@next/react-refresh-utils/dist/rspack-runtime')
