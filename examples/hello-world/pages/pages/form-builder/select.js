import Select, { Option } from "@material/react-select";

import "@material/react-select/dist/select.css";
import "@material/react-list/dist/list.css";
import "@material/react-menu-surface/dist/menu-surface.css";

const FormSelect = ({ id, label, value, items = [], onChange = () => {} }) => (
  <Select id={id} label={label} value={value} onChange={onChange}>
    <Option value="" disabled />
    {items.map((value, i) => (
      <Option key={`${label}-${i}`} value={value}>
        {value}
      </Option>
    ))}
  </Select>
);

export default FormSelect;
