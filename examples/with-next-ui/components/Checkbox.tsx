import { Checkbox } from "@nextui-org/react";

const CustomCheckbox = () => {
  return (
    <Checkbox.Group
      label="Select cities"
      orientation="horizontal"
      color="secondary"
      defaultValue={["buenos-aires"]}
    >
      <Checkbox value="buenos-aires">Buenos Aires</Checkbox>
      <Checkbox value="sydney">Sydney</Checkbox>
      <Checkbox value="london">London</Checkbox>
      <Checkbox value="tokyo">Tokyo</Checkbox>
    </Checkbox.Group>
  );
};

export default CustomCheckbox;
