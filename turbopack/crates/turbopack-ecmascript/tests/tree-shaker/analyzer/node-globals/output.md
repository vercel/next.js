# Items

Count: 2

## Item 1: Stmt 0, `Normal`

```js
process.turbopack = {};

```

- Side effects

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item2["ModuleEvaluation"];
    Item2 --> Item1;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, Normal), ItemId(ModuleEvaluation)]"];
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 1,
}
```


# Modules (dev)
## Part 0
```js
process.turbopack = {};
"module evaluation";

```
## Part 1
```js

```
## Merged (module eval)
```js
process.turbopack = {};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Exports: 1,
}
```


# Modules (prod)
## Part 0
```js
process.turbopack = {};
"module evaluation";

```
## Part 1
```js

```
## Merged (module eval)
```js
process.turbopack = {};
"module evaluation";

```
