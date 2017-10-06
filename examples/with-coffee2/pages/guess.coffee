import React, { Component } from 'react'

export default class GuessTheNumber extends Component
  @getInitialProps: ({ req }) =>
    number: Math.floor (Math.random() * 100)

  render: =>
    {number} = @props
    
    # no more return, no more unnecessary quotes, just return the jsx as an expression
    <div>
      Guess The Number: <input 
        type="number" 
        placeholder="Enter your number..." 
        ref={(c) => @numberField = c}
      /> 
      
      <button onClick={=>
        if @numberField.value > number
          alert "The number you've guessed is too big..."
        else if @numberField.value <  number
          alert "The number you've guessed is too small..."
        else 
          alert "Congratulations! You've got the right number!"
      }>Submit</button>
    </div>
