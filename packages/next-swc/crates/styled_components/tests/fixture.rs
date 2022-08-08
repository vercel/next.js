#![deny(unused)]

use std::{fs::read_to_string, path::PathBuf};
use styled_components::{styled_components, Config};
use swc_common::{chain, Mark};
use swc_ecma_transforms_testing::test_fixture;
use swc_ecmascript::{
    parser::{EsConfig, Syntax},
    transforms::resolver,
};

#[testing::fixture("tests/fixtures/**/code.js")]
fn fixture(input: PathBuf) {
    let dir = input.parent().unwrap();
    let config = read_to_string(dir.join("config.json")).expect("failed to read config.json");
    println!("---- Config -----\n{}", config);
    let config: Config = serde_json::from_str(&config).unwrap();

    test_fixture(
        Syntax::Es(EsConfig {
            jsx: true,
            ..Default::default()
        }),
        &|t| {
            //
            let fm = t.cm.load_file(&input).unwrap();

            chain!(
                resolver(Mark::new(), Mark::new(), false),
                styled_components(fm.name.clone(), fm.src_hash, config.clone())
            )
        },
        &input,
        &dir.join("output.js"),
    )
}
