function* x() { yield 1; yield 2; };
var k;
output = 0;
for (k of x()) {
  output += k;
}