export const SET_STRING = 'SET_STRING'
/**
 * sets the string, if none is passed, it will default to the below string.
 * @param theString
 * @return {{type: string, theString: String}}
 */
export function setString (theString: String = 'the default string') {
  return {
    type: SET_STRING,
    theString
  }
}
