let x = 0;

// 1 read
console.log(x);

// 2 read
console.log(x);

// 3 write -> 1*, 2*
x = 1;

// 4 write -> 1*, 2*
x = 2;

// 5 read -> 3, 4
let y = x;

// 6 read -> 3, 4
let z = x;

// 7 write -> 5*, 6*
x = y + z;

// 8 read + write -> 7
x = x + 1;

// 9 read + write -> 8
x *= 2;

// 10 read -> 9
console.log(x);

// 11 read -> 9
let a = x;

// 12 read + write -> 9, 10*, 11*
x = x + a + 5;

// 13 write -> 12*
x = 100;
