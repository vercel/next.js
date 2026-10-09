# Terminal reporting

The human reporter follows Vitest 5.0.1's default reporter: file and suite rows,
case visibility, status glyphs, deferred failures, assertion differences,
console labels, aligned totals, and watch status. The banner identifies the
Next.js version, and project badges identify the actual execution profile.

The reference is the published `vitest@5.0.1` default reporter, pinned to
[revision 0780a8e5](https://github.com/vitest-dev/vitest/tree/0780a8e5b7967a4168173599e9c74fb79aab2483/packages/vitest/src/node/reporters).
Select that reporter explicitly when comparing output: Vitest can select its
minimal reporter automatically inside an agent environment.

The reporter consumes structured events and owns no execution resources. Final
retry results determine the displayed outcome; all attempts remain in the event
history. Ignored stack frames remain in diagnostic evidence but are omitted from
terminal failures. Source excerpts come only from the retained compiled
revision's source maps, never from reading a potentially edited source file.
The separately bundled diff formatter does not initialize matcher globals.

Live terminal progress redraw, automatic agent-specific reporter selection, and
Vitest keyboard commands are not implemented. Timings describe the actual Next
run; no Vite phase measurements are invented. Coverage and artifact descriptions
remain specific to the supported Next testing capabilities.

The existing reporting unit suite checks exact text, colors, stream routing,
retry evidence, and source attribution. The public CLI integration suites cover
plain and colored results, snapshot updates, lifecycle callbacks, and watch
reruns. Package verification reads structured events through a fixture-only
preload instead of parsing human terminal output.
