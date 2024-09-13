use anyhow::{bail, Result};
use async_trait::async_trait;
use lightningcss::{
    stylesheet::{PrinterOptions, StyleSheet},
    targets::{Browsers, Targets},
};
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        preset_env::{Version, Versions},
        visit::FoldWith,
    },
};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Debug)]
pub struct StyledJsxTransformer {
    use_lightningcss: bool,
    target_browsers: Versions,
}

impl StyledJsxTransformer {
    pub fn new(use_lightningcss: bool, target_browsers: Versions) -> Self {
        Self {
            use_lightningcss,
            target_browsers,
        }
    }
}

#[async_trait]
impl CustomTransformer for StyledJsxTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "styled_jsx", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut styled_jsx::visitor::styled_jsx(
            ctx.source_map.clone(),
            // styled_jsx don't really use that in a relevant way
            FileName::Anon,
            styled_jsx::visitor::Config {
                use_lightningcss: self.use_lightningcss,
                browsers: self.target_browsers,
            },
            styled_jsx::visitor::NativeConfig {
                process_css: if self.use_lightningcss || self.target_browsers.is_any_target() {
                    None
                } else {
                    let targets = Targets {
                        browsers: Some(convert_browsers(&self.target_browsers)),
                        ..Default::default()
                    };

                    Some(Box::new(move |css| {
                        let ss = StyleSheet::parse(css, Default::default());

                        let ss = match ss {
                            Ok(v) => v,
                            Err(err) => {
                                bail!("failed to parse css using lightningcss: {}", err)
                            }
                        };

                        let output = ss.to_css(PrinterOptions {
                            minify: true,
                            source_map: None,
                            project_root: None,
                            targets,
                            analyze_dependencies: None,
                            pseudo_classes: None,
                        })?;
                        Ok(output.code)
                    }))
                },
            },
        ));

        Ok(())
    }
}

fn convert_browsers(browsers: &Versions) -> Browsers {
    fn convert(v: Option<Version>) -> Option<u32> {
        v.map(|v| v.major << 16 | v.minor << 8 | v.patch)
    }

    Browsers {
        android: convert(browsers.android),
        chrome: convert(browsers.chrome),
        edge: convert(browsers.edge),
        firefox: convert(browsers.firefox),
        ie: convert(browsers.ie),
        ios_saf: convert(browsers.ios),
        opera: convert(browsers.opera),
        safari: convert(browsers.safari),
        samsung: convert(browsers.samsung),
    }
}
