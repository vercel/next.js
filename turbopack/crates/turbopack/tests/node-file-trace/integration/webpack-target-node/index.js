const sayHello = require('./chunk').default;

sayHello().then((h) => {
  console.log(h)
});
