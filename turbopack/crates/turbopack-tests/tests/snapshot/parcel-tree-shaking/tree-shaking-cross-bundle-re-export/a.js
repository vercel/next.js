output = Promise.all([import("./b1.js").then(m => m.default), import("./b2.js").then(m => m.default)]);
