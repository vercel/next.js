# Items

Count: 17

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
    Item14["export dogRef"];
    Item15;
    Item15["export cat"];
    Item16;
    Item16["export initialCat"];
    Item17;
    Item17["export getChimera"];
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
    Item14["export dogRef"];
    Item15;
    Item15["export cat"];
    Item16;
    Item16["export initialCat"];
    Item17;
    Item17["export getChimera"];
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
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item1;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item14 --> Item10;
    Item15 --> Item11;
    Item16 --> Item12;
    Item17 --> Item13;
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
    Item14["export dogRef"];
    Item15;
    Item15["export cat"];
    Item16;
    Item16["export initialCat"];
    Item17;
    Item17["export getChimera"];
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
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item1;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item14 --> Item10;
    Item15 --> Item11;
    Item16 --> Item12;
    Item17 --> Item13;
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
    Item14["export dogRef"];
    Item15;
    Item15["export cat"];
    Item16;
    Item16["export initialCat"];
    Item17;
    Item17["export getChimera"];
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
    Item9 --> Item6;
    Item10 --> Item8;
    Item10 --> Item1;
    Item10 --> Item4;
    Item10 --> Item7;
    Item12 --> Item11;
    Item14 --> Item10;
    Item15 --> Item11;
    Item16 --> Item12;
    Item17 --> Item13;
    Item4 --> Item8;
    Item4 --> Item1;
    Item7 -.-> Item9;
    Item7 -.-> Item10;
    Item7 --> Item1;
    Item13 --> Item11;
    Item13 --> Item8;
    Item13 --> Item1;
```
# Final
```mermaid
graph TD
    N0["Items: [ItemId(0, VarDeclarator(0))]"];
    N1["Items: [ItemId(1, Normal), ItemId(2, Normal), ItemId(4, Normal), ItemId(5, Normal), ItemId(7, Normal)]"];
    N2["Items: [ItemId(3, Normal), ItemId(6, Normal), ItemId(8, Normal), ItemId(9, VarDeclarator(0)), ItemId(Export((&quot;dogRef&quot;, #2), &quot;dogRef&quot;))]"];
    N3["Items: [ItemId(10, VarDeclarator(0))]"];
    N4["Items: [ItemId(11, VarDeclarator(0)), ItemId(Export((&quot;initialCat&quot;, #2), &quot;initialCat&quot;))]"];
    N5["Items: [ItemId(12, Normal), ItemId(Export((&quot;getChimera&quot;, #2), &quot;getChimera&quot;))]"];
    N6["Items: [ItemId(Export((&quot;cat&quot;, #2), &quot;cat&quot;))]"];
    N5 --> N0;
    N5 --> N3;
    N4 --> N3;
    N5 --> N1;
    N2 --> N1;
    N1 --> N0;
    N2 --> N0;
    N6 --> N3;
```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "cat",
    ): 6,
    Export(
        "dogRef",
    ): 2,
    Export(
        "getChimera",
    ): 5,
    Export(
        "initialCat",
    ): 4,
    Exports: 7,
}
```


# Modules (dev)
## Part 0
```js
let dog = "dog";
export { dog as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
dog += "!";
console.log(dog);
dog += "!";
console.log(dog);
dog += "!";

```
## Part 2
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
function getDog() {
    return dog;
}
function setDog(newDog) {
    dog = newDog;
}
console.log(dog);
const dogRef = {
    initial: dog,
    get: getDog,
    set: setDog
};
export { dogRef };
export { getDog as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { setDog as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { dogRef as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
## Part 3
```js
let cat = "cat";
export { cat as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { e as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
const initialCat = cat;
export { initialCat };
export { initialCat as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 5
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { e as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
function getChimera() {
    return cat + dog;
}
export { getChimera };
export { getChimera as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import { e as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -3
};
export { cat };

```
## Part 7
```js
export { dogRef } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export dogRef"
};
export { initialCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export initialCat"
};
export { getChimera } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getChimera"
};
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
};

```
## Merged (module eval)
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
function getDog() {
    return dog;
}
function setDog(newDog) {
    dog = newDog;
}
console.log(dog);
const dogRef = {
    initial: dog,
    get: getDog,
    set: setDog
};
export { dogRef };
export { getDog as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { setDog as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { dogRef as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { };

```
# Entrypoints

```
{
    ModuleEvaluation: 2,
    Export(
        "cat",
    ): 8,
    Export(
        "dogRef",
    ): 3,
    Export(
        "getChimera",
    ): 7,
    Export(
        "initialCat",
    ): 6,
    Exports: 9,
}
```


# Modules (prod)
## Part 0
```js
let dog = "dog";
export { dog as a } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 1
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
dog += "!";
dog += "!";

```
## Part 2
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);
console.log(dog);
console.log(dog);
export { };

```
## Part 3
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
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
export { dogRef };
export { getDog as b } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { setDog as c } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};
export { dogRef as d } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 4
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
dog += "!";

```
## Part 5
```js
let cat = "cat";
export { cat as e } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 6
```js
import { e as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
const initialCat = cat;
export { initialCat };
export { initialCat as f } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 7
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import { e as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
function getChimera() {
    return cat + dog;
}
export { getChimera };
export { getChimera as g } from "__TURBOPACK_VAR__" assert {
    __turbopack_var__: true
};

```
## Part 8
```js
import { e as cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -5
};
export { cat };

```
## Part 9
```js
export { dogRef } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export dogRef"
};
export { initialCat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export initialCat"
};
export { getChimera } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export getChimera"
};
export { cat } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: "export cat"
};

```
## Merged (module eval)
```js
import { a as dog } from "__TURBOPACK_PART__" assert {
    __turbopack_part__: -0
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 1
};
import "__TURBOPACK_PART__" assert {
    __turbopack_part__: 4
};
console.log(dog);
console.log(dog);
console.log(dog);
export { };

```
