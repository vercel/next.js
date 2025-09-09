use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::AssetContent, context::AssetContext, module::Module, reference_type::ReferenceType,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::utils::StringifyJs;

#[turbo_tasks::function]
pub fn wrap_edge_entry(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: FileSystemPath,
    entry: ResolvedVc<Box<dyn Module>>,
    pathname: RcStr,
) -> Result<Vc<Box<dyn Module>>> {
    // The wrapped module could be an async module, we handle that with the proxy
    // here. The comma expression makes sure we don't call the function with the
    // module as the "this" arg.
    // Turn exports into functions that are also a thenable. This way you can await the whole object
    // or  exports (e.g. for Components) or call them directly as though they are async functions
    // (e.g. edge functions/middleware, this is what the Edge Runtime does).
    // Catch promise to prevent UnhandledPromiseRejectionWarning, this will be propagated through
    // the awaited export(s) anyway.
    let source = formatdoc!(
        r#"
            self._ENTRIES ||= {{}};
            const modProm = import('MODULE');
            modProm.catch(() => {{}});
            self._ENTRIES[{}] = new Proxy(modProm, {{
                get(modProm, name) {{
                    if (name === "then") {{
                        return (res, rej) => modProm.then(res, rej);
                    }}
                    let result = (...args) => modProm.then((mod) => (0, mod[name])(...args));
                    result.then = (res, rej) => modProm.then((mod) => mod[name]).then(res, rej);
                    return result;
                }},
            }});
        "#,
        StringifyJs(&format_args!("middleware_{pathname}"))
    );
    let file = File::from(source);

    // TODO(alexkirsz) Figure out how to name this virtual asset.
    let virtual_source = VirtualSource::new(
        project_root.join("edge-wrapper.js")?,
        AssetContent::file(file.into()),
    );

    let inner_assets = fxindexmap! {
        rcstr!("MODULE") => entry
    };

    Ok(asset_context
        .process(
            Vc::upcast(virtual_source),
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module())
}
