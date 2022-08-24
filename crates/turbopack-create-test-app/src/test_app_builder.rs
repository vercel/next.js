use std::{
    collections::VecDeque,
    fs::{create_dir_all, File},
    io::prelude::*,
    path::PathBuf,
};

use anyhow::{Context, Result};

fn decide(remaining: usize, min_remaining_decisions: usize) -> bool {
    if remaining == 0 {
        false
    } else if min_remaining_decisions <= remaining {
        true
    } else {
        let urgentness = min_remaining_decisions / remaining;
        (min_remaining_decisions * 11 * 7 * 5) % urgentness == 0
    }
}

pub struct TestAppBuilder {
    pub target: Option<PathBuf>,
    pub module_count: usize,
    pub directories_count: usize,
    pub flatness: usize,
}

impl Default for TestAppBuilder {
    fn default() -> Self {
        Self {
            target: None,
            module_count: 1000,
            directories_count: 50,
            flatness: 5,
        }
    }
}

impl TestAppBuilder {
    pub fn build(&self) -> Result<PathBuf> {
        let path = if let Some(target) = self.target.clone() {
            target
        } else {
            tempfile::tempdir().context("creating tempdir")?.into_path()
        };
        let src = path.join("src");
        create_dir_all(&src).context("creating src dir")?;

        let mut remaining_modules = self.module_count - 1;
        let mut remaining_directories = self.directories_count;

        let mut queue = VecDeque::new();
        queue.push_back(src.join("triangle.js"));
        remaining_modules -= 1;

        while let Some(file) = queue.pop_front() {
            let leaf = remaining_modules == 0
                || (!queue.is_empty()
                    && (queue.len() + remaining_modules) % (self.flatness + 1) == 0);
            if leaf {
                File::create(file)
                    .context("creating file")?
                    .write_all(
                        r#"export default function Triangle({ style }) {
    return <polygon points="-5,4.33 0,-4.33 5,4.33" style={style} />;
}
"#
                        .as_bytes(),
                    )
                    .context("writing file")?;
            } else {
                let in_subdirectory = decide(remaining_directories, remaining_modules / 3);

                let import_path;
                let base_file = file.with_extension("");
                let base_file = if in_subdirectory {
                    remaining_directories -= 1;
                    create_dir_all(&base_file).context("creating subdirectory")?;
                    import_path = format!(
                        "./{}/triangle_",
                        base_file.file_name().unwrap().to_str().unwrap()
                    );
                    base_file.join("triangle")
                } else {
                    import_path =
                        format!("./{}_", base_file.file_name().unwrap().to_str().unwrap());
                    base_file
                };

                for i in 1..=3 {
                    let mut f = base_file.clone();
                    f.set_file_name(format!(
                        "{}_{}.js",
                        f.file_name().unwrap().to_str().unwrap(),
                        i
                    ));
                    queue.push_back(f);
                }
                remaining_modules = remaining_modules.saturating_sub(3);

                File::create(&file)
                    .with_context(|| format!("creating file with children {}", file.display()))?
                    .write_all(
                        format!(
                            r#"// Container for 3 child triangles
import A from "{import_path}1";
import B from "{import_path}2";
import C from "{import_path}3";
export default function Container({{ style }}) {{
    return <>
        <g transform="translate(0 -2.16)   scale(0.5 0.5)"><A style={{style}}/></g>
        <g transform="translate(-2.5 2.16) scale(0.5 0.5)"><B style={{style}}/></g>
        <g transform="translate(2.5 2.16)  scale(0.5 0.5)"><C style={{style}}/></g>
    </>;
}}
"#
                        )
                        .as_bytes(),
                    )
                    .with_context(|| format!("writing file with children {}", file.display()))?;
            }
        }

        let bootstrap = r#"import { createRoot } from "react-dom/client";
import Triangle from "./triangle.js";

function App() {
    return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ }}>
        <Triangle style={{ fill: "white" }}/>
    </svg>
}

document.body.style.backgroundColor = "black";
let root = document.createElement("main");
document.body.appendChild(root);
createRoot(root).render(<App />);
"#;
        File::create(src.join("index.js"))
            .context("creating bootstrap file")?
            .write_all(bootstrap.as_bytes())
            .context("writing bootstrap file")?;

        let pages = src.join("pages");
        create_dir_all(&pages)?;

        let bootstrap_page = r#"
import Triangle from "../triangle.js";

export default function Page() {
    return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ backgroundColor: "black" }}>
    <Triangle style={{ fill: "white" }}/>
    </svg>
}
"#;
        File::create(pages.join("page.js"))
            .context("creating bootstrap page")?
            .write_all(bootstrap_page.as_bytes())
            .context("writing bootstrap page")?;

        Ok(path)
    }
}
