// Unset RUSTC_WRAPPER before trybuild tests run. When sccache wraps rustc, it
// emits "warning: ignoring -C extra-filename flag due to -o flag" which pollutes
// trybuild's stderr snapshot comparisons. Unsetting it here means only the
// sub-compilations trybuild spawns are affected — the main test binary was already
// compiled with sccache.
#[ctor::ctor]
fn unset_rustc_wrapper() {
    unsafe { std::env::remove_var("RUSTC_WRAPPER") };
}

#[test]
fn derive_operation_value() {
    let t = trybuild::TestCases::new();
    t.pass("tests/derive_operation_value/pass_*.rs");
    t.compile_fail("tests/derive_operation_value/fail_*.rs");
}

#[test]
fn derive_non_local_value() {
    let t = trybuild::TestCases::new();
    t.pass("tests/derive_non_local_value/pass_*.rs");
    t.compile_fail("tests/derive_non_local_value/fail_*.rs");
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
