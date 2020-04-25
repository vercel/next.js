import * as React from 'react'
import cn from 'classnames'
import Anser from 'anser'
import { noop as css } from '../../noop-template'

type CodeFrameProps = { codeFrame: string }

const ansiColors = css`
  pre.ansi {
    border-radius: 0.3rem;
    padding: 0.5rem;
    background-color: #f6f6f6;
    color: #403f53;
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
    pre.ansi {
      background-color: #011627;
      color: #d6deeb;
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
  codeFrame,
}) {
  const decoded = React.useMemo(() => {
    return Anser.ansiToJson(codeFrame, {
      json: true,
      use_classes: true,
      remove_empty: true,
    })
  }, [codeFrame])
  console.log(decoded.filter(f => f.decoration))
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ansiColors }} />
      <pre className="ansi">
        {decoded.map(entry => (
          <span
            className={cn(
              entry.fg,
              entry.decoration ? `ansi-decoration-${entry.decoration}` : null
            )}
          >
            {entry.content}
          </span>
        ))}
      </pre>
    </>
  )
}
