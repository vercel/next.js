/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
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
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertNoRedbox()

    // Syntax error
    await session.patch('index.module.scss', `.button { font-size: :5px; }`)
    await session.assertHasRedbox()
    const source = await session.getRedboxSource()
    expect(source).toMatchSnapshot()
  })

  test('scss module pure selector error', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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
    await session.assertHasRedbox()
    const source2 = await session.getRedboxSource()
    expect(source2).toMatchSnapshot()
  })
})
