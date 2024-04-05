use std::{
    cmp::max,
    time::{Duration, Instant},
};

use anyhow::Context;
use next_api::project::{ProjectContainer, ProjectOptions};
use turbo_tasks::TurboTasks;
use turbo_tasks_malloc::TurboMalloc;
use turbopack_binding::turbo::tasks_memory::MemoryBackend;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

/// Clones a repo down into a tmp folder and produces a ProjectOptions that can
/// build it.
fn init_bench(
    src: &str,
    install_command: &str,
    package_path: Option<&str>,
    next_config: String,
    js_config: String,
) -> (ProjectOptions, tempdir::TempDir) {
    let tmp = tempdir::TempDir::new("turbo-bench").unwrap();

    let clone = std::process::Command::new("git")
        .arg("clone")
        .arg("--depth")
        .arg("1")
        .arg(src)
        .arg(tmp.path())
        .status()
        .unwrap();

    std::process::Command::new("sh")
        .arg("-c")
        .current_dir(tmp.path())
        .arg(install_command)
        .status()
        .unwrap();

    let project_path = package_path
        .map(|pp| tmp.path().join(pp))
        .unwrap_or_else(|| tmp.path().to_owned());

    (
        ProjectOptions {
            project_path: project_path.to_str().unwrap().to_owned(),
            root_path: tmp.path().to_str().unwrap().to_owned(),
            env: vec![],
            define_env: next_api::project::DefineEnv {
                client: vec![],
                edge: vec![],
                nodejs: vec![],
            },
            watch: false,
            dev: false,
            next_config,
            js_config,
        },
        tmp,
    )
}

fn do_in_runtime() -> impl FnOnce(
    Pin<
        Box<
            dyn std::future::Future<Output = std::result::Result<(), anyhow::Error>>
                + 'static
                + Send
                + Sync,
        >,
    >,
) {
    next_build_test::register();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .build()
        .unwrap();
    let tt = TurboTasks::new(MemoryBackend::new(usize::MAX));

    move |fut| {
        rt.block_on(async {
            tt.run_once::<()>(fut).await;
        });
    }
}

fn get_container() -> (turbo_tasks::Vc<ProjectContainer>, tempdir::TempDir) {
    let (options, dir) = init_bench(
        "https://github.com/shadcn-ui/ui.git",
        "pnpm i",
        Some("apps/www"),
        "{\n  \"env\": {},\n  \"webpack\": {},\n  \"eslint\": {\n    \"ignoreDuringBuilds\": false\n  },\n  \"typescript\": {\n    \"ignoreBuildErrors\": false,\n    \"tsconfigPath\": \"tsconfig.json\"\n  },\n  \"distDir\": \".next\",\n  \"cleanDistDir\": true,\n  \"assetPrefix\": \"\",\n  \"cacheMaxMemorySize\": 52428800,\n  \"configOrigin\": \"next.config.mjs\",\n  \"useFileSystemPublicRoutes\": true,\n  \"generateBuildId\": null,\n  \"generateEtags\": true,\n  \"pageExtensions\": [\n    \"tsx\",\n    \"ts\",\n    \"jsx\",\n    \"js\"\n  ],\n  \"poweredByHeader\": true,\n  \"compress\": true,\n  \"analyticsId\": \"\",\n  \"images\": {\n    \"deviceSizes\": [\n      640,\n      750,\n      828,\n      1080,\n      1200,\n      1920,\n      2048,\n      3840\n    ],\n    \"imageSizes\": [\n      16,\n      32,\n      48,\n      64,\n      96,\n      128,\n      256,\n      384\n    ],\n    \"path\": \"/_next/image\",\n    \"loader\": \"default\",\n    \"loaderFile\": \"\",\n    \"domains\": [],\n    \"disableStaticImages\": false,\n    \"minimumCacheTTL\": 60,\n    \"formats\": [\n      \"image/webp\"\n    ],\n    \"dangerouslyAllowSVG\": false,\n    \"contentSecurityPolicy\": \"script-src 'none'; frame-src 'none'; sandbox;\",\n    \"contentDispositionType\": \"inline\",\n    \"remotePatterns\": [\n      {\n        \"protocol\": \"https\",\n        \"hostname\": \"avatars.githubusercontent.com\"\n      },\n      {\n        \"protocol\": \"https\",\n        \"hostname\": \"images.unsplash.com\"\n      }\n    ],\n    \"unoptimized\": false\n  },\n  \"devIndicators\": {\n    \"buildActivity\": true,\n    \"buildActivityPosition\": \"bottom-right\"\n  },\n  \"onDemandEntries\": {\n    \"maxInactiveAge\": 3600000,\n    \"pagesBufferLength\": 5\n  },\n  \"amp\": {\n    \"canonicalBase\": \"\"\n  },\n  \"basePath\": \"\",\n  \"sassOptions\": {},\n  \"trailingSlash\": false,\n  \"i18n\": null,\n  \"productionBrowserSourceMaps\": false,\n  \"optimizeFonts\": true,\n  \"excludeDefaultMomentLocales\": true,\n  \"serverRuntimeConfig\": {},\n  \"publicRuntimeConfig\": {},\n  \"reactProductionProfiling\": false,\n  \"reactStrictMode\": true,\n  \"httpAgentOptions\": {\n    \"keepAlive\": true\n  },\n  \"outputFileTracing\": true,\n  \"staticPageGenerationTimeout\": 60,\n  \"swcMinify\": true,\n  \"modularizeImports\": {\n    \"@mui/icons-material\": {\n      \"transform\": \"@mui/icons-material/{{member}}\"\n    },\n    \"lodash\": {\n      \"transform\": \"lodash/{{member}}\"\n    }\n  },\n  \"experimental\": {\n    \"prerenderEarlyExit\": false,\n    \"serverMinification\": true,\n    \"serverSourceMaps\": false,\n    \"linkNoTouchStart\": false,\n    \"caseSensitiveRoutes\": false,\n    \"clientRouterFilter\": true,\n    \"clientRouterFilterRedirects\": false,\n    \"fetchCacheKeyPrefix\": \"\",\n    \"middlewarePrefetch\": \"flexible\",\n    \"optimisticClientCache\": true,\n    \"manualClientBasePath\": false,\n    \"cpus\": 9,\n    \"memoryBasedWorkersCount\": false,\n    \"isrFlushToDisk\": true,\n    \"workerThreads\": false,\n    \"optimizeCss\": false,\n    \"nextScriptWorkers\": false,\n    \"scrollRestoration\": false,\n    \"externalDir\": false,\n    \"disableOptimizedLoading\": false,\n    \"gzipSize\": true,\n    \"craCompat\": false,\n    \"esmExternals\": true,\n    \"fullySpecified\": false,\n    \"outputFileTracingRoot\": \"/Users/arlyon/Programming/ui\",\n    \"swcTraceProfiling\": false,\n    \"forceSwcTransforms\": false,\n    \"largePageDataBytes\": 128000,\n    \"adjustFontFallbacks\": false,\n    \"adjustFontFallbacksWithSizeAdjust\": false,\n    \"typedRoutes\": false,\n    \"instrumentationHook\": false,\n    \"bundlePagesExternals\": false,\n    \"parallelServerCompiles\": false,\n    \"parallelServerBuildTraces\": false,\n    \"ppr\": false,\n    \"missingSuspenseWithCSRBailout\": true,\n    \"optimizeServerReact\": true,\n    \"useEarlyImport\": false,\n    \"staleTimes\": {\n      \"dynamic\": 30,\n      \"static\": 300\n    },\n    \"optimizePackageImports\": [\n      \"lucide-react\",\n      \"date-fns\",\n      \"lodash-es\",\n      \"ramda\",\n      \"antd\",\n      \"react-bootstrap\",\n      \"ahooks\",\n      \"@ant-design/icons\",\n      \"@headlessui/react\",\n      \"@headlessui-float/react\",\n      \"@heroicons/react/20/solid\",\n      \"@heroicons/react/24/solid\",\n      \"@heroicons/react/24/outline\",\n      \"@visx/visx\",\n      \"@tremor/react\",\n      \"rxjs\",\n      \"@mui/material\",\n      \"@mui/icons-material\",\n      \"recharts\",\n      \"react-use\",\n      \"@material-ui/core\",\n      \"@material-ui/icons\",\n      \"@tabler/icons-react\",\n      \"mui-core\",\n      \"react-icons/ai\",\n      \"react-icons/bi\",\n      \"react-icons/bs\",\n      \"react-icons/cg\",\n      \"react-icons/ci\",\n      \"react-icons/di\",\n      \"react-icons/fa\",\n      \"react-icons/fa6\",\n      \"react-icons/fc\",\n      \"react-icons/fi\",\n      \"react-icons/gi\",\n      \"react-icons/go\",\n      \"react-icons/gr\",\n      \"react-icons/hi\",\n      \"react-icons/hi2\",\n      \"react-icons/im\",\n      \"react-icons/io\",\n      \"react-icons/io5\",\n      \"react-icons/lia\",\n      \"react-icons/lib\",\n      \"react-icons/lu\",\n      \"react-icons/md\",\n      \"react-icons/pi\",\n      \"react-icons/ri\",\n      \"react-icons/rx\",\n      \"react-icons/si\",\n      \"react-icons/sl\",\n      \"react-icons/tb\",\n      \"react-icons/tfi\",\n      \"react-icons/ti\",\n      \"react-icons/vsc\",\n      \"react-icons/wi\"\n    ]\n  },\n  \"configFile\": \"/Users/arlyon/Programming/ui/apps/www/next.config.mjs\",\n  \"configFileName\": \"next.config.mjs\",\n  \"_originalRedirects\": [\n    {\n      \"source\": \"/components\",\n      \"destination\": \"/docs/components/accordion\",\n      \"permanent\": true\n    },\n    {\n      \"source\": \"/docs/components\",\n      \"destination\": \"/docs/components/accordion\",\n      \"permanent\": true\n    },\n    {\n      \"source\": \"/examples\",\n      \"destination\": \"/examples/mail\",\n      \"permanent\": false\n    },\n    {\n      \"source\": \"/docs/primitives/:path*\",\n      \"destination\": \"/docs/components/:path*\",\n      \"permanent\": true\n    },\n    {\n      \"source\": \"/figma\",\n      \"destination\": \"/docs/figma\",\n      \"permanent\": true\n    },\n    {\n      \"source\": \"/docs/forms\",\n      \"destination\": \"/docs/components/form\",\n      \"permanent\": false\n    },\n    {\n      \"source\": \"/docs/forms/react-hook-form\",\n      \"destination\": \"/docs/components/form\",\n      \"permanent\": false\n    }\n  ],\n  \"exportPathMap\": {}\n}"
.to_owned(),
        "{\"compilerOptions\":{\"composite\":false,\"declaration\":true,\"declarationMap\":true,\"esModuleInterop\":true,\"forceConsistentCasingInFileNames\":true,\"inlineSources\":false,\"isolatedModules\":true,\"moduleResolution\":2,\"noUnusedLocals\":false,\"noUnusedParameters\":false,\"preserveWatchOutput\":true,\"skipLibCheck\":true,\"strict\":true,\"target\":1,\"lib\":[\"lib.dom.d.ts\",\"lib.dom.iterable.d.ts\",\"lib.esnext.d.ts\"],\"allowJs\":true,\"noEmit\":true,\"incremental\":true,\"module\":99,\"resolveJsonModule\":true,\"jsx\":1,\"baseUrl\":\"/Users/arlyon/Programming/ui/apps/www\",\"paths\":{\"@/*\":[\"./*\"],\"contentlayer/generated\":[\"./.contentlayer/generated\"]},\"plugins\":[{\"name\":\"next\"}],\"pathsBasePath\":\"/Users/arlyon/Programming/ui/apps/www\"}}"
.to_owned(),
    );

    (ProjectContainer::new(options), dir)
}

use std::{future::Future, pin::Pin};

#[iai_callgrind::library_benchmark]
#[bench::collect(0, do_in_runtime())]
#[bench::build_1(1, do_in_runtime())]
#[bench::build_10(10, do_in_runtime())]
pub fn build_pages(
    pages: usize,
    rt: impl FnOnce(Pin<Box<dyn Future<Output = Result<(), anyhow::Error>> + Send + Sync>>),
) {
    // decide the pages to benchmark ahead of time
    const SELECTED_PAGES: [&str; 10] = [
        "/legal/event-code-of-conduct",
        "/docs/functions/og-image-generation/og-image-api",
        "/docs/image-optimization/managing-image-optimization-costs",
        "/new/import/card",
        "/try/share/[slug]",
        "/app-future/[lang]/[teamSlug]/~/account/invoices-new",
        "/docs/workflow-collaboration/conformance/rules/
NEXTJS_MISSING_REACT_STRICT_MODE",
        "/app-future/[lang]/[teamSlug]/~/
ai/models/[modelName]/getting-started",
        "/app-future/[lang]/
[teamSlug]/~/usage/[plan]/[planIteration]",
        "/docs/
workflow-collaboration/conformance/rules/REQUIRE_CARET_DEPENDENCIES",
    ];

    rt(Box::pin(async move {
        let (container, _dir) = get_container();

        let entrypoints = container.entrypoints().await.unwrap();

        let routes = entrypoints.routes.clone().into_iter().take(pages);
        // .filter(|route| SELECTED_PAGES.contains(&route.0.as_str()));

        let count =
            next_build_test::render_routes(routes, next_build_test::Strategy::Concurrent, 10, 10)
                .await;

        assert_eq!(count, SELECTED_PAGES.len());

        Ok(())
    }))
}

iai_callgrind::library_benchmark_group!(
    name = group;
    benchmarks = build_pages
);

iai_callgrind::main!(library_benchmark_groups = group);
