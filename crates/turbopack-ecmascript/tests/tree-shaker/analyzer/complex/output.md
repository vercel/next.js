# Items

Count: 18

## Item 1: Stmt 0, `VarDeclarator(0)`

```js
let dog = "dog";

```

- Declares: `dog`
- Write: `dog`

## Item 2: Stmt 1, `Normal`

```js
dog += "!";

```

- Reads: `dog`
- Write: `dog`

## Item 3: Stmt 2, `Normal`

```js
console.log(dog);

```

- Side effects
- Reads: `dog`

## Item 4: Stmt 3, `Normal`

```js
function getDog() {
    return dog;
}

```

- Hoisted
- Declares: `getDog`
- Reads (eventual): `dog`
- Write: `getDog`

## Item 5: Stmt 4, `Normal`

```js
dog += "!";

```

- Reads: `dog`
- Write: `dog`

## Item 6: Stmt 5, `Normal`

```js
console.log(dog);

```

- Side effects
- Reads: `dog`

## Item 7: Stmt 6, `Normal`

```js
function setDog(newDog) {
    dog = newDog;
}

```

- Hoisted
- Declares: `setDog`
- Write: `setDog`
- Write (eventual): `dog`

## Item 8: Stmt 7, `Normal`

```js
dog += "!";

```

- Reads: `dog`
- Write: `dog`

## Item 9: Stmt 8, `Normal`

```js
console.log(dog);

```

- Side effects
- Reads: `dog`

## Item 10: Stmt 9, `VarDeclarator(0)`

```js
export const dogRef = {
    initial: dog,
    get: getDog,
    set: setDog
};

```

- Declares: `dogRef`
- Reads: `dog`, `getDog`, `setDog`
- Write: `dogRef`

## Item 11: Stmt 10, `VarDeclarator(0)`

```js
export let cat = "cat";

```

- Declares: `cat`
- Write: `cat`

## Item 12: Stmt 11, `VarDeclarator(0)`

```js
export const initialCat = cat;

```

- Declares: `initialCat`
- Reads: `cat`
- Write: `initialCat`

## Item 13: Stmt 12, `Normal`

```js
export function getChimera() {
    return cat + dog;
}

```

- Hoisted
- Declares: `getChimera`
- Reads (eventual): `cat`, `dog`
- Write: `getChimera`

# Phase 1
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export dogRef"];
    Item16;
    Item16["export cat"];
    Item17;
    Item17["export initialCat"];
    Item18;
    Item18["export getChimera"];
```
# Phase 2
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export dogRef"];
    Item16;
    Item16["export cat"];
    Item17;
    Item17["export initialCat"];
    Item18;
    Item18["export getChimera"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item5 --> Item2;
    Item5 -.-> Item3;
    Item6 --> Item5;
    Item6 --> Item3;
    Item8 --> Item5;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item3;
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
```
# Phase 3
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export dogRef"];
    Item16;
    Item16["export cat"];
    Item17;
    Item17["export initialCat"];
    Item18;
    Item18["export getChimera"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item5 --> Item2;
    Item5 -.-> Item3;
    Item6 --> Item5;
    Item6 --> Item3;
    Item8 --> Item5;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item3;
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item4 --> Item8;
    Item7 -.-> Item9;
    Item7 -.-> Item10;
    Item13 --> Item11;
    Item13 --> Item8;
```
# Phase 4
```mermaid
graph TD
    Item1;
    Item2;
    Item3;
    Item4;
    Item5;
    Item6;
    Item7;
    Item8;
    Item9;
    Item10;
    Item11;
    Item12;
    Item13;
    Item14;
    Item14["ModuleEvaluation"];
    Item15;
    Item15["export dogRef"];
    Item16;
    Item16["export cat"];
    Item17;
    Item17["export initialCat"];
    Item18;
    Item18["export getChimera"];
    Item2 --> Item1;
    Item3 --> Item2;
    Item5 --> Item2;
    Item5 -.-> Item3;
    Item6 --> Item5;
    Item6 --> Item3;
    Item8 --> Item5;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item3;
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item4 --> Item8;
    Item7 -.-> Item9;
    Item7 -.-> Item10;
    Item13 --> Item11;
    Item13 --> Item8;
    Item14 --> Item3;
    Item14 --> Item6;
    Item14 --> Item9;
    Item15 --> Item10;
    Item16 --> Item11;
    Item17 --> Item12;
    Item18 --> Item13;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(ModuleEvaluation)]"];
    N1["Items: [ItemId(Export((&quot;dogRef&quot;, #2), &quot;dogRef&quot;))]"];
    N2["Items: [ItemId(Export((&quot;cat&quot;, #2), &quot;cat&quot;))]"];
    N3["Items: [ItemId(Export((&quot;initialCat&quot;, #2), &quot;initialCat&quot;)), ItemId(11, VarDeclarator(0))]"];
    N4["Items: [ItemId(Export((&quot;getChimera&quot;, #2), &quot;getChimera&quot;)), ItemId(12, Normal)]"];
    N5["Items: [ItemId(6, Normal), ItemId(9, VarDeclarator(0))]"];
    N6["Items: [ItemId(0, VarDeclarator(0))]"];
    N7["Items: [ItemId(1, Normal)]"];
    N8["Items: [ItemId(2, Normal)]"];
    N9["Items: [ItemId(3, Normal)]"];
    N10["Items: [ItemId(4, Normal)]"];
    N11["Items: [ItemId(5, Normal)]"];
    N12["Items: [ItemId(7, Normal)]"];
    N13["Items: [ItemId(8, Normal)]"];
    N14["Items: [ItemId(10, VarDeclarator(0))]"];
    N0 --> N8;
    N0 --> N11;
    N0 --> N13;
    N1 --> N5;
    N2 --> N14;
    N3 --> N14;
    N4 --> N14;
    N4 --> N12;
    N5 --> N13;
    N5 --> N12;
    N5 --> N9;
    N7 --> N6;
    N8 --> N7;
    N9 --> N12;
    N10 --> N7;
    N10 --> N8;
    N11 --> N10;
    N11 --> N8;
    N12 --> N10;
    N12 --> N11;
    N13 --> N12;
    N13 --> N8;
    N13 --> N11;
```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "getChimera",
    ): 4,
    Export(
        "initialCat",
    ): 3,
    Export(
        "cat",
    ): 2,
    Export(
        "dogRef",
    ): 1,
}
```


# Modules (dev)
## Part 0
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
## Part 1
```js
import { dogRef } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
export { dogRef };

```
## Part 2
```js
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
export { cat };

```
## Part 3
```js
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
export { initialCat };
const initialCat = cat;
export { initialCat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { getChimera };
function getChimera() {
    return cat + dog;
}
export { getChimera } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import { getDog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
function setDog(newDog) {
    dog = newDog;
}
const dogRef = {
    initial: dog,
    get: getDog,
    set: setDog
};
export { setDog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { dogRef } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
let dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
dog += "!";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
console.log(dog);

```
## Part 9
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
function getDog() {
    return dog;
}
export { getDog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
dog += "!";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
console.log(dog);

```
## Part 12
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
dog += "!";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
console.log(dog);

```
## Part 14
```js
let cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
# Entrypoints

```
{
    ModuleEvaluation: 0,
    Export(
        "getChimera",
    ): 4,
    Export(
        "initialCat",
    ): 3,
    Export(
        "cat",
    ): 2,
    Export(
        "dogRef",
    ): 1,
}
```


# Modules (prod)
## Part 0
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";
console.log(dog);
console.log(dog);
console.log(dog);

```
## Part 1
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { dogRef };
function getDog() {
    return dog;
}
function setDog(newDog) {
    dog = newDog;
}
const dogRef = {
    initial: dog,
    get: getDog,
    set: setDog
};
export { getDog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { setDog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { dogRef } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 2
```js
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { cat };

```
## Part 3
```js
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { initialCat };
const initialCat = cat;
export { initialCat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
export { getChimera };
function getChimera() {
    return cat + dog;
}
export { getChimera } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
let dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
dog += "!";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
dog += "!";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
dog += "!";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 9
```js
let cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Merged (module eval)
```js
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
"module evaluation";
console.log(dog);
console.log(dog);
console.log(dog);

```
