import foo from './wrapped'
import bar from './notwrapped'

function calc() {
  return foo() + bar();
}

output = calc() + ':' + foo() + ':' + bar();
