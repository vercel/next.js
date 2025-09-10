# devlow-bench

DEVeloper workfLOW BENCHmarking tool

## Installation

```bash
npm install devlow-bench
```

## Usage

```bash
Usage: devlow-bench [options] <scenario files>
## Selecting scenarios
  --scenario=<filter>, -s=<filter>   Only run the scenario with the given name
  --interactive, -i                  Select scenarios and variants interactively
  --<prop>=<value>                   Filter by any variant property defined in scenarios
## Output
  --json=<path>, -j=<path>           Write the results to the given path as JSON
  --console                          Print the results to the console
  --datadog[=<hostname>]             Upload the results to Datadog
                                     (requires DATADOG_API_KEY environment variables)
## Help
  --help, -h, -?                     Show this help
```

## Scenarios

A scenario file is similar to a test case file. It can contain one or multiple scenarios by using the `describe()` method to define them.

```js
import { describe } from 'devlow-bench'

describe(
  'my scenario',
  {
    /* property options */
  },
  async (
    {
      /* property values */
    }
  ) => {
    // run the scenario
  }
)
```

The `describe()` method takes three arguments:

- `name`: The name of the scenario
- `props`: An object with possible property values for the scenario.
- `fn`: The function that runs the scenario. It is passed an object with the property values as the first argument.

The `props` object can contain any number of properties. The key is the name of the property. The value must either be an array of possible values (number, string, boolean), or it can be `true` as shortcut for `[true, false]` resp. `false` for `[false, true]`. The scenario will run for every possible combination of the property values, if not specified otherwise.

### Example

```js
import { describe } from 'devlow-bench'

describe(
  'my scenario',
  {
    myProperty: [1, 2, 3],
    myOtherProperty: true,
  },
  async ({ myProperty, myOtherProperty }) => {
    console.log(myProperty, myOtherProperty)
  }
)

// will print:
// 1 true
// 2 true
// 3 true
// 1 false
// 2 false
// 3 false
```

## Reporting measurements

```js
import { measureTime, reportMeasurement } from 'devlow-bench'

// Measure a time
await measureTime('name of the timing', {
  /* optional options */
})

// Report some other measurement
await reportMeasurement('name of the measurement', value, unit, {
  /* optional options */
})
```

Options:

- `relativeTo`: measure time/value relative to some other measurement.
- `scenario`: override the reported scenario name (to make measurement independent of scenario name)
- `props`: override the reported scenario properties (to make measurement independent of scenario properties, object is merged with original props, to remove a prop use `null` value)

## Browser operations

The `devlow-bench` package provides a few helper functions to run operations in the browser.

```js
import { newBrowserSession } from 'devlow-bench/browser'

const session = await newBrowserSession({
  // options
})
await session.hardNavigation('metric name', 'https://example.com')
await session.reload('metric name')
await session.softNavigationByClick('metric name', '.selector-to-click')
await session.close()
```

Run with `BROWSER_OUTPUT=1` to show the output of the browser.

Run with `HEADLESS=false` to show the actual browser window.

## Shell operations

The `devlow-bench` package provides a few helper functions to run operations in the shell.

```js
import { command } from 'devlow-bench/shell';

const shell = await command("pnpm", ["run", "build"], {
  env: { /* optional env vars */ }
  cwd: "/optional/path/to/directory"
});

// Wait for successful exit
await shell.ok();

// Wait for exit
const exitCode = await shell.end();

// Wait for specific output
const [match, world] = await shell.waitForOutput(/hello (world)/);

// Report memory usage or the process tree as metric
await shell.reportMemUsage("metric name", { /* optional options */ });

shell.stdout, shell.stderr

// merged output
shell.output

// Kill the process tree
await shell.kill();
```

Run with `SHELL_OUTPUT=1` to show the output of the shell commands.

## File operations

The `devlow-bench` package provides a few helper functions to run operations on the file system.

```js
import { waitForFile } from 'devlow-bench/file'

// wait for file to exist
await waitForFile('/path/to/file', /* timeout = */ 30000)
```
