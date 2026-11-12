# Testing primitives

These modules implement the assertions, spies, snapshots, formatting and clocks
used by Next.js test execution. They are maintained as ordinary Next.js source: changes
go directly into the implementation and are compiled with the rest of the testing
runtime. There is no primitive bundle regeneration or dependency patch step.

The portable `common` entry shares its matcher, spy and serializer state within an
execution realm. The Node entry adds filesystem snapshot support; the Browser entry
adds DOM adapters and receives snapshot IO from the existing parent bridge. Diff and
error preparation have separate entries so host processes can format failures without
initializing matcher state.

The implementation derives from Vitest 5.0.4, Chai 6.3.0, fake-timers 15.4.0 and
expect-type 1.4.0. Component license files and source notices retain their attribution.
The fixture and reference tests exercise these implementations through the built and
installed Next.js package.
