# Incremental Computation

Recompute only what changed. Systems in this family include Salsa, Adapton,
and [[Turbo Tasks]].

The key mechanisms are memoization, dependency tracking, and early cutoff.
Early cutoff is what makes layering tasks worthwhile: if a recomputed value is
equal to the previous one, propagation stops.
