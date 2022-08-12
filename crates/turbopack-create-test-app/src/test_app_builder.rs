use std::{
    fs::{self, File},
    io::prelude::*,
    path::PathBuf,
};

use anyhow::Result;

#[derive(Default)]
pub struct TestAppBuilder {
    pub module_count: u32,
}

impl TestAppBuilder {
    pub fn build(&self) -> Result<PathBuf> {
        let path = tempfile::tempdir()?.into_path();
        let src = path.join("src");
        fs::create_dir(&src)?;

        for i in 0..self.module_count {
            File::create(src.join(format!("mod{}.js", i)))?
                .write_all(format!("export default {};\n", i).as_bytes())?;
        }

        let mods = (0..self.module_count)
            .map(|i| format!("mod{}", i))
            .collect::<Vec<String>>();

        let mut entry_asset = File::create(src.join("index.js"))?;
        for m in &mods {
            writeln!(entry_asset, "import {} from './{}.js';", m, m)?;
        }

        writeln!(entry_asset, "console.log([{}]);", mods.join(", "))?;

        Ok(path)
    }
}
