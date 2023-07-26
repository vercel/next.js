use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use indoc::writedoc;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::{
        tasks::Value,
        tasks_fs::{rope::RopeBuilder, File},
    },
    turbopack::{
        core::{
            asset::AssetContent,
            context::AssetContext,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs},
    },
};

#[turbo_tasks::function]
pub async fn create_page_ssr_entry_module(
    pathname: Vc<String>,
    reference_type: Value<ReferenceType>,
    ssr_module_context: Vc<Box<dyn AssetContext>>,
    source: Vc<Box<dyn Source>>,
    next_original_name: Vc<String>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let definition_page = format!("/{}", next_original_name.await?);
    let definition_pathname = pathname.await?;

    let ssr_module = ssr_module_context.process(source, reference_type.clone());

    let mut result = RopeBuilder::default();

    let entry_suffix = match reference_type.into_value() {
        ReferenceType::Entry(EntryReferenceSubType::Page) => {
            // Sourced from https://github.com/vercel/next.js/blob/2848ce51d1552633119c89ab49ff7fe2e4e91c91/packages/next/src/build/webpack/loaders/next-route-loader/index.ts
            writedoc!(
                result,
                r#"
                import RouteModule from "next/dist/server/future/route-modules/pages/module"
                import {{ hoist }} from "next/dist/build/webpack/loaders/next-route-loader/helpers"

                import Document from "@vercel/turbopack-next/pages/_document"
                import App from "@vercel/turbopack-next/pages/_app"

                import * as userland from "INNER"

                export default hoist(userland, "default")

                export const getStaticProps = hoist(userland, "getStaticProps")
                export const getStaticPaths = hoist(userland, "getStaticPaths")
                export const getServerSideProps = hoist(userland, "getServerSideProps")
                export const config = hoist(userland, "config")
                export const reportWebVitals = hoist(userland, "reportWebVitals")

                export const unstable_getStaticProps = hoist(userland, "unstable_getStaticProps")
                export const unstable_getStaticPaths = hoist(userland, "unstable_getStaticPaths")
                export const unstable_getStaticParams = hoist(userland, "unstable_getStaticParams")
                export const unstable_getServerProps = hoist(userland, "unstable_getServerProps")
                export const unstable_getServerSideProps = hoist(userland, "unstable_getServerSideProps")
                
                export const routeModule = new RouteModule({{
                    definition: {{
                        kind: "PAGES",
                        page: {definition_page},
                        pathname: {definition_pathname},
                        // The following aren't used in production, but are
                        // required for the RouteModule constructor.
                        bundlePath: "",
                        filename: "",
                    }},
                    components: {{
                        App,
                        Document,
                    }},
                    userland,
                }})
            "#,
                definition_page = StringifyJs(&definition_page),
                definition_pathname = StringifyJs(&definition_pathname),
            )?;

            // When we're building the instrumentation page (only when the
            // instrumentation file conflicts with a page also labeled
            // /instrumentation) hoist the `register` method.
            if definition_page == "/instrumentation" || definition_page == "/src/instrumentation" {
                writeln!(
                    result,
                    r#"export const register = hoist(userland, "register")"#
                )?;
            }

            "pages-entry.tsx".to_string()
        }
        ReferenceType::Entry(EntryReferenceSubType::PagesApi) => {
            // Sourced from https://github.com/vercel/next.js/blob/2848ce51d1552633119c89ab49ff7fe2e4e91c91/packages/next/src/build/webpack/loaders/next-route-loader/index.ts
            writedoc!(
                result,
                r#"
                import RouteModule from "next/dist/server/future/route-modules/pages-api/module"
                import {{ hoist }} from "next/dist/build/webpack/loaders/next-route-loader/helpers"

                import * as userland from "INNER"

                export default hoist(userland, "default")
                export const config = hoist(userland, "config")
                
                export const routeModule = new RouteModule({{
                    definition: {{
                        kind: "PAGES_API",
                        page: {definition_page},
                        pathname: {definition_pathname},
                        // The following aren't used in production, but are
                        // required for the RouteModule constructor.
                        bundlePath: "",
                        filename: "",
                    }},
                    userland,
                }})
            "#,
                definition_page = StringifyJs(&definition_page),
                definition_pathname = StringifyJs(&definition_pathname),
            )?;

            "pages-api-entry.tsx".to_string()
        }
        reference_type => bail!("unexpected reference type: {:?}", reference_type),
    };

    let file = File::from(result.build());

    let source = VirtualSource::new(
        source.ident().path().join(entry_suffix),
        AssetContent::file(file.into()),
    );
    let ssr_module = ssr_module_context.process(
        Vc::upcast(source),
        Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
            "INNER".to_string() => ssr_module,
        }))),
    );

    let Some(ssr_module) =
        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(ssr_module).await?
    else {
        bail!("expected an ECMAScript chunk placeable module");
    };

    Ok(ssr_module)
}
