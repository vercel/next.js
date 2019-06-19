import { createContext, useContext } from "react";

export const CoffeeHourContext = createContext(null);

export const useCoffeeHour = () => useContext(CoffeeHourContext);
