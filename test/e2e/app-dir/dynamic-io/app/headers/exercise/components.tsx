export function AllComponents<T extends Headers>({
  headers,
  xSentinelValues,
  expression,
}: {
  headers: T
  xSentinelValues: Set<string>
  expression: string
}) {
  return (
    <>
      <Append headers={headers} expression={expression} />
      <Delete headers={headers} expression={expression} />
      <Get headers={headers} expression={expression} />
      <Has headers={headers} expression={expression} />
      <SetExercise headers={headers} expression={expression} />
      <GetSetCookie headers={headers} expression={expression} />
      <ForEach headers={headers} expression={expression} />
      <Keys headers={headers} expression={expression} />
      <Values
        headers={headers}
        expression={expression}
        xSentinelValues={xSentinelValues}
      />
      <Entries headers={headers} expression={expression} />
      <ForOf headers={headers} expression={expression} />
      <Spread headers={headers} expression={expression} />
    </>
  )
}

function Append({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let result: string
  try {
    headers.append('x-sentinel', ' world')
    result = 'no error'
  } catch (e) {
    result = e.message
  }
  return (
    <section>
      <h2>{expression}.append('...')</h2>
      <ul>
        <li>
          <label>{expression}.append('x-sentinel', ' world')</label>
          <span id={'append-result-x-sentinel'}>: {result}</span>
        </li>
        <li>
          <label>x-sentinel value</label>
          <span id={'append-value-x-sentinel'}>
            : {headers.get('x-sentinel')}
          </span>
        </li>
      </ul>
    </section>
  )
}

function Delete({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let result = 'no error'
  try {
    headers.delete('x-sentinel')
  } catch (e) {
    result = e.message
  }
  return (
    <section>
      <h2>{expression}.delete('...')</h2>
      <ul>
        <li>
          <label>{expression}.delete('x-sentinel')</label>
          <span id={'delete-result-x-sentinel'}>: {result}</span>
        </li>
        <li>
          <label>x-sentinel value</label>
          <span id={'delete-value-x-sentinel'}>
            : {headers.get('x-sentinel')}
          </span>
        </li>
      </ul>
    </section>
  )
}

function Get({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  return (
    <section>
      <h2>{expression}.get('...')</h2>
      <div id={'get-x-sentinel'}>
        <pre>{headers.get('x-sentinel')}</pre>
      </div>
    </section>
  )
}

function Has({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  return (
    <section>
      <h2>{expression}.has('...')</h2>
      <ul>
        <li>
          <label>x-sentinel</label>
          <span id={'has-x-sentinel'}>: {'' + headers.has('x-sentinel')}</span>
        </li>
        <li>
          <label>x-sentinel-foobar</label>
          <span id={'has-x-sentinel-foobar'}>
            : {'' + headers.has('x-sentinel-foobar')}
          </span>
        </li>
      </ul>
    </section>
  )
}

function SetExercise({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let result = 'no error'
  try {
    headers.set('x-sentinel', 'goodbye')
  } catch (e) {
    result = e.message
  }
  return (
    <section>
      <h2>{expression}.set('...')</h2>
      <ul>
        <li>
          <label>{expression}.set('x-sentinel', 'goodbye')</label>
          <span id={'set-result-x-sentinel'}>: {result}</span>
        </li>
        <li>
          <label>x-sentinel value</label>
          <span id={'set-value-x-sentinel'}>: {headers.get('x-sentinel')}</span>
        </li>
      </ul>
    </section>
  )
}

function GetSetCookie({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  const result = headers.getSetCookie()
  return (
    <section>
      <h2>{expression}.getSetCookie()</h2>
      <pre id="get-set-cookie">{JSON.stringify(result, null, 2)}</pre>
    </section>
  )
}

function ForEach({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let output = []
  headers.forEach((value, header) => {
    if (header.startsWith('x-sentinel')) {
      output.push(
        <div key={header} id={'for-each-' + header}>
          <pre>{value}</pre>
        </div>
      )
    }
  })

  return (
    <section>
      <h2>{expression}.forEach(...)</h2>
      {output.length ? output : <div>no headers found</div>}
    </section>
  )
}

function Keys({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let output = []
  for (let header of headers.keys()) {
    if (header.startsWith('x-sentinel')) {
      output.push(
        <li key={header} id={'keys-' + header}>
          {header}
        </li>
      )
    }
  }

  return (
    <section>
      <h2>{expression}.keys(...)</h2>
      {output.length ? <ul>{output}</ul> : <div>no headers found</div>}
    </section>
  )
}

function Values({
  headers,
  expression,
  xSentinelValues,
}: {
  headers: Headers
  expression: string
  xSentinelValues: Set<string>
}) {
  let output = []
  for (let value of headers.values()) {
    if (xSentinelValues.has(value)) {
      output.push(
        <li key={value} data-class={'values'}>
          {value}
        </li>
      )
    }
  }

  return (
    <section>
      <h2>{expression}.values()</h2>
      {output.length ? <ul>{output}</ul> : <div>no headers found</div>}
    </section>
  )
}

function Entries({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let output = []
  for (let entry of headers.entries()) {
    if (entry[0].startsWith('x-sentinel')) {
      output.push(
        <li key={entry[0]} id={'entries-' + entry[0]}>
          {entry[1]}
        </li>
      )
    }
  }

  return (
    <section>
      <h2>{expression}.entries()</h2>
      {output.length ? <ul>{output}</ul> : <div>no headers found</div>}
    </section>
  )
}

function ForOf({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let output = []
  for (let [headerName, value] of headers) {
    if (headerName.startsWith('x-sentinel')) {
      output.push(
        <div key={headerName} id={'for-of-' + headerName}>
          <pre>{value}</pre>
        </div>
      )
    }
  }

  return (
    <section>
      <h2>for...of {expression}</h2>
      {output.length ? output : <div>no headers found</div>}
    </section>
  )
}

function Spread({
  headers,
  expression,
}: {
  headers: Headers
  expression: string
}) {
  let output = [...headers]
    .filter(([headerName]) => headerName.startsWith('x-sentinel'))
    .map((v) => {
      return (
        <div key={v[0]} id={'spread-' + v[0]}>
          <pre>{v[1]}</pre>
        </div>
      )
    })

  return (
    <section>
      <h2>...{expression}</h2>
      {output.length ? output : <div>no headers found</div>}
    </section>
  )
}
