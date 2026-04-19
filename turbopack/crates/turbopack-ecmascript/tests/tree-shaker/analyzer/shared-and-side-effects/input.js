console.log("Hello");
const value = externalFunction();
const value2 = externalObject.propertyWithGetter;
externalObject.propertyWithSetter = 42;
const value3 = /*#__PURE__*/ externalFunction();

const shared = { value, value2, value3 };
console.log(shared);

export const a = { shared, a: "aaaaaaaaaaa" };
export const b = { shared, b: "bbbbbbbbbbb" };
