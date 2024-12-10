#[test]
fn derive_operation_value() {
    let t = trybuild::TestCases::new();
    t.pass("tests/derive_operation_value/pass_*.rs");
    t.compile_fail("tests/derive_operation_value/fail_*.rs");
}

#[test]
fn derive_resolved_value() {
    let t = trybuild::TestCases::new();
    t.pass("tests/derive_resolved_value/pass_*.rs");
    t.compile_fail("tests/derive_resolved_value/fail_*.rs");
}

#[test]
fn function() {
    let t = trybuild::TestCases::new();
    t.pass("tests/function/pass_*.rs");
    t.compile_fail("tests/function/fail_*.rs");
}

#[test]
fn value() {
    let t = trybuild::TestCases::new();
    t.pass("tests/value/pass_*.rs");
    t.compile_fail("tests/value/fail_*.rs");
}

#[test]
fn value_trait() {
    let t = trybuild::TestCases::new();
    t.pass("tests/value_trait/pass_*.rs");
    t.compile_fail("tests/value_trait/fail_*.rs");
}
