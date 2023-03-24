const variableQuery = require("src/pages/__generated__/InputVariableQuery.graphql.ts");
fetchQuery(require("src/pages/__generated__/InputUsedInFunctionCallQuery.graphql.ts"));
function SomeQueryComponent() {
    useLazyLoadQuery(require("src/pages/__generated__/InputInHookQuery.graphql.ts"));
}
const variableMutation = require("src/pages/__generated__/InputVariableMutation.graphql.ts");
commitMutation(environment, require("src/pages/__generated__/InputUsedInFunctionCallMutation.graphql.ts"));
function SomeMutationComponent() {
    useMutation(require("src/pages/__generated__/InputInHookMutation.graphql.ts"));
}
