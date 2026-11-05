# Runtime namespace coverage

The fixture exercises one executed TypeScript namespace with exported literal
constants and named functions in development and production. It asserts successful
execution and compares exact coverage counters and authored locations.

`facts.json`, emitted JavaScript and source maps exercise namespace association.
The zero-hit model provides locations only; actual execution supplies the counts.
Mapping controls check the generated namespace IIFE, its argument, exported
literal assignments and named-function publication. Only the compiler-generated
function publication statement is excluded; authored statement, function and
branch counts remain. Failed controls leave all input data unchanged.

Nested or merged namespaces, mutable exports, enums, unexecuted typed-source
coverage and broader execution profiles remain outside this fixture's scope.
