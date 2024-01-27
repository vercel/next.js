use std::{cell::RefCell, rc::Rc, sync::Arc};

use fxhash::FxHashSet;
use next_custom_transforms::transforms::next_ssg::next_ssg;
use once_cell::sync::Lazy;
use turbopack_binding::swc::core::{
    base::{try_with_handler, Compiler},
    common::{comments::SingleThreadedComments, FileName, FilePathMapping, SourceMap, GLOBALS},
    ecma::transforms::base::pass::noop,
};

static COMPILER: Lazy<Arc<Compiler>> = Lazy::new(|| {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm))
});

#[test]
fn should_collect_estimated_third_part_packages() {
    let eliminated_packages: Rc<RefCell<FxHashSet<String>>> = Default::default();
    let fm = COMPILER.cm.new_source_file(
        FileName::Real("fixture.js".into()),
        r#"import http from 'http'
import { hash } from '@napi-rs/bcrypt'

import { omit } from '~/utils/omit'
import config from './data.json'

export default () => 'Hello World'

export function getServerSideProps() {
  console.log(http)
  console.log(config)
  return { props: { digest: hash('hello') } }
}
"#
        .to_owned(),
    );
    assert!(
        try_with_handler(COMPILER.cm.clone(), Default::default(), |handler| {
            GLOBALS.set(&Default::default(), || {
                let comments = SingleThreadedComments::default();
                COMPILER.process_js_with_custom_pass(
                    fm,
                    None,
                    handler,
                    &Default::default(),
                    comments,
                    |_| next_ssg(eliminated_packages.clone()),
                    |_| noop(),
                )
            })
        })
        .is_ok()
    );
    assert_eq!(
        eliminated_packages
            .borrow()
            .iter()
            .collect::<Vec<&String>>(),
        vec!["@napi-rs/bcrypt", "http"]
    );
}
