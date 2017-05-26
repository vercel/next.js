const app = require('express')()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const next = require('next')
//http://johnny-five.io/
const five = require('johnny-five');

const dev = process.env.NODE_ENV !== 'production'
const nextApp = next({ dev })
const nextHandler = nextApp.getRequestHandler()

let led = null;

five.Board().on('ready', function() {
  console.log('Arduino is ready.');

  // Initial state
  let state = {
    value: 0
  };   

  // Map pins to digital inputs on the board
  led = new five.Led(13); 

});

nextApp.prepare().then(() => {

  app.get('*', (req, res) => {
    return nextHandler(req, res)
  })

  var setState = function(st) {
      if(st == 1){
        led.on();
      }else {
        led.off();
      }
  };

  io.on('connection', function(client) {
    client.on('join', function(handshake) {
      console.log(handshake);
    });

    client.on('led', function(data) {
      // Set the new colors
      setState(data);

      //client.emit('led', data);
      //client.broadcast.emit('led', data);
    });
  });

  //You should change 'localhost' by you ip adress.
  //change it on the index.js too.
  server.listen(3000, 'localhost', (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
