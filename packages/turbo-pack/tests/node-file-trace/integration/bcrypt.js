const bcrypt = require('bcrypt');
bcrypt.hash('pass', 10).then(function(hash) {
  console.log(hash);
});
