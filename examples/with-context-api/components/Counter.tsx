import {
  useReducer,
  useContext,
  createContext,
  ReactNode,
  Dispatch,
} from "react";

type CounterState = number;
type CounterAction =
  | {
      type: "INCREASE" | "DECREASE";
    }
  | {
      type: "INCREASE_BY";
      payload: number;
    };

const CounterStateContext = createContext<CounterState>(0);
const CounterDispatchContext = createContext<Dispatch<CounterAction>>(
  () => null,
);

const reducer = (state: CounterState, action: CounterAction) => {
  switch (action.type) {
    case "INCREASE":
      return state + 1;
    case "DECREASE":
      return state - 1;
    case "INCREASE_BY":
      return state + action.payload;
    default:
      throw new Error(`Unknown action: ${JSON.stringify(action)}`);
  }
};

type CounterProviderProps = {
  children: ReactNode;
  initialValue?: number;
};

export const CounterProvider = ({
  children,
  initialValue = 0,
}: CounterProviderProps) => {
  const [state, dispatch] = useReducer(reducer, initialValue);
  return (
    <CounterDispatchContext.Provider value={dispatch}>
      <CounterStateContext.Provider value={state}>
        {children}
      </CounterStateContext.Provider>
    </CounterDispatchContext.Provider>
  );
};

export const useCount = () => useContext(CounterStateContext);
export const useDispatchCount = () => useContext(CounterDispatchContext);
