/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

// TODO: figure out why snapshots mismatch on GitHub actions
// specifically but work in docker and locally
describe.skip('ReactRefreshLogBox scss', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
    dependencies: {
      sass: 'latest',
    },
  })

  test('scss syntax errors', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.write('index.module.scss', `.button { font-size: 5px; }`)
    await session.patch(
      'index.js',
      `
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

    expect(await session.hasRedbox()).toBe(false)

    // Syntax error
    await session.patch('index.module.scss', `.button { font-size: :5px; }`)
    expect(await session.hasRedbox()).toBe(true)
    const source = await session.getRedboxSource()
    expect(source).toMatchSnapshot()

    await cleanup()
  })

  test('scss module pure selector error', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.write('index.module.scss', `.button { font-size: 5px; }`)
    await session.patch(
      'index.js',
      `
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

    // Checks for selectors that can't be prefixed.
    // Selector "button" is not pure (pure selectors must contain at least one local class or id)
    await session.patch('index.module.scss', `button { font-size: 5px; }`)
    expect(await session.hasRedbox()).toBe(true)
    const source2 = await session.getRedboxSource()
    expect(source2).toMatchSnapshot()

    await cleanup()
  })
})
