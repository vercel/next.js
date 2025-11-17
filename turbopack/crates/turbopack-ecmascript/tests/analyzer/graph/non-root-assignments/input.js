// should be inferred as not having non-root assignments
export function named_function_export_const_after_eval() {
}

if (true) {
  named_function_export_const_after_eval = 2
}
// should be inferred as not having non-root assignments
export default function default_function_export_const_after_eval() {

}

for (let i = 0; i < 10; i++) {
  d1 = 2
}
// should be inferred as not having non-root assignments
export let named_let_export_const_after_eval = 2

// ditto
export const named_const_export_const_after_eval = 3

// should be inferred as not having non-root assignments
let named_let_export_const_after_eval_2
// should be inferred as having non-root assignments
let named_let_export_not_const_after_eval = 1
let named_let_export_not_const_after_eval_2 = 1
export {named_let_export_not_const_after_eval as e4, named_let_export_const_after_eval_2}

named_let_export_const_after_eval_2 = 5
setTimeout(() => {
  named_let_export_not_const_after_eval = 5
}, 1);

export class ConstAfterEvalClass {
  named_class_method_export_const_after_eval() {
    named_let_export_not_const_after_eval_2=3
  }
}



