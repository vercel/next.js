/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

describe('ReactRefreshLogBox app', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      sass: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  })

  test('scss syntax errors', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.write('index.module.scss', `.button { font-size: 5px; }`)
    await session.patch(
      'index.js',
      outdent`
        import './index.module.scss';
        export default () => {
          return (
            <div>
              <p>lol</p>
            </div>
          )
        }
      `
    )

    expect(await session.hasRedbox(false)).toBe(false)

    // Syntax error
    await session.patch('index.module.scss', `.button { font-size: :5px; }`)
    expect(await session.hasRedbox(true)).toBe(true)
    const source = await session.getRedboxSource()
    expect(source).toMatchSnapshot()

    // Fix syntax error
    await session.patch('index.module.scss', `.button { font-size: 5px; }`)
    expect(await session.hasRedbox(false)).toBe(false)

    // Not local error
    await session.patch('index.module.scss', `button { font-size: 5px; }`)
    expect(await session.hasRedbox(true)).toBe(true)
    const source2 = await session.getRedboxSource()
    expect(source2).toMatchSnapshot()

    await cleanup()
  })
})
