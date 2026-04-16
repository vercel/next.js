# typescript-external-dir: PASS

Single test faithfully converted; all fixtures (project + shared TS dirs) are replicated under the converted directory via FileRef.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                           |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                      |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                                      |
| 1c  | Test titles         | pass    | Preserved verbatim                                                                                             |
| 1d  | Describe blocks     | pass    | Flattened inner describe; acceptable                                                                           |
| 2a  | URL paths           | pass    | `/` rendered via `next.render$`                                                                                |
| 2b  | Response checks     | pass    | Body text regex match preserved                                                                                |
| 2c  | FS checks           | na      |                                                                                                                |
| 2d  | Browser checks      | na      |                                                                                                                |
| 2e  | Build output        | na      |                                                                                                                |
| 2f  | Dynamic logic       | na      |                                                                                                                |
| 3a  | nextTestSetup       | pass    |                                                                                                                |
| 3b  | files param         | pass    | Uses FileRef map with subDir (needed for external-dir parent path)                                             |
| 3c  | skipStart           | na      | Dev render test                                                                                                |
| 3d  | No manual lifecycle | pass    |                                                                                                                |
| 3e  | Cleanup             | pass    |                                                                                                                |
| 4a  | Directory placement | pass    | Dev-only original → test/development/                                                                          |
| 4b  | Mode guards         | na      |                                                                                                                |
| 4c  | Turbopack guards    | na      |                                                                                                                |
| 4d  | Dedup guards        | na      |                                                                                                                |
| 4e  | No incorrect env    | pass    |                                                                                                                |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render$`                                                                               |
| 5b  | fetch               | na      |                                                                                                                |
| 5c  | browser             | na      |                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                |
| 5e  | File class          | na      |                                                                                                                |
| 5f  | waitFor             | na      |                                                                                                                |
| 5g  | fs operations       | na      |                                                                                                                |
| 6a  | Fixtures exist      | pass    | project/{pages,components,next.config.js,tsconfig.json} and shared/{tsconfig.json,components,libs} all present |
| 6b  | next.config.js      | pass    | Wired via FileRef                                                                                              |
| 6c  | Overrides           | pass    | `subDir: 'project'` + `../shared/*` FileRefs correctly replicate external-dir layout                           |
| 7a  | No dead code        | pass    |                                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                |

## Issues

None

## Warnings

None
