import Anser from 'anser'
import cn from 'classnames'
import * as React from 'react'
import stripAnsi from 'strip-ansi'
import { noop as css } from '../../noop-template'
import { StackFrame } from '../../StackFrame'

type CodeFrameProps = { stackFrame: StackFrame; codeFrame: string }

const ansiColors = css`
  [data-nextjs-codeframe] {
    border-radius: 0.3rem;
    background-color: #f6f6f6;
    color: #403f53;
    margin-bottom: 1rem;
  }
  [data-nextjs-codeframe] > hr {
    border: none;
    border-style: solid;
    border-width: 0;
    border-bottom-width: 1px;
    border-color: #403f53;
    margin: 0 0.3rem;
  }
  pre.ansi,
  [data-nextjs-codeframe] > p {
    margin: 0;
    padding: 0.5rem;
  }
  [data-nextjs-codeframe] > p {
    text-align: center;
  }
  pre.ansi::selection {
    background-color: #e0e0e0;
  }
  .ansi-decoration-bold {
    font-weight: 800;
  }
  .ansi-decoration-italic {
    font-style: italic;
  }
  .ansi-black {
    color: #403f53;
  }
  .ansi-red {
    color: #de3d3b;
  }
  .ansi-green {
    color: #08916a;
  }
  .ansi-yellow {
    color: #e0af02;
  }
  .ansi-blue {
    color: #288ed7;
  }
  .ansi-magenta {
    color: #d6438a;
  }
  .ansi-cyan {
    color: #2aa298;
  }
  .ansi-white {
    color: #f0f0f0;
  }
  .ansi-bright-black {
    color: #403f53;
  }
  .ansi-bright-red {
    color: #de3d3b;
  }
  .ansi-bright-green {
    color: #08916a;
  }
  .ansi-bright-yellow {
    color: #daaa01;
  }
  .ansi-bright-blue {
    color: #288ed7;
  }
  .ansi-bright-magenta {
    color: #d6438a;
  }
  .ansi-bright-cyan {
    color: #2aa298;
  }
  .ansi-bright-white {
    color: #f0f0f0;
  }

  @media (prefers-color-scheme: dark) {
    [data-nextjs-codeframe] {
      background-color: #011627;
      color: #d6deeb;
    }
    [data-nextjs-codeframe] > hr {
      border-color: #d6deeb;
    }
    pre.ansi::selection {
      background-color: #1d3b53;
    }
    .ansi-decoration-bold {
      font-weight: 800;
    }
    .ansi-decoration-italic {
      font-style: italic;
    }
    .ansi-black {
      color: #011627;
    }
    .ansi-red {
      color: #ef5350;
    }
    .ansi-green {
      color: #22da6e;
    }
    .ansi-yellow {
      color: #addb67;
    }
    .ansi-blue {
      color: #82aaff;
    }
    .ansi-magenta {
      color: #c792ea;
    }
    .ansi-cyan {
      color: #21c7a8;
    }
    .ansi-white {
      color: #ffffff;
    }
    .ansi-bright-black {
      color: #575656;
    }
    .ansi-bright-red {
      color: #ef5350;
    }
    .ansi-bright-green {
      color: #22da6e;
    }
    .ansi-bright-yellow {
      color: #ffeb95;
    }
    .ansi-bright-blue {
      color: #82aaff;
    }
    .ansi-bright-magenta {
      color: #c792ea;
    }
    .ansi-bright-cyan {
      color: #7fdbca;
    }
    .ansi-bright-white {
      color: #ffffff;
    }
  }
`

export const CodeFrame: React.FC<CodeFrameProps> = function CodeFrame({
  stackFrame,
  codeFrame,
}) {
  // Strip leading spaces out of the code frame:
  const formattedFrame = React.useMemo<string>(() => {
    const lines = codeFrame.split(/\r?\n/g)
    const prefixLength = lines
      .map(line => /^>? +\d+ +\| ( +)/.exec(stripAnsi(line)))
      .filter(Boolean)
      .map(v => v.pop())
      .reduce((c, n) => (isNaN(c) ? n.length : Math.min(c, n.length)), NaN)

    if (prefixLength > 1) {
      const p = ' '.repeat(prefixLength)
      return lines
        .map((line, a) =>
          ~(a = line.indexOf('|'))
            ? line.substring(0, a) + line.substring(a).replace(p, '')
            : line
        )
        .join('\n')
    }
    return lines.join('\n')
  }, [codeFrame])

  const decoded = React.useMemo(() => {
    return Anser.ansiToJson(formattedFrame, {
      json: true,
      use_classes: true,
      remove_empty: true,
    })
  }, [formattedFrame])

  // TODO: make the caret absolute
  return (
    <div data-nextjs-codeframe>
      <style dangerouslySetInnerHTML={{ __html: ansiColors }} />
      <pre className="ansi">
        {decoded.map((entry, index) => (
          <span
            key={`frame-${index}`}
            className={cn(
              entry.fg,
              entry.decoration ? `ansi-decoration-${entry.decoration}` : null
            )}
          >
            {entry.content}
          </span>
        ))}
      </pre>
      <hr />
      <p>{stackFrame.toString()}</p>
    </div>
  )
}
