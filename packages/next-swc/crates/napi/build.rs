use std::{
    env,
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

extern crate napi_build;

fn main() {
    let out_dir = env::var("OUT_DIR").expect("Outdir should exist");
    let dest_path = Path::new(&out_dir).join("triple.txt");
    let mut f =
        BufWriter::new(File::create(&dest_path).expect("Failed to create target triple text"));
    write!(
        f,
        "{}",
        env::var("TARGET").expect("Target should be specified")
    )
    .expect("Failed to write target triple text");

    napi_build::setup();
}
