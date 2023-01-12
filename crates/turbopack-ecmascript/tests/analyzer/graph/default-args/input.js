import { named } from "./module.js";

function Fun({ value = named }) {
  return value;
}

const Fun2 = ({ value = named }) => {
  return value;
};
