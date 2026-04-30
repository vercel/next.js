# conflicting-public-file-page: PASS

Clean conversion with preserved test count, assertions, and behavior; fixtures correctly migrated.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                            |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                       |
| 1b  | Assertions          | pass    | original: 7, converted: 7                                                                       |
| 1c  | Test titles         | pass    | Titles slightly reworded but semantically equivalent                                            |
| 1d  | Describe blocks     | pass    | Inner dev/prod describes flattened via isNextDev/isNextStart                                    |
| 2a  | URL paths           | pass    | /another/conflict, /hello covered                                                               |
| 2b  | Response checks     | pass    | regex matches preserved                                                                         |
| 2c  | FS checks           | na      |                                                                                                 |
| 2d  | Browser checks      | na      |                                                                                                 |
| 2e  | Build output        | pass    | Uses next.build() + cliOutput                                                                   |
| 2f  | Dynamic logic       | pass    | Dev/prod split maps to isNextDev/isNextStart                                                    |
| 3a  | nextTestSetup       | pass    |                                                                                                 |
| 3b  | files param         | pass    | files: \_\_dirname                                                                              |
| 3c  | skipStart           | pass    | skipStart:true, next.start() in dev, next.build() in prod                                       |
| 3d  | No manual lifecycle | pass    |                                                                                                 |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                        |
| 4a  | Directory placement | pass    | test/e2e/ (runs both dev and prod)                                                              |
| 4b  | Mode guards         | pass    | Correct isNextDev/isNextStart gating                                                            |
| 4c  | Turbopack guards    | na      | Original had dedup-style guards only                                                            |
| 4d  | Dedup guards        | warn    | Original TURBOPACK_DEV/TURBOPACK_BUILD guards not carried over, but criterion 4e prohibits them |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD used                                                           |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                     |
| 5b  | fetch               | na      |                                                                                                 |
| 5c  | browser             | na      |                                                                                                 |
| 5d  | check→retry         | na      |                                                                                                 |
| 5e  | File class          | na      |                                                                                                 |
| 5f  | waitFor             | na      |                                                                                                 |
| 5g  | fs operations       | na      |                                                                                                 |
| 6a  | Fixtures exist      | pass    | pages/another/{conflict,index}.js, pages/hello.js, public/\* all present                        |
| 6b  | next.config.js      | na      | Original had none                                                                               |
| 6c  | Overrides           | na      |                                                                                                 |
| 7a  | No dead code        | pass    |                                                                                                 |
| 7b  | retry over timeout  | pass    |                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                 |
| 7d  | eslint              | pass    |                                                                                                 |

## Issues

None

## Warnings

- 4d: The original used `TURBOPACK_BUILD`/`TURBOPACK_DEV` env guards as a form of mode skip. These weren't carried over, but per criterion 4e the new pattern (isNextDev/isNextStart) is preferred, so this is acceptable.
