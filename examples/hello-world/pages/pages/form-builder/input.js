import TextField, { HelperText, Input } from "@material/react-text-field";

import "@material/react-text-field/dist/text-field.css";

import Icon from "./../../components/icon";

const FormInput = ({
  id,
  label,
  helperText,
  extraIcon,
  onExtraClick,
  value,
  onChange,
  ...rest
}) => (
  <TextField
    {...rest}
    label={label}
    helperText={helperText && <HelperText>{helperText}</HelperText>}
    onTrailingIconSelect={onExtraClick}
    trailingIcon={extraIcon && <Icon role="button" icon={extraIcon} />}
  >
    <Input id={id} value={value} onChange={onChange} />
  </TextField>
);

export default FormInput;
