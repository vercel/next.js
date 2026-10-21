# Runtime namespace coverage

This fixture retains unchanged authored TypeScript and test bodies, complete
Vitest 5.0.4 V8 reports, and actual Next compiler JavaScript and source maps.
The public CLI compares complete development and production coverage reports.

`facts.json` retains actual observed counters and compiler mappings together with
an authored zero-hit descriptor model. Null JSON columns restore Infinity. The
model supplies locations only. Association controls require the generated IIFE,
its namespace argument, exported literal assignment and function publication to
match their authored mappings. Only the proven compiler function publication
statement is excluded; authored statement, function and branch counts survive.
Failed controls preserve all input bytes and objects.

This corpus covers one executed namespace with exported literal constants and
named function declarations. Nested or merged namespaces, mutable exports, enums,
unexecuted typed-source coverage and broader execution profiles remain separate
compatibility work.
