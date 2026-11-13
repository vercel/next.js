# Route Handler parameter matching

Route Handlers use `unstable_paramMatching` or `unstable_generateParamMatching` to choose which URL parameter values they accept. Each handler sets its own rules for parameters defined by its directories. The rules apply to every HTTP method. Page and layout rules do not apply to handlers.

Handlers support `not-found` and `dynamic`. The page modes `blocking` and `fallback` are rejected because handlers do not render page fallbacks. Parameters without an explicit rule keep their usual behavior.

`not-found` accepts combinations returned by the handler's `generateStaticParams`. This also works when the handler reads cookies or accepts arbitrary values for later parameters. A `dynamic` parameter does not produce a cached whole response at build time. Functions with `use cache` can still cache their results.

Metadata generators choose IDs. Matching declarations on metadata files can name URL parameters from directories, while generated IDs stay internal. This suite tests a single-image metadata handler. Combining parent values with multiple image or sitemap IDs is a separate change.

The tests cover HTTP methods, automatic and authored HEAD, exact generated combinations, encoded values, catch-all parameters, rewrites, independent page and handler rules, changing cookies, inner caches, and development updates. Local production checks also cover adapter parameter forwarding, minimal mode, missing packaged settings, and cached GET responses that do not load handler code.

The build validation suite rejects unsupported modes, unknown parameter names, both matching exports together, generated values for a dynamic parameter, and matching without Cache Components. The existing parameter-matching type tests check handler parameter names and mutually exclusive exports too.

A mix of complete and incomplete generated combinations does not prove that the response can be cached. Such a handler keeps accepting its allowed parameter values and runs dynamically. If packaging loses the matching settings, the handler checks before other methods can reuse a GET cache entry and before executing a method. Cached GET responses keep their existing lazy loading behavior.
