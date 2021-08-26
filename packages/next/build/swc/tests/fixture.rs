use self::amp_attributes::amp_attributes;
use self::next_dynamic::next_dynamic;
use self::next_ssg::next_ssg;
use std::path::PathBuf;
use swc_common::{chain, comments::SingleThreadedComments, FileName};
use swc_ecma_transforms_testing::{test, test_fixture};
use swc_ecmascript::{
  parser::{EsConfig, Syntax},
  transforms::react::jsx,
};
use testing::fixture;

#[path = "../src/amp_attributes.rs"]
mod amp_attributes;
#[path = "../src/next_dynamic.rs"]
mod next_dynamic;
#[path = "../src/next_ssg.rs"]
mod next_ssg;

fn syntax() -> Syntax {
  Syntax::Es(EsConfig {
    jsx: true,
    dynamic_import: true,
    ..Default::default()
  })
}

#[fixture("tests/fixture/amp/**/input.js")]
fn amp_attributes_fixture(input: PathBuf) {
  let output = input.parent().unwrap().join("output.js");
  test_fixture(syntax(), &|_tr| amp_attributes(), &input, &output);
}

#[fixture("tests/fixture/next-dynamic/**/input.js")]
fn next_dynamic_fixture(input: PathBuf) {
  let output = input.parent().unwrap().join("output.js");
  test_fixture(
    syntax(),
    &|_tr| {
      next_dynamic(FileName::Real(PathBuf::from(
        "/some-project/src/some-file.js",
      )))
    },
    &input,
    &output,
  );
}

#[fixture("tests/fixture/ssg/**/input.js")]
fn next_ssg_fixture(input: PathBuf) {
  let output = input.parent().unwrap().join("output.js");
  test_fixture(
    syntax(),
    &|tr| {
      let jsx = jsx::<SingleThreadedComments>(
        tr.cm.clone(),
        None,
        swc_ecmascript::transforms::react::Options {
          next: false,
          runtime: None,
          import_source: "".into(),
          pragma: "__jsx".into(),
          pragma_frag: "__jsxFrag".into(),
          throw_if_namespace: false,
          development: false,
          use_builtins: true,
          use_spread: true,
          refresh: Default::default(),
        },
      );
      chain!(next_ssg(), jsx)
    },
    &input,
    &output,
  );
}
