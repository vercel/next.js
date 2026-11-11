# Constructor parameter-property coverage

The five constructor fixtures run in development and production. Tests assert
successful execution and compare exact statement, function and branch counters
and authored locations. Case outcomes use direct assertions rather than saved
Vitest standard reports.

`facts.json`, `emitted.js.txt` and source maps exercise constructor association
without providing execution counts. The zero-hit model supplies locations only.
The mapping tests cover modifiers and literal defaults, and reject ambiguous
constructor, parameter and assignment associations without changing input data.

These fixtures cover executed named class declarations with identifier property
parameters, measured modifiers and literal defaults. Unexecuted typed-source
coverage, other constructor shapes, decorators, enums and namespaces remain
outside this corpus. Existing uncertified-map diagnostics remain covered.
