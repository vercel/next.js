var GuessTheNumber,
  boundMethodCheck = function(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new Error('Bound instance method accessed before binding'); } };

import React, {
  Component
} from 'react';

export default GuessTheNumber = class GuessTheNumber extends Component {
  constructor() {
    super(...arguments);
    this.render = this.render.bind(this);
  }

  static getInitialProps({req}) {
    return {
      number: Math.floor(Math.random() * 100)
    };
  }

  render() {
    var number;
    boundMethodCheck(this, GuessTheNumber);
    ({number} = this.props);
    return <div>
      Guess The Number: <input type="number" placeholder="Enter your number..." ref={(c) => {
        return this.numberField = c;
      }} /> 
      
      <button onClick={() => {
        if (this.numberField.value > number) {
          return alert("The number you've guessed is too big...");
        } else if (this.numberField.value < number) {
          return alert("The number you've guessed is too small...");
        } else {
          return alert("Congratulations! You've got the right number!");
        }
      }}>Submit</button>
    </div>;
  }

};
