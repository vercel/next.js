#[path = "../src/next_ssg.rs"]
mod next_ssg;

use self::next_ssg::next_ssg;
use swc_ecma_transforms_testing::test;
use swc_ecmascript::parser::{EsConfig, Syntax};

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

test!(
    syntax(),
    |_| next_ssg(),
    export_1,
    "
    const getStaticPaths = () => {
        return []
    }

    export { getStaticPaths }

    export default function Test() {
        return <div />
    }
    ",
    "
    export var __N_SSG = true;
    export default function Test() {
        return <div />;
    };
    "
);
