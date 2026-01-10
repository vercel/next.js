use std::{
    borrow::Cow, env::current_dir, future::Future, net::SocketAddr, path::PathBuf, pin::Pin,
    sync::Arc,
};

use anyhow::{Context, Error, Result};
use futures::StreamExt;
use http_body_util::{BodyExt, Empty, Full, combinators::BoxBody};
use hyper::{
    Method, Response, StatusCode,
    body::{Bytes, Incoming},
    header::HeaderValue,
    server::conn::http1,
    service::Service,
};
use hyper_tungstenite::{HyperWebsocket, tungstenite::Message};
use hyper_util::rt::TokioIo;
use serde::Deserialize;
use tokio::net::TcpListener;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, OperationVc, ResolvedVc, TransientInstance, TryJoinIterExt, TurboTasks, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_backend::{
    BackendOptions, GitVersionInfo, StorageMode, TurboTasksBackend, noop_backing_storage,
    turbo_backing_storage,
};
use turbo_tasks_fs::{FileContent, rope::RopeBuilder};
use turbopack_browser::ecmascript::list::asset::EcmascriptDevChunkList;
use turbopack_cli_utils::issue::{ConsoleUi, LogOptions};
use turbopack_core::{
    asset::Asset,
    issue::{IssueReporter, IssueSeverity, handle_issues},
    output::{OutputAsset, OutputAssets},
};

use crate::{
    arguments::DevArguments,
    dev::{bundle::build_rn_internal, stream::OutputAssetsProvider, update_server::UpdateServer},
    util::{NormalizedDirs, normalize_dirs},
};

mod bundle;
mod stream;
mod update_server;

/// Start a devserver with the given args.
pub async fn start_server(args: &DevArguments) -> Result<()> {
    let turbo_tasks = if args.common.caching {
        let version_info = GitVersionInfo {
            describe: env!("VERGEN_GIT_DESCRIBE"),
            dirty: option_env!("CI").is_none_or(|value| value.is_empty())
                && env!("VERGEN_GIT_DIRTY") == "true",
        };

        let (storage, _) = turbo_backing_storage(
            &args
                .common
                .dir
                .clone()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".turbopack/cache"),
            &version_info,
            false,
            false,
            false,
        )?;

        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(StorageMode::ReadWrite),
                ..Default::default()
            },
            storage,
        ))
    } else {
        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                ..Default::default()
            },
            noop_backing_storage(),
        ))
    };

    let NormalizedDirs { root_dir, app_dir } = normalize_dirs(&args.common.root, &args.common.dir)?;
    let (root_dir_cell, app_dir_cell) = {
        let root_dir = root_dir.clone();
        let app_dir = app_dir.clone();
        turbo_tasks
            .run_once(async { Ok((ResolvedVc::cell(root_dir), ResolvedVc::cell(app_dir))) })
            .await?
    };

    // ----

    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));

    // We create a TcpListener and bind it to 127.0.0.1:3000
    let listener = TcpListener::bind(addr).await?;

    let svc = Svc {
        turbo_tasks,
        root_dir,
        root_dir_cell,
        app_dir_cell,
    };

    let http = http1::Builder::new();

    // We start a loop to continuously accept incoming connections
    loop {
        let (stream, _) = listener.accept().await?;

        let svc = svc.clone();

        let connection = http
            .serve_connection(TokioIo::new(stream), svc)
            .with_upgrades();

        // Spawn a tokio task to serve multiple connections concurrently
        tokio::task::spawn(async move {
            // Finally, we bind the incoming connection to our `hello` service
            if let Err(err) = connection.await {
                eprintln!("Error serving connection: {err:?}");
            }
        });
    }
}

#[derive(Clone)]
struct Svc {
    turbo_tasks: Arc<TurboTasks<TurboTasksBackend>>,
    root_dir_cell: ResolvedVc<RcStr>,
    root_dir: RcStr,
    app_dir_cell: ResolvedVc<RcStr>,
}

impl Service<hyper::Request<Incoming>> for Svc {
    type Response = Response<BoxBody<Bytes, anyhow::Error>>;
    type Error = anyhow::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn call(&self, req: hyper::Request<Incoming>) -> Self::Future {
        // TODO don't yet clone again
        let svc = (*self).clone();
        Box::pin(async move { svc.rn_dev_handler(req).await })
    }
}

impl Svc {
    async fn rn_dev_handler(
        &self,
        mut req: hyper::Request<hyper::body::Incoming>,
    ) -> Result<Response<BoxBody<Bytes, anyhow::Error>>> {
        eprintln!("Got request: {} {}", req.method(), req.uri());

        /*
        GET "/index.bundle?platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=org.reactjs.native.example.MyReactNativeApp"
        GET "/status" -> "packager-status: running"
        GET "/inspector" -> ws
        GET "/message" -> ws
        GET "/hot" -> ws
        POST "/logs" with
        [
          {
            "count": 0,
            "level": "info",
            "body": [
              "Running \"main\" with {...}"
            ],
            "includesStack": false,
            "groupDepth": 0
          }
        ]
        */
        match (req.method(), req.uri().path()) {
            (&Method::GET, "/status") => {
                let mut res = Response::new(BoxBody::new(
                    Full::new("packager-status:running".into()).map_err(|never| match never {}),
                ));
                res.headers_mut().append(
                    "X-React-Native-Project-Root",
                    HeaderValue::from_str(&self.root_dir).unwrap(),
                );
                res.headers_mut().append(
                    "X-Content-Type-Options",
                    HeaderValue::from_str("nosniff").unwrap(),
                );
                res.headers_mut().append(
                    "Surrogate-Control",
                    HeaderValue::from_str("no-store").unwrap(),
                );
                res.headers_mut().append(
                    "Cache-Control",
                    HeaderValue::from_str("no-store, no-cache, must-revalidate, proxy-revalidate")
                        .unwrap(),
                );
                res.headers_mut()
                    .append("Pragma", HeaderValue::from_str("no-cache").unwrap());
                res.headers_mut()
                    .append("Expires", HeaderValue::from_str("0").unwrap());
                return Ok(res);
            }
            (&Method::GET, "/message") => {
                // Check if the request is a websocket upgrade request.
                if hyper_tungstenite::is_upgrade_request(&req) {
                    let (response, websocket) = hyper_tungstenite::upgrade(&mut req, None).unwrap();

                    // Spawn a task to handle the websocket connection.
                    tokio::spawn(async move {
                        if let Err(e) = serve_debug_websocket(websocket, true).await {
                            eprintln!("Error in websocket connection: {e}");
                        }
                    });

                    return Ok(response.map(|b| BoxBody::new(b.map_err(|never| match never {}))));
                }
            }
            (&Method::GET, "/hot") => {
                // Check if the request is a websocket upgrade request.
                if hyper_tungstenite::is_upgrade_request(&req) {
                    let (response, websocket) = hyper_tungstenite::upgrade(&mut req, None).unwrap();

                    // Spawn a task to handle the websocket connection.
                    tokio::spawn(async move {
                        if let Err(e) = serve_debug_websocket(websocket, true).await {
                            eprintln!("Error in websocket connection: {e}");
                        }
                    });

                    return Ok(response.map(|b| BoxBody::new(b.map_err(|never| match never {}))));
                }
            }
            (&Method::GET, "/inspector/device") => {
                // query
                // Check if the request is a websocket upgrade request.
                if hyper_tungstenite::is_upgrade_request(&req) {
                    let (response, websocket) = hyper_tungstenite::upgrade(&mut req, None).unwrap();

                    // Spawn a task to handle the websocket connection.
                    tokio::spawn(async move {
                        if let Err(e) = serve_debug_websocket(websocket, true).await {
                            eprintln!("Error in websocket connection: {e}");
                        }
                    });

                    return Ok(response.map(|b| BoxBody::new(b.map_err(|never| match never {}))));
                }
            }
            (&Method::GET, "/inspector/network") => {
                // query
                // Check if the request is a websocket upgrade request.
                if hyper_tungstenite::is_upgrade_request(&req) {
                    let (response, websocket) = hyper_tungstenite::upgrade(&mut req, None).unwrap();

                    // Spawn a task to handle the websocket connection.
                    tokio::spawn(async move {
                        if let Err(e) = serve_debug_websocket(websocket, false).await {
                            eprintln!("Error in websocket connection: {e}");
                        }
                    });

                    return Ok(response.map(|b| BoxBody::new(b.map_err(|never| match never {}))));
                }
            }
            (&Method::GET, "/turbopack-hmr") => {
                // query
                // Check if the request is a websocket upgrade request.
                if hyper_tungstenite::is_upgrade_request(&req) {
                    #[derive(Deserialize)]
                    struct Query {
                        platform: Option<String>,
                        entry: Option<String>,
                    }
                    let query: Query =
                        serde_qs::from_str(req.uri().query().unwrap_or_default()).unwrap();

                    let (response, websocket) = hyper_tungstenite::upgrade(&mut req, None).unwrap();

                    let source_provider = ServerSourceProvider {
                        platform: query.platform.context("expected platform query param")?,
                        entry: query.entry.context("expected entry query param")?.into(),
                        root_dir: self.root_dir_cell,
                        app_dir: self.app_dir_cell,
                    };
                    let update_server = UpdateServer::new(source_provider);
                    update_server.run(&*self.turbo_tasks, websocket);

                    // tokio::spawn(async move {
                    //     if let Err(e) = serve_websocket(websocket).await {
                    //         eprintln!("Error in websocket connection: {e}");
                    //     }
                    // });

                    return Ok(response.map(|b| BoxBody::new(b.map_err(|never| match never {}))));
                }
            }
            (&Method::GET, path) if path.ends_with(".bundle") => {
                let entry_file = path.trim_start_matches('/').trim_end_matches(".bundle");
                let entry_file = if entry_file == "index" {
                    if std::fs::exists(PathBuf::from(&self.root_dir).join("index.ts"))? {
                        rcstr!("index.ts")
                    } else {
                        rcstr!("index.js")
                    }
                } else {
                    entry_file.into()
                };

                #[derive(Deserialize)]
                struct Query {
                    platform: Option<String>,
                    // dev: Option<bool>,
                    // lazy: Option<bool>,
                    // minify: Option<bool>,
                    // inline_source_map: Option<bool>,
                    // modules_only: Option<bool>,
                    // run_module: Option<bool>,
                    // exclude_source: Option<bool>,
                    // source_paths: Option<String>,
                    // app: Option<String>,
                }
                let query: Query =
                    serde_qs::from_str(req.uri().query().unwrap_or_default()).unwrap();

                // become [project]/
                let root_dir = self.root_dir.clone();
                let root_dir_cell = self.root_dir_cell;
                // where to resolve localhost:8081/foo/bar/index.bundle from
                let app_dir_cell = self.app_dir_cell;

                match self
                    .turbo_tasks
                    .run_once(async move {
                        let build_result_op = build_rn_internal(
                            query.platform.clone(),
                            entry_file,
                            root_dir_cell,
                            app_dir_cell,
                        );

                        let issue_reporter: Vc<Box<dyn IssueReporter>> =
                            Vc::upcast(ConsoleUi::new(TransientInstance::new(LogOptions {
                                project_dir: PathBuf::from(root_dir),
                                current_dir: current_dir().unwrap(),
                                show_all: true,
                                log_detail: false,
                                log_level: IssueSeverity::Warning,
                            })));

                        // Still serve bundle even with fatal issues
                        let _ = handle_issues(
                            build_result_op,
                            issue_reporter,
                            IssueSeverity::Error,
                            None,
                            None,
                        )
                        .await;

                        let chunks = build_result_op
                            .read_strongly_consistent()
                            .await?
                            .iter()
                            .map(async |c| {
                                Ok((
                                    c.path().await?.path.clone(),
                                    c.content().file_content().await?,
                                ))
                            })
                            .try_join()
                            .await?;

                        anyhow::Ok(chunks)
                    })
                    .await
                {
                    Ok(files) => {
                        let mut result = RopeBuilder::default();
                        for (path, content) in files {
                            match &*content {
                                FileContent::Content(file) => {
                                    result += "// ------------- ";
                                    result.push_bytes(path.as_str().as_bytes());
                                    result += "\n";
                                    result.concat(file.content());
                                    result += "\n\n";
                                }
                                _ => unreachable!("missing content"),
                            }
                        }
                        let body = result.build().into_bytes();

                        // let body = std::fs::read_to_string("index.bundle.js").unwrap();

                        //                         let body = "
                        //                         globalThis.__fbBatchedBridge = {
                        //   callFunctionReturnFlushedQueue: function () {
                        //     return null;
                        //   },
                        //   invokeCallbackAndReturnFlushedQueue: function () {
                        //     return null;
                        //   },
                        //   flushedQueue: function () {
                        //     return null;
                        //   },
                        // };";

                        let mut response = Response::new(full(body));
                        response.headers_mut().insert(
                            hyper::header::CONTENT_TYPE,
                            "application/javascript".parse().unwrap(),
                        );
                        return Ok(response);
                    }
                    Err(e) => {
                        eprintln!("Error handling /index.bundle request: {e:?}");
                        let mut not_found = Response::new(empty());
                        *not_found.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
                        return Ok(not_found);
                    }
                }
            }
            // - /assets/?unstable_path=.%2Fsrc%2Fassets%2Fimages/partial-react-logo.png?
            //   platform=ios&hash=0379fd4e2504cdac
            // - /assets/src/assets/images/icon.png
            (&Method::GET, path) if path.starts_with("/assets/") => {
                #[derive(Deserialize)]
                struct Query {
                    unstable_path: Option<String>,
                }
                let query: Query =
                    serde_qs::from_str(req.uri().query().unwrap_or_default()).unwrap();

                let file = if let Some(unstable_path) = &query.unstable_path {
                    let unstable_path = urlencoding::decode(unstable_path)?;
                    Cow::Owned(unstable_path.split("?").next().unwrap().to_string())
                } else {
                    Cow::Borrowed(path.strip_prefix("/assets/").unwrap())
                };

                println!("Serving asset file: {}", file);

                let file = &*file;
                let content = std::fs::read(PathBuf::from(&self.root_dir).join(file))?;
                let response = Response::new(full(content));
                return Ok(response);
            }
            // https://github.com/expo/expo/blob/main/packages/%40expo/cli/src/start/server/middleware/ExpoGoManifestHandlerMiddleware.ts
            // GET / HTTP/1.1
            // Host: 192.168.2.41:8081
            // EAS-Client-ID: A829E3DA-81D5-4218-AFED-6B2B31D203F1
            // User-Agent: Exponent/54.0.6 (arm64; iOS 18.6; Scale/3.00; en_DE)
            // Expo-Client-Release-Type: SIMULATOR
            // Exponent-Platform: ios
            // Expo-Updates-Environment: EXPO_DEVICE
            // Expo-JSON-Error: true
            // Expo-Runtime-Version: exposdk:54.0.0
            // Expo-Client-Environment: EXPO_DEVICE
            // Exponent-Accept-Signature: true
            // expo-expect-signature: sig, keyid="expo-root", alg="rsa-v1_5-sha256"
            // Expo-API-Version: 1
            // Expo-Platform: ios
            // Connection: keep-alive
            // Accept-Language: de-DE,de;q=0.9
            // Exponent-Version: 54.0.6
            // Exponent-SDK-Version: 54.0.0
            // Expo-Protocol-Version: 1
            // Accept: multipart/mixed,application/expo+json,application/json
            // Accept-Encoding: gzip, deflate
            //
            //
            // HTTP/1.1 200 OK
            // expo-protocol-version: 0
            // expo-sfv-version: 0
            // cache-control: private, max-age=0
            // content-type: multipart/mixed; boundary=formdata-2921c8735f7e3913
            // Date: Sun, 04 Jan 2026 11:37:15 GMT
            // Connection: keep-alive
            // Keep-Alive: timeout=5
            // Content-Length: 2112
            (&Method::GET, "/") => {
                let id = uuid::Uuid::from_u128(rand::random())
                    .as_hyphenated()
                    .to_string();
                let created_at = chrono::Utc::now().to_rfc3339();
                let manifest = serde_json::json!({
                    "id": id,
                    "createdAt": created_at,
                    "runtimeVersion": "exposdk:54.0.0",
                    "launchAsset": {
                        "key": "bundle",
                        "contentType": "application/javascript",
                        "url": "http://192.168.2.41:8081/index.tsx.bundle?platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable"
                    },
                    "assets": [],
                    "metadata": {},
                    "extra": {
                    "eas": {},
                    "expoClient": {
                        "name": "my-expo-app",
                        "slug": "my-expo-app",
                        "version": "1.0.0",
                        "orientation": "portrait",
                        "icon": "src/assets/images/icon.png",
                        "userInterfaceStyle": "automatic",
                        "newArchEnabled": true,
                        "scheme": "myexpoapp",
                        "ios": { "supportsTablet": true, "bundler": "webpack" },
                        "android": {
                        "adaptiveIcon": {
                            "foregroundImage": "src/assets/images/adaptive-icon.png",
                            "backgroundColor": "#ffffff",
                            "foregroundImageUrl": "http://192.168.2.41:8081/assets/src/assets/images/adaptive-icon.png"
                        }
                        },
                        "web": { "favicon": "src/assets/images/favicon.png" },
                        "plugins": [
                        "expo-asset",
                        [
                            "expo-splash-screen",
                            {
                            "backgroundColor": "#ffffff",
                            "image": "src/assets/images/splash-icon.png"
                            }
                        ]
                        ],
                        "_internal": {
                        "isDebug": false,
                        "projectRoot": "/Users/niklas/Downloads/my-expo-app",
                        "dynamicConfigPath": {},
                        "staticConfigPath": "/Users/niklas/Downloads/my-expo-app/app.json",
                        "packageJsonPath": "/Users/niklas/Downloads/my-expo-app/package.json",
                        "pluginHistory": {
                            "expo-asset": { "name": "expo-asset", "version": "12.0.12" },
                            "expo-splash-screen": {
                            "name": "expo-splash-screen",
                            "version": "31.0.13"
                            }
                        }
                        },
                        "sdkVersion": "54.0.0",
                        "platforms": ["ios", "android", "web"],
                        "androidStatusBar": { "backgroundColor": "#ffffff" },
                        "iconUrl": "http://192.168.2.41:8081/assets/src/assets/images/icon.png",
                        "hostUri": "192.168.2.41:8081"
                    },
                    "expoGo": {
                        "debuggerHost": "192.168.2.41:8081",
                        "developer": {
                        "tool": "expo-cli",
                        "projectRoot": "/Users/niklas/Downloads/my-expo-app"
                        },
                        "packagerOpts": { "dev": true },
                        "mainModuleName": "index.tsx"
                    },
                    "scopeKey": "@anonymous/my-expo-app-4409bb44-b617-41ec-83c1-85a811747b59"
                    }
                });

                let mut res = Response::new(BoxBody::new(
                    Full::new(serde_json::to_string_pretty(&manifest)?.into())
                        .map_err(|never| match never {}),
                ));
                res.headers_mut()
                    .append("expo-protocol-version", HeaderValue::from_str("0").unwrap());
                res.headers_mut()
                    .append("expo-sfv-version", HeaderValue::from_str("0").unwrap());
                res.headers_mut().append(
                    "Cache-Control",
                    HeaderValue::from_str("private, max-age=0").unwrap(),
                );
                return Ok(res);
            }
            _ => {}
        }
        // Return 404 Not Found for other routes.
        eprintln!(
            "Unknown request: {} {} {}",
            req.method(),
            req.uri().path(),
            req.uri().query().unwrap_or("")
        );
        let mut not_found = Response::new(empty());
        *not_found.status_mut() = StatusCode::NOT_FOUND;
        Ok(not_found)
    }
}

// We create some utility functions to make Empty and Full bodies
// fit our broadened Response body type.
fn empty() -> BoxBody<Bytes, anyhow::Error> {
    Empty::<Bytes>::new()
        .map_err(|never| match never {})
        .boxed()
}
fn full<T: Into<Bytes>>(chunk: T) -> BoxBody<Bytes, anyhow::Error> {
    Full::new(chunk.into())
        .map_err(|never| match never {})
        .boxed()
}

#[derive(Clone, TraceRawVcs, NonLocalValue)]
struct ServerSourceProvider {
    platform: String,
    entry: RcStr,
    root_dir: ResolvedVc<RcStr>,
    app_dir: ResolvedVc<RcStr>,
}
impl OutputAssetsProvider for ServerSourceProvider {
    fn get_output_assets(&self) -> OperationVc<OutputAssets> {
        get_rn_content_source(
            self.platform.clone(),
            self.entry.clone(),
            self.root_dir,
            self.app_dir,
        )
    }
}

#[turbo_tasks::function(operation, root)]
async fn get_rn_content_source(
    platform: String,
    entry: RcStr,
    root_dir: ResolvedVc<RcStr>,
    app_dir: ResolvedVc<RcStr>,
) -> Result<Vc<OutputAssets>> {
    let assets = build_rn_internal(Some(platform), entry, root_dir, app_dir)
        .read_strongly_consistent()
        .await?;
    Ok(Vc::cell(
        assets
            .iter()
            .copied()
            // TODO HACK This mimcs how EcmascriptDevChunkList chunks register themselves.
            .filter(|a| ResolvedVc::try_downcast_type::<EcmascriptDevChunkList>(*a).is_some())
            .collect(),
    ))
}

// #[turbo_tasks::value]
// struct SingleOutputAssetContentSource {
//     asset: ResolvedVc<Box<dyn OutputAsset>>,
// }

// #[turbo_tasks::value_impl]
// impl ContentSource for SingleOutputAssetContentSource {
//     #[turbo_tasks::function]
//     fn get_routes(&self) -> Vc<RouteTree> {
//         RouteTree::new_route(
//             vec![],
//             turbopack_dev_server::source::route_tree::RouteType::CatchAll,
//             Vc::upcast(ContentSourceContent::static_content(
//                 self.asset.versioned_content(),
//             )),
//         )
//     }
// }

// /// HTTP status code 404
// fn not_found() -> Response<BoxBody<Bytes, std::io::Error>> {
//     Response::builder()
//         .status(StatusCode::NOT_FOUND)
//         .body(
//             Full::new("Not found".into())
//                 .map_err(|e| match e {})
//                 .boxed(),
//         )
//         .unwrap()
// }

// use futures::StreamExt;

// async fn simple_file_send(
//     filenames: Vec<RcStr>,
// ) -> Result<Response<BoxBody<Bytes, std::io::Error>>> {
//     // Open file for reading
//     let mut files = vec![];

//     for f in filenames {
//         let file = tokio::fs::File::open(f).await;
//         if file.is_err() {
//             eprintln!("ERROR: Unable to open file.");
//             return Ok(not_found());
//         }
//         files.push(file.unwrap());
//     }

//     // let reader_stream = ReaderStream::new(files.get(0).unwrap());
//     // let stream_body = StreamBody::new(reader_stream.map_ok(Frame::data));

//     let streams = files
//         .into_iter()
//         .map(|file| ReaderStream::new(file).map_ok(Frame::data));

//     let combined_stream = stream::iter(streams);

//     // The combined_stream is a stream of streams, but StreamBody expects a single stream.
//     // We need to flatten the streams into one.
//     let flattened_stream = combined_stream.flatten();
//     let boxed_body = BoxBody::new(StreamBody::new(flattened_stream));

//     // Send response
//     let response = Response::builder()
//         .status(StatusCode::OK)
//         .body(boxed_body)
//         .unwrap();

//     Ok(response)
// }

/// Handle a websocket connection.
async fn serve_debug_websocket(websocket: HyperWebsocket, log_messages: bool) -> Result<(), Error> {
    let mut websocket = websocket.await?;
    while let Some(message) = websocket.next().await {
        if !log_messages {
            continue;
        }
        match message? {
            Message::Text(msg) => {
                println!("Received text message: {msg}");
                // websocket
                //     .send(Message::text("Thank you, come again."))
                //     .await?;
            }
            Message::Binary(msg) => {
                println!("Received binary message: {msg:02X?}");
                // websocket
                //     .send(Message::binary(b"Thank you, come again.".to_vec()))
                //     .await?;
            }
            Message::Ping(msg) => {
                // No need to send a reply: tungstenite takes care of this for you.
                println!("Received ping message: {msg:02X?}");
            }
            Message::Pong(msg) => {
                println!("Received pong message: {msg:02X?}");
            }
            Message::Close(msg) => {
                // No need to send a reply: tungstenite takes care of this for you.
                if let Some(msg) = &msg {
                    println!(
                        "Received close message with code {} and message: {}",
                        msg.code, msg.reason
                    );
                } else {
                    println!("Received close message");
                }
            }
            Message::Frame(_msg) => {
                unreachable!();
            }
        }
    }

    Ok(())
}
