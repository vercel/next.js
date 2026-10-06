# Graph methods

Use these methods for the main workflow's community → min-cut pass or when direct importer inspection needs graph analysis. Read the installed schema for field meanings; construct a route-scoped graph from exact identities and verified client roots. Missing or unknown evidence stays an explicit gap.

## Clustering — find logical communities

Use Louvain/Leiden or another community algorithm on the scoped, deduplicated ordinary import graph. Keep synchronous, asynchronous and traced relationships distinct. If symmetrizing direction, record the weights, resolution, seed and stability across runs.

**Prioritize deferral candidates:** use scoped client-output attribution to rank communities whose features are optional for the selected route or needed only after interaction. Inspect their actual importers and behavior constraints before proposing a cut.

**Done:** each proposed community has reproducible parameters, scoped attributed contributions and inspected project importers. Treat it as a candidate to investigate, not an emitted chunk or a valid client/server boundary.

## Conditional min cut — detach a target

1. **Define the scenario:** record the route/render conditions, verified client roots and heavy target. Use directed synchronous importer→imported edges and exact output→module memberships.
2. **Establish completeness:** check every relevant output's coverage and group triggers against route output membership. Account for unknown client roles, uncertain triggers and overlapping/cumulative group memberships. A group that cannot isolate one reference or an unsupported membership may supply another path. Output membership and group role establish build provenance, not cold-request scope.
3. **Choose the claim:** make a definitive cut only if every possibly relevant root→target path is accounted for. Otherwise report a cut of the **known subgraph** as provisional, identify the missing evidence and give a verification plan.
4. **Solve and check:** connect selected roots to a super-source and targets to a sink. Choose unit-edge or size/edit-cost capacities deliberately. Protect shared runtime and required initial UI edges with uncuttable capacities or equivalent constraints; record the protected edges and reasons. If no feasible cut remains, report that result. Condense strongly connected components if needed. Check that every synchronous path in the claimed scenario is severed, including alternate roots and cycles.

**Done:** the cut records its scenario, graph scope, capacities, inspected importer edges and completeness limits. A mathematical cut is a proposed source change, not automatically a safe `import()` or a measured browser saving. Return to the main workflow's behavior checks before accepting a fix.
