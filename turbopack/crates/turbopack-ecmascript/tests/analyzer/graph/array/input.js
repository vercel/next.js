const [a, b] = [1, "foo"];

const c = [1, "foo"][global.index];

const d1 = [1, "foo"];
const d2 = d1[global.index];
const d3 = d1[1];
const d4 = d1[2];

for (const value of d1){
}

for (const value of []){
}
