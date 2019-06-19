import styled from "styled-components";
import { Formik } from "formik";

import Input from "./input";
import Select from "./select";
import Button from "./../../components/button";
import TextArea from "./text-area";
import validationBuilder from "./validation-builder";
import Error from "./error";
import { media } from "../../global";

const mapping = {
  input: Input,
  select: Select,
  textarea: TextArea
};

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  padding: 16px;
  max-width: 768px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;

  & > div {
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
  }

  ${media.phone`
    width: initial;
  `}
`;

const getInitialValues = formSchema =>
  formSchema.reduce(
    (result, { key, default: defaultValue, data_type }) => ({
      ...result,
      [key]: defaultValue
        ? defaultValue
        : data_type === "string"
        ? ""
        : undefined
    }),
    {}
  );

const Form = ({ schema = [], onSubmit }) => {
  const validationSchema = validationBuilder(schema);
  return (
    <Formik
      initialValues={getInitialValues(schema)}
      validationSchema={validationSchema}
      validateOnChange={false}
      validateOnBlur={false}
      onSubmit={async (values, actions) => {
        await onSubmit(values, actions);
        actions.resetForm();
      }}
      render={({
        values,
        errors,
        handleChange,
        handleSubmit,
        dirty,
        isValid
      }) => (
        <StyledForm onSubmit={handleSubmit}>
          {schema.map(({ key, ui_type, properties, is_required }, i) => {
            const Field = mapping[ui_type];
            return (
              <div key={`${key}-field-${i}`}>
                <Field
                  tabIndex={i}
                  key={key}
                  id={key}
                  type={ui_type}
                  required={is_required}
                  value={values[key]}
                  error={errors[key]}
                  onChange={handleChange}
                  {...properties}
                />
                {errors[key] && <Error>{errors[key]}</Error>}
              </div>
            );
          })}
          <Button raised disabled={Boolean(!dirty || !isValid)} type="submit">
            Submit
          </Button>
        </StyledForm>
      )}
    />
  );
};

export default Form;
