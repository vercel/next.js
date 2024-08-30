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
    Item3 --> Item1;
    Item5 --> Item2;
    Item5 --> Item1;
    Item5 -.-> Item3;
    Item6 --> Item5;
    Item6 --> Item1;
    Item6 --> Item3;
    Item8 --> Item5;
    Item8 --> Item1;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 --> Item3;
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item1;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item15 --> Item10;
    Item16 --> Item11;
    Item17 --> Item12;
    Item18 --> Item13;
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
    Item3 --> Item1;
    Item5 --> Item2;
    Item5 --> Item1;
    Item5 -.-> Item3;
    Item6 --> Item5;
    Item6 --> Item1;
    Item6 --> Item3;
    Item8 --> Item5;
    Item8 --> Item1;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 --> Item3;
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item1;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item15 --> Item10;
    Item16 --> Item11;
    Item17 --> Item12;
    Item18 --> Item13;
    Item4 --> Item8;
    Item4 --> Item1;
    Item7 -.-> Item9;
    Item7 -.-> Item10;
    Item7 --> Item1;
    Item13 --> Item11;
    Item13 --> Item8;
    Item13 --> Item1;
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
    Item3 --> Item1;
    Item5 --> Item2;
    Item5 --> Item1;
    Item5 -.-> Item3;
    Item6 --> Item5;
    Item6 --> Item1;
    Item6 --> Item3;
    Item8 --> Item5;
    Item8 --> Item1;
    Item8 -.-> Item6;
    Item9 --> Item8;
    Item9 --> Item1;
    Item9 --> Item3;
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item1;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item15 --> Item10;
    Item16 --> Item11;
    Item17 --> Item12;
    Item18 --> Item13;
    Item4 --> Item8;
    Item4 --> Item1;
    Item7 -.-> Item9;
    Item7 -.-> Item10;
    Item7 --> Item1;
    Item13 --> Item11;
    Item13 --> Item8;
    Item13 --> Item1;
    Item14 --> Item3;
    Item14 --> Item6;
    Item14 --> Item9;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(10, VarDeclarator(0))]"];
    N1["Items: [ItemId(Export((&quot;cat&quot;, #2), &quot;cat&quot;))]"];
    N2["Items: [ItemId(11, VarDeclarator(0))]"];
    N3["Items: [ItemId(Export((&quot;initialCat&quot;, #2), &quot;initialCat&quot;))]"];
    N4["Items: [ItemId(0, VarDeclarator(0))]"];
    N5["Items: [ItemId(1, Normal)]"];
    N6["Items: [ItemId(2, Normal)]"];
    N7["Items: [ItemId(4, Normal)]"];
    N8["Items: [ItemId(5, Normal)]"];
    N9["Items: [ItemId(7, Normal)]"];
    N10["Items: [ItemId(12, Normal)]"];
    N11["Items: [ItemId(Export((&quot;getChimera&quot;, #2), &quot;getChimera&quot;))]"];
    N12["Items: [ItemId(3, Normal)]"];
    N13["Items: [ItemId(8, Normal)]"];
    N14["Items: [ItemId(ModuleEvaluation)]"];
    N15["Items: [ItemId(6, Normal), ItemId(9, VarDeclarator(0))]"];
    N16["Items: [ItemId(Export((&quot;dogRef&quot;, #2), &quot;dogRef&quot;))]"];
    N5 --> N4;
    N6 --> N5;
    N6 --> N4;
    N7 --> N5;
    N7 --> N4;
    N7 -.-> N6;
    N8 --> N7;
    N8 --> N4;
    N8 --> N6;
    N9 --> N7;
    N9 --> N4;
    N9 -.-> N8;
    N13 --> N9;
    N13 --> N4;
    N13 --> N6;
    N13 --> N8;
    N15 --> N9;
    N15 --> N4;
    N15 --> N12;
    N15 -.-> N15;
    N2 --> N0;
    N16 --> N15;
    N1 --> N0;
    N3 --> N2;
    N11 --> N10;
    N12 --> N9;
    N12 --> N4;
    N15 -.-> N13;
    N10 --> N0;
    N10 --> N9;
    N10 --> N4;
    N14 --> N6;
    N14 --> N8;
    N14 --> N13;
```
# Entrypoints

```
{
    Export(
        "getChimera",
    ): 11,
    ModuleEvaluation: 14,
    Export(
        "initialCat",
    ): 3,
    Exports: 17,
    Export(
        "cat",
    ): 1,
    Export(
        "dogRef",
    ): 16,
}
```


# Modules (dev)
## Part 0
```js
let cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
export { cat };

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const initialCat = cat;
export { initialCat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { initialCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { initialCat };

```
## Part 4
```js
let dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
dog += "!";

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
dog += "!";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
dog += "!";

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function getChimera() {
    return cat + dog;
}
export { getChimera } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
import { getChimera } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 10
};
export { getChimera };

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
function getDog() {
    return dog;
}
export { getDog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
import { getDog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
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
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import { dogRef } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
export { dogRef };

```
## Part 17
```js
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
};
export { initialCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export initialCat"
};
export { getChimera } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getChimera"
};
export { dogRef } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export dogRef"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 13
};
"module evaluation";

```
# Entrypoints

```
{
    Export(
        "getChimera",
    ): 10,
    ModuleEvaluation: 17,
    Export(
        "initialCat",
    ): 3,
    Exports: 18,
    Export(
        "cat",
    ): 1,
    Export(
        "dogRef",
    ): 13,
}
```


# Modules (prod)
## Part 0
```js
let cat = "cat";
export { cat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
export { cat };

```
## Part 2
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
const initialCat = cat;
export { initialCat } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 3
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
import { initialCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 2
};
export { initialCat };

```
## Part 4
```js
let dog = "dog";
export { dog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
function setDog(newDog) {
    dog = newDog;
}
export { setDog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
dog += "!";

```
## Part 7
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
dog += "!";

```
## Part 8
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
dog += "!";

```
## Part 9
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 0
};
function getChimera() {
    return cat + dog;
}
export { getChimera } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 10
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
import { getChimera } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 9
};
export { getChimera };

```
## Part 11
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
function getDog() {
    return dog;
}
export { getDog } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 12
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { getDog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 11
};
import { setDog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 5
};
const dogRef = {
    initial: dog,
    get: getDog,
    set: setDog
};
export { dogRef } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 13
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
import { dogRef } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 12
};
export { dogRef };

```
## Part 14
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 6
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);

```
## Part 15
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 7
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);

```
## Part 16
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 8
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import { dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);

```
## Part 17
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
"module evaluation";

```
## Part 18
```js
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
};
export { initialCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export initialCat"
};
export { getChimera } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getChimera"
};
export { dogRef } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export dogRef"
};

```
## Merged (module eval)
```js
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 16
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 15
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 14
};
"module evaluation";

```
