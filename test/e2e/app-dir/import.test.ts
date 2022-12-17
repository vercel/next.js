import path from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir imports',
  {
    files: path.join(__dirname, 'import'),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  },
  ({ next }) => {
    ;['js', 'jsx', 'ts', 'tsx'].forEach((ext) => {
      it(`we can import all components from .${ext}`, async () => {
        const $ = await next.render$(`/${ext}`)
        expect($('#js').text()).toBe('CompJs')
      })
    })
  }
)
