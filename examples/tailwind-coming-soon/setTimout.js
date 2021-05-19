function Timeout() {
    console.log('Ready....go!');
    setTimeout(() => {
      console.log("Time's up -- stop!");
     
    }, 1000);
  }
  
  module.exports = Timeout;