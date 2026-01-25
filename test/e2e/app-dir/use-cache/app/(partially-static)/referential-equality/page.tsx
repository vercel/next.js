/* eslint-disable no-self-compare */

async function getObject(arg: unknown) {
  'use cache'

  return { arg }
}

async function getObjectWithBoundArgs(arg: unknown) {
  async function getCachedObject() {
    'use cache'

    return { arg }
  }

  return getCachedObject()
}

export default async function Page() {
  return (
    <>
      <h2>With normal args</h2>
      <p>
        Two <span style={{ whiteSpace: 'pre' }}>"use cache"</span> invocations
        with the same arg return the same result:{' '}
        <strong id="same-arg">
          {String((await getObject(1)) === (await getObject(1)))}
        </strong>
      </p>
      <p>
        Two <span style={{ whiteSpace: 'pre' }}>"use cache"</span> invocations
        with different args return different results:{' '}
        <strong id="different-args">
          {String((await getObject(1)) !== (await getObject(2)))}
        </strong>
      </p>

      <h2>With bound args</h2>
      <p>
        Two <span style={{ whiteSpace: 'pre' }}>"use cache"</span> invocations
        with the same bound arg return the same result:{' '}
        <strong id="same-bound-arg">
          {String(
            (await getObjectWithBoundArgs(1)) ===
              (await getObjectWithBoundArgs(1))
          )}
        </strong>
      </p>
      <p>
        Two <span style={{ whiteSpace: 'pre' }}>"use cache"</span> invocations
        with different bound args return different results:{' '}
        <strong id="different-bound-args">
          {String(
            (await getObjectWithBoundArgs(1)) !==
              (await getObjectWithBoundArgs(2))
          )}
        </strong>
      </p>
    </>
  )
}
