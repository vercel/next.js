import * as yup from "yup";
import { reduce } from "lodash";

// a validation rule usually looks like this:
// yup.[fieldType]()[...more rules].required()
// ex. yup.number().max(25).required()
const validationRuleBuilder = (type, required, rules) => {
  const validationRules = reduce(
    rules,
    (accRules, { type, options, message }) => {
      // one special case
      // our schema has a special validation type named 'pattern'
      // which matches up with the yup validation 'match' rule
      if (type === "pattern") {
        return accRules["matches"](new RegExp(options.value), message);
      }

      return options // if validation options exist
        ? accRules[type](options.value, message)
        : accRules[type](message);
    },
    yup[type]()
  );
  return required
    ? validationRules.required("This field is required")
    : validationRules;
};

// a validation schema usually looks like this:
// let schema = yup.object().shape({
//  [fieldName]: validation rule,
//  [fieldName]: validation rule
// });
const validationBuilder = schema => {
  const validationSchema = reduce(
    schema,
    (
      result,
      { key, data_type: dataType, is_required: required, validation }
    ) => {
      return {
        ...result,
        [key]: validationRuleBuilder(dataType, required, validation)
      };
    },
    {}
  );
  return yup.object().shape(validationSchema);
};

export default validationBuilder;
