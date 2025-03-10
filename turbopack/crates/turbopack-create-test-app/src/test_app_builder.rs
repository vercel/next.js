use std::{
    collections::VecDeque,
    fs::{create_dir_all, File},
    io::prelude::*,
    path::{Path, PathBuf},
    str::FromStr,
};

use anyhow::{anyhow, Context, Result};
use indoc::{formatdoc, indoc};
use serde_json::json;
use tempfile::TempDir;

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

fn decide_early(remaining: usize, min_remaining_decisions: usize) -> bool {
    if remaining == 0 {
        false
    } else if min_remaining_decisions <= remaining {
        true
    } else {
        let urgentness = min_remaining_decisions / remaining / remaining;
        (min_remaining_decisions * 11 * 7 * 5) % urgentness == 0
    }
}

fn write_file<P: AsRef<Path>>(name: &str, path: P, content: &[u8]) -> Result<()> {
    File::create(path)
        .with_context(|| format!("creating {name}"))?
        .write_all(content)
        .with_context(|| format!("writing {name}"))
}

/// How to run effects in components.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum EffectMode {
    /// No effects at all.
    #[default]
    None,
    /// As a direct `useEffect` hook in the component's body.
    Hook,
    /// Rendering an <Effect /> client-side component that has the `useEffect`
    /// hook instead. Good for testing React Server Components, as they can't
    /// use `useEffect` hooks directly.
    Component,
}

impl FromStr for EffectMode {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "none" => Ok(EffectMode::None),
            "hook" => Ok(EffectMode::Hook),
            "component" => Ok(EffectMode::Component),
            _ => Err(anyhow!("unknown effect mode: {}", s)),
        }
    }
}

#[derive(Debug)]
pub struct TestAppBuilder {
    pub target: Option<PathBuf>,
    pub module_count: usize,
    pub directories_count: usize,
    pub dynamic_import_count: usize,
    pub flatness: usize,
    pub package_json: Option<PackageJsonConfig>,
    pub effect_mode: EffectMode,
    pub leaf_client_components: bool,
}

impl Default for TestAppBuilder {
    fn default() -> Self {
        Self {
            target: None,
            module_count: 1000,
            directories_count: 50,
            dynamic_import_count: 0,
            flatness: 5,
            package_json: Some(Default::default()),
            effect_mode: EffectMode::Hook,
            leaf_client_components: false,
        }
    }
}

const SETUP_IMPORTS: &str = indoc! {r#"
import React from "react";
"#};
const SETUP_EFFECT_PROPS: &str = indoc! {r#"
let EFFECT_PROPS = {};
"#};
const SETUP_EVAL: &str = indoc! {r#"
/* @turbopack-bench:eval-start */
/* @turbopack-bench:eval-end */
"#};
const USE_EFFECT: &str = indoc! {r#"
React.useEffect(() => {
    if (EFFECT_PROPS.hydration) {
        globalThis.__turbopackBenchBinding && globalThis.__turbopackBenchBinding("Hydration done");
    }
    if (EFFECT_PROPS.message) {
        globalThis.__turbopackBenchBinding && globalThis.__turbopackBenchBinding(EFFECT_PROPS.message);
    }
}, [EFFECT_PROPS]);
"#};
const EFFECT_ELEMENT: &str = indoc! {r#"
<Effect {...EFFECT_PROPS} />
"#};

impl TestAppBuilder {
    pub fn build(&self) -> Result<TestApp> {
        let target = if let Some(target) = self.target.clone() {
            TestAppTarget::Set(target)
        } else {
            TestAppTarget::Temp(tempfile::tempdir().context("creating tempdir")?)
        };
        let path = target.path();
        let mut modules = vec![];
        let src = path.join("src");
        create_dir_all(&src).context("creating src dir")?;

        let mut remaining_modules = self.module_count - 1;
        let mut remaining_directories = self.directories_count;
        let mut remaining_dynamic_imports = self.dynamic_import_count;

        let mut queue = VecDeque::with_capacity(32);
        queue.push_back((src.join("triangle.jsx"), 0));
        remaining_modules -= 1;
        let mut is_root = true;

        let (additional_body, additional_elements) = match self.effect_mode {
            EffectMode::None => ("", ""),
            EffectMode::Component => ("", EFFECT_ELEMENT),
            EffectMode::Hook => (USE_EFFECT, ""),
        };

        while let Some((file, depth)) = queue.pop_front() {
            modules.push((file.clone(), depth));

            let setup_imports = match self.effect_mode {
                EffectMode::Hook | EffectMode::None => SETUP_IMPORTS.to_string(),
                EffectMode::Component => {
                    let relative_effect = if src == file.parent().unwrap() {
                        "./effect.jsx".to_string()
                    } else {
                        pathdiff::diff_paths(src.join("effect.jsx"), file.parent().unwrap())
                            .unwrap()
                            .display()
                            .to_string()
                    };

                    #[cfg(windows)]
                    let relative_effect = relative_effect.replace('\\', "/");

                    formatdoc! {r#"
                        {SETUP_IMPORTS}
                        import Effect from "{relative_effect}";
                    "#}
                }
            };

            let leaf = remaining_modules == 0
                || (!queue.is_empty()
                    && (queue.len() + remaining_modules) % (self.flatness + 1) == 0);
            if leaf {
                let maybe_use_client = if self.leaf_client_components {
                    r#""use client";"#
                } else {
                    ""
                };
                write_file(
                    &format!("leaf file {}", file.display()),
                    &file,
                    formatdoc! {r#"
                        {maybe_use_client}

                        {setup_imports}

                        {SETUP_EFFECT_PROPS}
                        {SETUP_EVAL}

                        function Triangle({{ style }}) {{
                            {additional_body}
                            return <>
                                <polygon points="-5,4.33 0,-4.33 5,4.33" style={{style}} />
                                {additional_elements}
                            </>;
                        }}

                        export default React.memo(Triangle);
                    "#}
                    .as_bytes(),
                )?;
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
                        "{}_{}.jsx",
                        f.file_name().unwrap().to_str().unwrap(),
                        i
                    ));
                    queue.push_back((f, depth + 1));
                }
                remaining_modules = remaining_modules.saturating_sub(3);

                if let [(a, a_), (b, b_), (c, c_)] = &*[("A", "1"), ("B", "2"), ("C", "3")]
                    .into_iter()
                    .enumerate()
                    .map(|(i, (name, n))| {
                        if decide_early(remaining_dynamic_imports, remaining_modules + (2 - i)) {
                            remaining_dynamic_imports -= 1;
                            (
                                format!(
                                    "const {name}Lazy = React.lazy(() => \
                                     import('{import_path}{n}'));"
                                ),
                                format!(
                                    "<React.Suspense><{name}Lazy style={{style}} \
                                     /></React.Suspense>"
                                ),
                            )
                        } else {
                            (
                                format!("import {name} from '{import_path}{n}'"),
                                format!("<{name} style={{style}} />"),
                            )
                        }
                    })
                    .collect::<Vec<_>>()
                {
                    let setup_hydration = if is_root {
                        is_root = false;
                        "\nEFFECT_PROPS.hydration = true;"
                    } else {
                        ""
                    };
                    write_file(
                        &format!("file with children {}", file.display()),
                        &file,
                        formatdoc! {r#"
                            {setup_imports}
                            {a}
                            {b}
                            {c}

                            {SETUP_EFFECT_PROPS}{setup_hydration}
                            {SETUP_EVAL}

                            function Container({{ style }}) {{
                                {additional_body}
                                return <>
                                    <g transform="translate(0 -2.16)   scale(0.5 0.5)">
                                        {a_}
                                    </g>
                                    <g transform="translate(-2.5 2.16) scale(0.5 0.5)">
                                        {b_}
                                    </g>
                                    <g transform="translate(2.5 2.16)  scale(0.5 0.5)">
                                        {c_}
                                    </g>
                                    {additional_elements}
                                </>;
                            }}

                            export default React.memo(Container);
                        "#}
                        .as_bytes(),
                    )?;
                } else {
                    unreachable!()
                }
            }
        }

        let bootstrap = indoc! {r#"
            import React from "react";
            import { createRoot } from "react-dom/client";
            import Triangle from "./triangle.jsx";

            function App() {
                return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ }}>
                    <Triangle style={{ fill: "white" }}/>
                </svg>
            }

            document.body.style.backgroundColor = "black";
            let root = document.createElement("main");
            document.body.appendChild(root);
            createRoot(root).render(<App />);
        "#};
        write_file(
            "bootstrap file",
            src.join("index.jsx"),
            bootstrap.as_bytes(),
        )?;

        let pages = src.join("pages");
        create_dir_all(&pages)?;

        // The page is e. g. used by Next.js
        let bootstrap_page = indoc! {r#"
            import React from "react";
            import Triangle from "../triangle.jsx";

            export default function Page() {
                return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ backgroundColor: "black" }}>
                    <Triangle style={{ fill: "white" }}/>
                </svg>
            }
        "#};
        write_file(
            "bootstrap page",
            pages.join("page.jsx"),
            bootstrap_page.as_bytes(),
        )?;

        // The page is e. g. used by Next.js
        let bootstrap_static_page = indoc! {r#"
            import React from "react";
            import Triangle from "../triangle.jsx";

            export default function Page() {
                return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ backgroundColor: "black" }}>
                    <Triangle style={{ fill: "white" }}/>
                </svg>
            }

            export function getStaticProps() {
                return {
                    props: {}
                };
            }
        "#};
        write_file(
            "bootstrap static page",
            pages.join("static.jsx"),
            bootstrap_static_page.as_bytes(),
        )?;

        let app_dir = src.join("app");
        create_dir_all(app_dir.join("app"))?;
        create_dir_all(app_dir.join("client"))?;

        // The page is e. g. used by Next.js
        let bootstrap_app_page = indoc! {r#"
            import React from "react";
            import Triangle from "../../triangle.jsx";

            export default function Page() {
                return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ backgroundColor: "black" }}>
                    <Triangle style={{ fill: "white" }}/>
                </svg>
            }
        "#};
        write_file(
            "bootstrap app page",
            app_dir.join("app/page.jsx"),
            bootstrap_app_page.as_bytes(),
        )?;

        if matches!(self.effect_mode, EffectMode::Component) {
            // The component is used to measure hydration and commit time for app/page.jsx
            let effect_component = formatdoc! {r#"
                "use client";

                import React from "react";

                export default function Effect(EFFECT_PROPS) {{
                    {USE_EFFECT}
                    return null;
                }}
            "#};
            write_file(
                "effect component",
                src.join("effect.jsx"),
                effect_component.as_bytes(),
            )?;
        }

        // The page is e. g. used by Next.js
        let bootstrap_app_client_page = indoc! {r#"
            "use client";
            import React from "react";
            import Triangle from "../../triangle.jsx";

            export default function Page() {
                return <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{ backgroundColor: "black" }}>
                    <Triangle style={{ fill: "white" }}/>
                </svg>
            }
        "#};
        write_file(
            "bootstrap app client page",
            app_dir.join("client/page.jsx"),
            bootstrap_app_client_page.as_bytes(),
        )?;

        // This root layout is e. g. used by Next.js
        let bootstrap_layout = indoc! {r#"
            export default function RootLayout({ children }) {
                return (
                    <html lang="en">
                        <head>
                            <meta charSet="UTF-8" />
                            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                            <title>Turbopack Test App</title>
                        </head>
                        <body>
                            {children}
                        </body>
                    </html>
                );
            }
        "#};
        write_file(
            "bootstrap layout",
            app_dir.join("layout.jsx"),
            bootstrap_layout.as_bytes(),
        )?;

        // This HTML is used e. g. by Vite
        let bootstrap_html = indoc! {r#"
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>Turbopack Test App</title>
                </head>
                <body>
                    <script type="module" src="/src/index.jsx"></script>
                </body>
            </html>
        "#};
        write_file(
            "bootstrap html in root",
            path.join("index.html"),
            bootstrap_html.as_bytes(),
        )?;

        // This HTML is used e. g. by webpack
        let bootstrap_html2 = indoc! {r#"
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>Turbopack Test App</title>
                </head>
                <body>
                    <script src="main.js"></script>
                </body>
            </html>
        "#};

        let public = path.join("public");
        create_dir_all(&public).context("creating public dir")?;

        write_file(
            "bootstrap html",
            public.join("index.html"),
            bootstrap_html2.as_bytes(),
        )?;

        write_file(
            "vite node.js server",
            path.join("vite-server.mjs"),
            include_bytes!("templates/vite-server.mjs"),
        )?;
        write_file(
            "vite server entry",
            path.join("src/vite-entry-server.jsx"),
            include_bytes!("templates/vite-entry-server.jsx"),
        )?;
        write_file(
            "vite client entry",
            path.join("src/vite-entry-client.jsx"),
            include_bytes!("templates/vite-entry-client.jsx"),
        )?;

        if let Some(package_json) = &self.package_json {
            // These dependencies are needed
            let package_json = json!({
                "name": "turbopack-test-app",
                "private": true,
                "version": "0.0.0",
                "dependencies": {
                    "react": package_json.react_version.clone(),
                    "react-dom": package_json.react_version.clone(),
                }
            });
            write_file(
                "package.json",
                path.join("package.json"),
                format!("{:#}", package_json).as_bytes(),
            )?;
        }

        Ok(TestApp { target, modules })
    }
}

/// Configuration struct to generate the `package.json` file of the test app.
#[derive(Debug)]
pub struct PackageJsonConfig {
    /// The version of React to use.
    pub react_version: String,
}

impl Default for PackageJsonConfig {
    fn default() -> Self {
        Self {
            react_version: "^18.2.0".to_string(),
        }
    }
}

#[derive(Debug)]
enum TestAppTarget {
    Set(PathBuf),
    Temp(TempDir),
}

impl TestAppTarget {
    /// Returns the path to the directory containing the app.
    fn path(&self) -> &Path {
        match &self {
            TestAppTarget::Set(target) => target.as_path(),
            TestAppTarget::Temp(target) => target.path(),
        }
    }
}

#[derive(Debug)]
pub struct TestApp {
    target: TestAppTarget,
    modules: Vec<(PathBuf, usize)>,
}

impl TestApp {
    /// Returns the path to the directory containing the app.
    pub fn path(&self) -> &Path {
        self.target.path()
    }

    /// Returns the list of modules and their depth in this app.
    pub fn modules(&self) -> &[(PathBuf, usize)] {
        &self.modules
    }
}
