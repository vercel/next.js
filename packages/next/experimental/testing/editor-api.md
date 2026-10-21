# Editor discovery and watch controls

Start the Next-owned test runner with an explicit API port:

```sh
next test --watch --api 51204
```

`--api` uses port 51204 by default; `--api 0` selects an available port. The
runner prints the actual discovery URL. The API listens on `127.0.0.1` and
accepts requests addressed to that loopback origin.

Full-run watch controls are qualified for route-less development and production
Node execution. One-shot development and production Node execution also supports
discovery and cancellation. Production watch supports initial execution,
source/dependency/configuration changes, terminal and API reruns, active API
cancellation, and recovery while keeping the same API port. Individual file
reruns support development and production Node as described below. Watch debugging,
editor snapshot updates, and compatibility with existing Vitest editor
extensions remain unqualified.
For a root JSON configuration with one isolated, route-less development Node
project and no coverage, `globalSetup` runs once across watch reruns. Each
generation receives a fresh clone of the fulfilled provided context. Changing
the configuration replaces the setup owner; closing watch runs its teardown
after the final generation finishes cleanup. Pending or failed initial setup
is not retained. Editing only an existing setup source keeps the fulfilled
context and current healthy run when no test imports that file as an ordinary
dependency. Imported consumers still rerun. Restart watch or change its selected
configuration to create a new setup owner. Other global-setup configurations and
execution profiles remain unqualified.

## Discover the current run

Send `GET /v1/discovery` to the printed host and port. The response has
`version: 1`, `protocol: "next-test-discovery"`, selected `files`, the current
`run` or `null`, and observed `cases`. A case appears after its actual execution
event; `observedCasesOnly: true` does not promise static collection of every
case. The response advertises available run actions in `controls`. When exact
file reruns are available, `fileControls` also contains `rerun: true` and an
`entries` array of eligible file/profile IDs.

Watch discovery stays on the same port across generations. A new generation
replaces the selected files, current run and observed cases. Run IDs identify
one generation; clients should read discovery again before issuing a command.

## Rerun a settled watch generation

After discovery advertises `controls.rerun`, send:

```text
POST /v1/runs/<encoded-run-id>/rerun
```

Encode the current `run.id` with `encodeURIComponent`. The current run must have
settled. The API acknowledges with HTTP 202 before scheduling the next run
through the existing watch owner. It does not accept a replacement file or
case selection in the request. A repeated command for the same generation
acknowledges `already-requested` and schedules no additional run.

## Rerun one physical file

For isolated development or production Node watch without coverage, discovery can advertise
`fileControls.rerun`. Choose an exact ID from `fileControls.entries` and send:

```text
POST /v1/runs/<encoded-run-id>/files/<encoded-entry-id>/rerun
```

Encode both IDs with `encodeURIComponent`. The current run must have settled.
The API acknowledges with HTTP 202 before the watch owner schedules that exact
file and project profile. Files with similar names and other profiles of the
same file keep their own IDs. Discovery retains the complete selected catalog;
the new run reports cases observed in the requested file.

A repeated request for the same file before the next generation starts returns
`already-requested` and schedules once. A different file action or full rerun
cannot replace an already accepted action for that generation. If the accepted
file disappears before execution, the next run fails without executing another
file, including when `passWithNoTests` is enabled. A later full rerun restores the
normal watch selection.

Individual test-case selection, file reruns with coverage, other execution
profiles, editor debugging and editor snapshot updates remain unqualified.

## Cancel the active generation

When discovery advertises `controls.cancel`, send:

```text
POST /v1/runs/<encoded-run-id>/cancel
```

Cancellation requires the current running ID and returns HTTP 202 before
entering owned cleanup. In watch mode, the session remains available for a
later rerun. A cancelled generation settles only after its execution and report
owners join. One-shot cancellation closes the runner with exit status 130.

All command routes require POST. Stale IDs and incompatible run states return
HTTP 409; malformed encoded IDs return HTTP 400. The runner closes the API and
its owned sockets when the session ends.
