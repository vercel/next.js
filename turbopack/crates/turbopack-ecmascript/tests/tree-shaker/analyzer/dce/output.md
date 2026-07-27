# Items

Count: 3

## Item 1: Stmt 0, `ImportOfModule`

```js
import { baz } from './module';

```

- Hoisted
- Side effects

## Item 2: Stmt 0, `ImportBinding(0)`

```js
import { baz } from './module';

```

- Hoisted
- Declares: `baz`

## Item 3: Stmt 1, `Normal`

```js
if (1 + 1 == 3) {
    baz();
}

```

- Side effects
- Reads: `baz`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3 --> Item2;
    Item3 --> Item1;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3 --> Item2;
    Item3 --> Item1;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item3 --> Item2;
    Item3 --> Item1;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, ImportOfModule), ItemId(1, Normal)]"];
    N1["Items: [ItemId(0, ImportBinding(0))]"];
    N0 --> N1;
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
import { baz } from './module';
import './module';
if (1 + 1 == 3) {
    baz();
}
export { };

```
## Part 1
```js

```
## Merged (module eval)
```js
import { baz } from './module';
import './module';
if (1 + 1 == 3) {
    baz();
}
export { };

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
import { baz } from './module';
import './module';
if (1 + 1 == 3) {
    baz();
}
export { };

```
## Part 1
```js

```
## Merged (module eval)
```js
import { baz } from './module';
import './module';
if (1 + 1 == 3) {
    baz();
}
export { };

```
