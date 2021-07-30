use self::amp_attributes::amp_attributes;
use std::path::PathBuf;
use swc_common::chain;
use swc_ecma_transforms_testing::{test, test_fixture};
use swc_ecmascript::{
  parser::{EsConfig, Syntax},
  transforms::pass::noop,
};
use testing::fixture;

#[path = "../src/amp_attributes.rs"]
mod amp_attributes;

fn syntax() -> Syntax {
  Syntax::Es(EsConfig {
    jsx: true,
    ..Default::default()
  })
}

#[fixture("tests/fixture/amp/**/input.js")]
fn next_ssg_fixture(input: PathBuf) {
  let output = input.parent().unwrap().join("output.js");
  test_fixture(
    syntax(),
    &|_tr| chain!(amp_attributes(), noop()),
    &input,
    &output,
  );
}
