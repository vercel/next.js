import * as R from 'ramda';

console.log((0, R.pipe)('a', 'b', 'c'));
console.log(R.pipe('a', 'b', 'c'));


it('should import only pipe.js', () => {
  const modules = Object.keys(__turbopack_modules__);
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/node_modules\/ramda\/pipe/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/ramda\/index/)
  );
})
