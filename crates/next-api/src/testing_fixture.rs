//! Private registered fixtures are ordinary App Page compiler entries. Their
//! sources and loader trees are virtual; no user application file is rewritten.

use anyhow::{Context, Result, bail};
use next_core::{
    app_structure::{AppDirModules, AppPageLoaderTree, GlobalMetadata},
    get_next_package,
    next_app::AppPage,
};
use serde::Deserialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{asset::AssetContent, source::Source, virtual_source::VirtualSource};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{app::AppProject, route::Routes};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FixtureHost {
    route_prefix: String,
    fixtures: Vec<Fixture>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fixture {
    id: String,
    module: String,
    export_name: String,
}

fn safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

async fn source(path: FileSystemPath, content: String) -> Result<ResolvedVc<Box<dyn Source>>> {
    Ok(ResolvedVc::upcast(
        VirtualSource::new(
            path,
            AssetContent::file(FileContent::Content(File::from(content)).cell()),
        )
        .to_resolved()
        .await?,
    ))
}

#[turbo_tasks::function]
pub(crate) async fn fixture_routes(
    app: ResolvedVc<AppProject>,
    registration: RcStr,
) -> Result<Vc<Routes>> {
    let host: FixtureHost =
        serde_json::from_str(&registration).context("Invalid registered browser fixture host")?;
    let prefix = host
        .route_prefix
        .strip_prefix('/')
        .context("Fixture route prefix must be absolute")?;
    if !prefix.starts_with("__next_testing_") || !safe_segment(prefix) {
        bail!("Invalid private browser fixture route prefix");
    }
    let root = app.project().project_path().owned().await?;
    let layout_path = root.join(".next-test-fixture-layout.tsx")?;
    // Standalone fixtures do not inherit app layouts. This boundary permits
    // request-dependent async fixtures with the application's Cache Components settings.
    let layout = source(
        layout_path.clone(),
        "import { createElement, Suspense } from 'react';\nexport default function \
         Root({children}) { return createElement('html', null, createElement('body', null, \
         createElement(Suspense, {fallback: null}, children))); }\n"
            .to_string(),
    )
    .await?;
    let builtin = get_next_package(root.clone())
        .await?
        .join("dist/client/components/builtin")?;
    let global_metadata = GlobalMetadata::default().resolved_cell();
    let mut routes = FxIndexMap::default();
    for fixture in host.fixtures {
        if !safe_segment(&fixture.id)
            || fixture.module.is_empty()
            || fixture
                .module
                .split('/')
                .any(|part| part.is_empty() || part == "." || part == "..")
            || fixture.module.contains('\\')
            || fixture.module.contains(':')
            || fixture.export_name.is_empty()
            || !fixture
                .export_name
                .bytes()
                .enumerate()
                .all(|(index, byte)| {
                    byte.is_ascii_alphabetic()
                        || byte == b'_'
                        || byte == b'$'
                        || (index > 0 && byte.is_ascii_digit())
                })
        {
            bail!("Invalid registered browser fixture descriptor");
        }
        let pathname: RcStr = format!("{}/{}", host.route_prefix, fixture.id).into();
        if routes.contains_key(&pathname) {
            bail!("Duplicate registered browser fixture ID: {}", fixture.id);
        }
        let page = AppPage::parse(&format!("{pathname}/page"))?;
        let page_path = root.join(&format!(".next-test-fixture-{}.tsx", fixture.id))?;
        let page_source = source(
            page_path.clone(),
            format!(
                "import {{ createElement }} from 'react';\nimport * as Fixture from {};\nimport \
                 {{ renderRegisteredFixturePage }} from \
                 'next/dist/experimental/testing/rsc/registered-fixture';\nexport default \
                 function Page({{searchParams}}) {{ return \
                 renderRegisteredFixturePage(createElement, Fixture[{}], searchParams); }}\n",
                StringifyJs(&format!("./{}", fixture.module)),
                StringifyJs(&fixture.export_name),
            ),
        )
        .await?;
        let leaf = AppPageLoaderTree {
            page: page.clone(),
            segment: rcstr!("__PAGE__"),
            parallel_routes: FxIndexMap::default(),
            modules: AppDirModules {
                page: Some(page_path.clone()),
                sources: fxindexmap! { page_path => page_source },
                ..Default::default()
            },
            global_metadata,
            static_siblings: vec![],
        };
        let fixture_segment = AppPageLoaderTree {
            page: page.clone(),
            segment: fixture.id.into(),
            parallel_routes: fxindexmap! { rcstr!("children") => leaf },
            modules: AppDirModules::default(),
            global_metadata,
            static_siblings: vec![],
        };
        let prefix_segment = AppPageLoaderTree {
            page: page.clone(),
            segment: prefix.into(),
            parallel_routes: fxindexmap! { rcstr!("children") => fixture_segment },
            modules: AppDirModules::default(),
            global_metadata,
            static_siblings: vec![],
        };
        let tree = AppPageLoaderTree {
            page: page.clone(),
            segment: rcstr!(""),
            parallel_routes: fxindexmap! { rcstr!("children") => prefix_segment },
            modules: AppDirModules {
                layout: Some(layout_path.clone()),
                global_error: Some(builtin.join("global-error.js")?),
                not_found: Some(builtin.join("not-found.js")?),
                forbidden: Some(builtin.join("forbidden.js")?),
                unauthorized: Some(builtin.join("unauthorized.js")?),
                sources: fxindexmap! { layout_path.clone() => layout },
                ..Default::default()
            },
            global_metadata,
            static_siblings: vec![],
        }
        .resolved_cell();
        routes.insert(
            pathname,
            app.registered_fixture_route(page, *tree).owned().await?,
        );
    }
    Ok(Vc::cell(routes))
}
