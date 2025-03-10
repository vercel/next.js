import { named } from "./module.js";

function Fun({ value = named }) {
  return value;
}

const Fun2 = ({ value2 = named }) => {
  return value2;
};
