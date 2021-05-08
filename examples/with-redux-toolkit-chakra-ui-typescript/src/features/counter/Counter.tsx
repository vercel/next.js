import React, { useState } from 'react';

import {
  decrement,
  increment,
  incrementByAmount,
  incrementAsync,
  incrementIfOdd,
  selectCount,
} from './counterSlice';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { Box, Button, Input, Text } from '@chakra-ui/react';

interface CounterProps {

}

export const Counter: React.FC<CounterProps> = ({ }) => {
  const count = useAppSelector(selectCount);
  const dispatch = useAppDispatch();
  const [incrementAmount, setIncrementAmount] = useState('2');

  const incrementValue = Number(incrementAmount) || 0;

  return (
    <Box p={4} m={4}>
      <Box d="flex" justifyContent="center" alignItems="center">
        <Button
          px={4}
          mx={4}
          variant="outline" colorScheme="green"
          onClick={() => dispatch(decrement())}
        >
          -
        </Button>
        <Text fontSize="sm">{count}</Text>
        <Button
          px={4}
          mx={4}
          variant="outline" colorScheme="green"
          onClick={() => dispatch(increment())}
        >
          +
        </Button>
      </Box>
      <div >
        <Input
          value={incrementAmount}
          onChange={(e) => setIncrementAmount(e.target.value)}
          p={4}
          m={4}

        />
        <Button
          px={4}
          mx={4}
          variant="solid" colorScheme="green"
          onClick={() => dispatch(incrementByAmount(incrementValue))}
        >
          Add Amount
        </Button>
        <Button
          px={4}
          mx={4}
          variant="solid" colorScheme="green"
          onClick={() => dispatch(incrementAsync(incrementValue))}
        >
          Add Async
        </Button>
        <Button
          px={4}
          mx={4}
          variant="solid" colorScheme="green"
          onClick={() => dispatch(incrementIfOdd(incrementValue))}
        >
          Add If Odd
        </Button>
      </div>
    </Box>
  );
}
