export const countActionTypes = {
  ADD: 'ADD',
}

export const addCount = () => dispatch => {
  return dispatch({ type: countActionTypes.ADD })
}
