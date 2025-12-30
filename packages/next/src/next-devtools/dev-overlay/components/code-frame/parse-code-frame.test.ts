import {
  formatCodeFrame,
  groupCodeFrameLines,
  parseLineNumberFromCodeFrameLine,
} from './parse-code-frame'

describe('parse line numbers', () => {
  it('parse line numbers from code frame', () => {
    const input = {
      stackFrame: {
        file: 'app/page.tsx',
        line1: 2,
        column1: 9,
        methodName: 'Page',
        arguments: [],
        ignored: false,
      },
      //   1 | export default function Page() {
      // > 2 |   throw new Error('test error')
      //     |         ^
      //   3 |   return <p>hello world</p>
      //   4 | }
      codeFrame:
        "\u001b[0m \u001b[90m 1 |\u001b[39m \u001b[36mexport\u001b[39m \u001b[36mdefault\u001b[39m \u001b[36mfunction\u001b[39m \u001b[33mPage\u001b[39m() {\u001b[0m\n\u001b[0m\u001b[31m\u001b[1m>\u001b[22m\u001b[39m\u001b[90m 2 |\u001b[39m   \u001b[36mthrow\u001b[39m \u001b[36mnew\u001b[39m \u001b[33mError\u001b[39m(\u001b[32m'test error'\u001b[39m)\u001b[0m\n\u001b[0m \u001b[90m   |\u001b[39m         \u001b[31m\u001b[1m^\u001b[22m\u001b[39m\u001b[0m\n\u001b[0m \u001b[90m 3 |\u001b[39m   \u001b[36mreturn\u001b[39m \u001b[33m<\u001b[39m\u001b[33mp\u001b[39m\u001b[33m>\u001b[39mhello world\u001b[33m<\u001b[39m\u001b[33m/\u001b[39m\u001b[33mp\u001b[39m\u001b[33m>\u001b[39m\u001b[0m\n\u001b[0m \u001b[90m 4 |\u001b[39m }\u001b[0m\n\u001b[0m \u001b[90m 5 |\u001b[39m\u001b[0m",
    }

    const formattedFrame = formatCodeFrame(input.codeFrame)
    const decodedLines = groupCodeFrameLines(formattedFrame)

    expect(
      parseLineNumberFromCodeFrameLine(decodedLines[0], input.stackFrame)
    ).toEqual({
      lineNumber: '1',
      isErroredLine: false,
    })

    expect(
      parseLineNumberFromCodeFrameLine(decodedLines[1], input.stackFrame)
    ).toEqual({
      lineNumber: '2',
      isErroredLine: true,
    })

    // Line of ^ marker
    expect(
      parseLineNumberFromCodeFrameLine(decodedLines[2], input.stackFrame)
    ).toEqual({
      lineNumber: '',
      isErroredLine: false,
    })
  })

  it('parse line numbers when a token contains both break and spaces', () => {
    //   4 |   return (
    //   5 |     <p>
    // > 6 |       <p>nest</p>
    //     |       ^
    //   7 |     </p>
    //   8 |   )
    //   9 | }
    const input = {
      stackFrame: {
        file: 'app/page.tsx',
        line1: 6,
        column1: 7,
        methodName: 'Page',
        arguments: [],
      },
      codeFrame: `"\u001b[0m \u001b[90m 4 |\u001b[39m   \u001b[36mreturn\u001b[39m (\n \u001b[90m 5 |\u001b[39m     \u001b[33m<\u001b[39m\u001b[33mp\u001b[39m\u001b[33m>\u001b[39m\n\u001b[31m\u001b[1m>\u001b[22m\u001b[39m\u001b[90m 6 |\u001b[39m       \u001b[33m<\u001b[39m\u001b[33mp\u001b[39m\u001b[33m>\u001b[39mnest\u001b[33m<\u001b[39m\u001b[33m/\u001b[39m\u001b[33mp\u001b[39m\u001b[33m>\u001b[39m\n \u001b[90m   |\u001b[39m       \u001b[31m\u001b[1m^\u001b[22m\u001b[39m\n \u001b[90m 7 |\u001b[39m     \u001b[33m<\u001b[39m\u001b[33m/\u001b[39m\u001b[33mp\u001b[39m\u001b[33m>\u001b[39m\n \u001b[90m 8 |\u001b[39m   )\n \u001b[90m 9 |\u001b[39m }\u001b[0m"`,
    }
    const formattedFrame = formatCodeFrame(input.codeFrame)
    const decodedLines = groupCodeFrameLines(formattedFrame)

    expect(
      parseLineNumberFromCodeFrameLine(decodedLines[1], input.stackFrame)
    ).toEqual({
      lineNumber: '5',
      isErroredLine: false,
    })
    expect(
      parseLineNumberFromCodeFrameLine(decodedLines[2], input.stackFrame)
    ).toEqual({
      lineNumber: '6',
      isErroredLine: true,
    })
    expect(
      parseLineNumberFromCodeFrameLine(decodedLines[4], input.stackFrame)
    ).toEqual({
      lineNumber: '7',
      isErroredLine: false,
    })
  })
})
