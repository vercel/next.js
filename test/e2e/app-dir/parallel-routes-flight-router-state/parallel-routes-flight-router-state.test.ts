import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-flight-router-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function extractFlightRouterState(html: string) {
    // The flight router state is embedded in the RSC payload as the "f" field
    // in the initial chunk (row 0). It's inside script tags like:
    //   self.__next_f.push([1,"0:{\"P\":...\"f\":[[...]],...}"])
    // The data may be split across multiple push calls, so we need to find
    // the chunk starting with "0:" that contains the "f" field.
    const regex = /self\.__next_f\.push\(\[1,"(0:\{.*?)"]\)/gs
    let match
    while ((match = regex.exec(html)) !== null) {
      const chunk = match[1]
      // Unescape the JSON-in-JS string
      const unescaped = chunk
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\')
      // Parse as RSC row: "0:{json}"
      const jsonStr = unescaped.slice(2) // strip "0:"
      try {
        const data = JSON.parse(jsonStr)
        if (data.f) {
          // data.f is the FlightRouterState: [[tree, seedData, head, ...]]
          // We only care about the tree (first element of the first array)
          return data.f[0][0]
        }
      } catch {
        // If parsing fails, continue to next match
      }
    }
    throw new Error('Could not extract flight router state from HTML')
  }

  it('should have correct flight router state for / (direct slot page)', async () => {
    const html = await next.render('/')
    const tree = extractFlightRouterState(html)
    expect(tree).toMatchInlineSnapshot(`
     [
       "",
       {
         "children": [
           "__PAGE__",
           {},
         ],
         "slot": [
           "(slot)",
           {
             "children": [
               "__PAGE__",
               {},
             ],
           },
         ],
       },
       "$undefined",
       "$undefined",
       16,
     ]
    `)
  })

  it('should have correct flight router state for /nested (nested slot page)', async () => {
    const html = await next.render('/nested')
    const tree = extractFlightRouterState(html)
    expect(tree).toMatchInlineSnapshot(`
     [
       "",
       {
         "children": [
           "nested",
           {
             "children": [
               "__PAGE__",
               {},
             ],
           },
         ],
         "slot": [
           "(slot)",
           {
             "children": [
               "nested",
               {
                 "children": [
                   "__PAGE__",
                   {},
                 ],
               },
             ],
           },
         ],
       },
       "$undefined",
       "$undefined",
       16,
     ]
    `)
  })
})
