import type { cookies } from 'next/headers'

type ReadonlyRequestCookies = Awaited<ReturnType<typeof cookies>>

export function AllComponents({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  return (
    <>
      <ForOf cookies={cookies} expression={expression} />
      <Spread cookies={cookies} expression={expression} />
      <Size cookies={cookies} expression={expression} />
      <GetAndGetAll cookies={cookies} expression={expression} />
      <Has cookies={cookies} expression={expression} />
      <Set cookies={cookies} expression={expression} />
      <Delete cookies={cookies} expression={expression} />
      <Clear cookies={cookies} expression={expression} />
      <ToString cookies={cookies} expression={expression} />
    </>
  )
}

function ForOf({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  let output = []
  for (let [cookieName, cookie] of cookies) {
    if (cookieName.startsWith('x-sentinel')) {
      output.push(
        <div key={cookieName} id={'for-of-' + cookieName}>
          <pre>{print(cookie)}</pre>
        </div>
      )
    }
  }

  return (
    <section>
      <h2>for...of cookies()</h2>
      {output.length ? output : <div>no cookies found</div>}
    </section>
  )
}

function Spread({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  let output = [...cookies]
    .filter(([cookieName]) => cookieName.startsWith('x-sentinel'))
    .map((v) => {
      return (
        <div key={v[0]} id={'spread-' + v[0]}>
          <pre>{print(v[1])}</pre>
        </div>
      )
    })

  return (
    <section>
      <h2>...cookies()</h2>
      {output.length ? output : <div>no cookies found</div>}
    </section>
  )
}

function Size({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  return (
    <section>
      <h2>cookies().size</h2>
      <div id={'size-cookies'}>{cookies.size}</div>
    </section>
  )
}

function GetAndGetAll({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  return (
    <section>
      <h2>cookies().get('...')</h2>
      <div id={'get-x-sentinel'}>
        <pre>{print(cookies.get('x-sentinel'))}</pre>
      </div>
      <h2>{"cookies().get({ name: '...' })"}</h2>
      <div id={'get-x-sentinel-path'}>
        <pre>
          {print(cookies.get({ name: 'x-sentinel-path', value: undefined }))}
        </pre>
      </div>
      <h2>cookies().getAll('...')</h2>
      <div id={'get-x-sentinel-rand'}>
        <pre>{print(cookies.getAll('x-sentinel-rand'))}</pre>
      </div>
    </section>
  )
}

function Has({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  return (
    <section>
      <h2>cookies().has('...')</h2>
      <ul>
        <li>
          <label>x-sentinel</label>
          <span id={'has-x-sentinel'}>: {'' + cookies.has('x-sentinel')}</span>
        </li>
        <li>
          <label>x-sentinel-foobar</label>
          <span id={'has-x-sentinel-foobar'}>
            : {'' + cookies.has('x-sentinel-foobar')}
          </span>
        </li>
      </ul>
    </section>
  )
}

function Set({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  let result = 'no error'
  try {
    cookies.set('x-sentinel', 'goodbye')
  } catch (e) {
    result = e.message
  }
  return (
    <section>
      <h2>cookies().set('...')</h2>
      <ul>
        <li>
          <label>cookies().set('x-sentinel', 'goodbye')</label>
          <span id={'set-result-x-sentinel'}>: {result}</span>
        </li>
        <li>
          <label>x-sentinel value</label>
          <span id={'set-value-x-sentinel'}>
            : {cookies.get('x-sentinel').value}
          </span>
        </li>
      </ul>
    </section>
  )
}

function Delete({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  let result = 'no error'
  try {
    cookies.delete('x-sentinel')
  } catch (e) {
    result = e.message
  }
  return (
    <section>
      <h2>cookies().delete('...')</h2>
      <ul>
        <li>
          <label>cookies().delete('x-sentinel')</label>
          <span id={'delete-result-x-sentinel'}>: {result}</span>
        </li>
        <li>
          <label>x-sentinel value</label>
          <span id={'delete-value-x-sentinel'}>
            : {cookies.get('x-sentinel').value}
          </span>
        </li>
      </ul>
    </section>
  )
}

function Clear({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  let result = 'no error'
  try {
    ;(cookies as any).clear()
  } catch (e) {
    result = e.message
  }
  return (
    <section>
      <h2>cookies().clear()</h2>
      <ul>
        <li>
          <label>cookies().clear()</label>
          <span id={'clear-result'}>: {result}</span>
        </li>
        <li>
          <label>x-sentinel value</label>
          <span id={'clear-value-x-sentinel'}>
            : {cookies.get('x-sentinel').value}
          </span>
        </li>
      </ul>
    </section>
  )
}

function ToString({
  cookies,
  expression,
}: {
  cookies: ReadonlyRequestCookies
  expression: string
}) {
  // filter out real cookies, no point in leaking and not stable for testing
  let result = cookies
    .toString()
    .split('; ')
    .filter((p) => p.startsWith('x-sentinel'))
    .join('; ')
  return (
    <section>
      <h2>cookies().toString()</h2>
      <ul>
        <li>
          <label>cookies().toString()</label>
          <pre id="toString">{result}</pre>
        </li>
      </ul>
    </section>
  )
}

function print(model: any) {
  return JSON.stringify(model, null, 2)
}
