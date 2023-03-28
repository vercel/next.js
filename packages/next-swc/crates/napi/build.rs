use std::{
    env,
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

extern crate napi_build;

fn main() {
    // Emit current platform's target-triple into a text file to create static const
    // in util.rs
    let out_dir = env::var("OUT_DIR").expect("Outdir should exist");
    let dest_path = Path::new(&out_dir).join("triple.txt");
    let mut f =
        BufWriter::new(File::create(dest_path).expect("Failed to create target triple text"));
    write!(
        f,
        "{}",
        env::var("TARGET").expect("Target should be specified")
    )
    .expect("Failed to write target triple text");

    // Emit current package.json's version field into a text file to create static
    // const in util.rs This is being used to set correct release version for
    // the sentry's crash reporter.
    let pkg_file =
        File::open(Path::new("../../package.json")).expect("Should able to open package.json");
    let json: serde_json::Value = serde_json::from_reader(pkg_file).unwrap();
    let pkg_version_dest_path = Path::new(&out_dir).join("package.txt");
    let mut package_version_writer = BufWriter::new(
        File::create(pkg_version_dest_path).expect("Failed to create package version text"),
    );
    write!(
        package_version_writer,
        "{}",
        json["version"].as_str().unwrap()
    )
    .expect("Failed to write target triple text");

    napi_build::setup();
}
