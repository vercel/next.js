import run from './module';

it('should evaluate IIFE correctly', () => {
  expect(run()).toEqual('should run');
});
