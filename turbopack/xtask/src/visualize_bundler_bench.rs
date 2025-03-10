use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::BufReader,
    path::PathBuf,
    str::FromStr,
};

use anyhow::{Context, Result};
use num_format::{Locale, ToFormattedString};
use plotters::{
    backend::SVGBackend,
    data::fitting_range,
    prelude::{BindKeyPoints, ChartBuilder, IntoDrawingArea, PathElement, SeriesLabelPosition},
    series::LineSeries,
    style::{Color, RGBAColor, RGBColor},
};
use rustc_hash::FxHashSet;

use crate::summarize_bench::data::{BaseBenchmarks, CStats};

type ByModuleCount = BTreeMap<u32, CStats>;
type ByBundler = BTreeMap<Bundler, ByModuleCount>;
type ByBench = BTreeMap<String, ByBundler>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum Bundler {
    NextJs11Ssr,
    NextJs12Ssr,
    ViteCsr,
    ViteSsr,
    ViteSwcCsr,
    NextJs13Ssr,
    NextJs13Rsc,
    NextJs13Rcc,
    TurbopackCsr,
    TurbopackSsr,
    TurbopackRsc,
    TurbopackRcc,
    Webpack,
    Parcel,
}

impl std::fmt::Display for Bundler {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for Bundler {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Next.js 11 SSR" => Ok(Self::NextJs11Ssr),
            "Next.js 12 SSR" => Ok(Self::NextJs12Ssr),
            "Next.js 13 SSR" => Ok(Self::NextJs13Ssr),
            "Next.js 13 RSC" => Ok(Self::NextJs13Rsc),
            "Next.js 13 RCC" => Ok(Self::NextJs13Rcc),
            "Turbopack CSR" => Ok(Self::TurbopackCsr),
            "Turbopack SSR" => Ok(Self::TurbopackSsr),
            "Turbopack RSC" => Ok(Self::TurbopackRsc),
            "Turbopack RCC" => Ok(Self::TurbopackRcc),
            "Vite CSR" => Ok(Self::ViteCsr),
            "Vite SSR" => Ok(Self::ViteSsr),
            "Vite SWC CSR" => Ok(Self::ViteSwcCsr),
            "Webpack" => Ok(Self::Webpack),
            "Parcel" => Ok(Self::Parcel),
            _ => Err(()),
        }
    }
}

impl Bundler {
    fn as_str(&self) -> &'static str {
        match self {
            Self::NextJs11Ssr => "Next.js 11 SSR",
            Self::NextJs12Ssr => "Next.js 12 SSR",
            Self::NextJs13Ssr => "Next.js 13 SSR",
            Self::NextJs13Rsc => "Next.js 13 RSC",
            Self::NextJs13Rcc => "Next.js 13 RCC",
            Self::TurbopackCsr => "Turbopack CSR",
            Self::TurbopackSsr => "Turbopack SSR",
            Self::TurbopackRsc => "Turbopack RSC",
            Self::TurbopackRcc => "Turbopack RCC",
            Self::ViteCsr => "Vite CSR",
            Self::ViteSsr => "Vite SSR",
            Self::ViteSwcCsr => "Vite SWC CSR",
            Self::Webpack => "Webpack",
            Self::Parcel => "Parcel",
        }
    }

    fn color(&self) -> RGBColor {
        match self {
            // These are the currently used ones.
            Self::NextJs12Ssr => plotters::style::full_palette::CYAN,
            Self::NextJs11Ssr => plotters::style::full_palette::BLUE,

            Self::TurbopackSsr => plotters::style::full_palette::RED,
            Self::ViteSwcCsr => plotters::style::full_palette::GREEN,

            // TODO(alexkirsz) These should probably change to be consistent with the above.
            Self::NextJs13Ssr => plotters::style::full_palette::PURPLE,
            Self::NextJs13Rsc => plotters::style::full_palette::PURPLE_300,
            Self::NextJs13Rcc => plotters::style::full_palette::PURPLE_700,

            Self::TurbopackCsr => plotters::style::full_palette::RED_200,
            Self::TurbopackRsc => plotters::style::full_palette::RED_300,
            Self::TurbopackRcc => plotters::style::full_palette::RED_700,

            Self::ViteCsr => plotters::style::full_palette::GREEN_200,
            Self::ViteSsr => plotters::style::full_palette::GREEN_300,

            Self::Webpack => plotters::style::full_palette::YELLOW,
            Self::Parcel => plotters::style::full_palette::BROWN,
        }
    }
}

pub fn generate(summary_path: PathBuf, filter_bundlers: Option<FxHashSet<&str>>) -> Result<()> {
    let summary_file = File::open(&summary_path)?;
    let reader = BufReader::new(summary_file);
    let summary: BaseBenchmarks = serde_json::from_reader(reader)?;

    let mut by_bench: ByBench = BTreeMap::new();
    for (_, bench) in summary.benchmarks {
        // TODO: Improve heuristic for detecting bundler benchmarks
        if !bench.info.group_id.starts_with("bench_") {
            continue;
        }

        let Some(function_id) = bench.info.function_id else {
            continue;
        };

        let Ok(bundler) = Bundler::from_str(&function_id) else {
            eprintln!("Skipping benchmark with unknown bundler: {}", function_id);
            continue;
        };

        if filter_bundlers
            .as_ref()
            .map(|bundlers| !bundlers.contains(bundler.as_str()))
            .unwrap_or(false)
        {
            continue;
        }

        let by_bundler = by_bench.entry(bench.info.group_id).or_default();

        let by_module_count = by_bundler.entry(bundler).or_default();

        by_module_count.insert(
            bench
                .info
                .value_str
                .context("Missing value_str")?
                .split_ascii_whitespace()
                .collect::<Vec<&str>>()[0]
                .parse()?,
            // we want to use slope instead of mean when available since this is a better
            // estimation of the real performance values when iterations go to infinity
            bench.estimates.slope.unwrap_or(bench.estimates.mean),
        );
    }

    let output_path = summary_path.parent().context("summary_path needs parent")?;
    generate_scaling(output_path.join("scaling"), &by_bench)?;

    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum FormatTimeStyle {
    Milliseconds,
    Seconds,
}

impl FormatTimeStyle {
    fn format(self, ns: f64) -> String {
        let value = (match self {
            FormatTimeStyle::Milliseconds => ns / 1e6,
            FormatTimeStyle::Seconds => ns / 1e9,
        }
        .round() as u64)
            .to_formatted_string(&Locale::en);

        format!("{}{}", value, self.unit())
    }

    fn unit(self) -> &'static str {
        match self {
            FormatTimeStyle::Milliseconds => "ms",
            FormatTimeStyle::Seconds => "s",
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum Theme {
    Light,
    Dark,
}

impl Theme {
    fn name(self) -> &'static str {
        match self {
            Theme::Light => "light",
            Theme::Dark => "dark",
        }
    }

    fn legend_background_color(self) -> RGBAColor {
        match self {
            Theme::Light => plotters::style::colors::WHITE.into(),
            Theme::Dark => RGBColor(34, 34, 34).into(),
        }
    }

    fn light_line_color(self) -> RGBAColor {
        match self {
            Theme::Light => plotters::style::colors::BLACK.mix(0.1),
            Theme::Dark => plotters::style::colors::WHITE.mix(0.1),
        }
    }

    fn bold_line_color(self) -> RGBAColor {
        match self {
            Theme::Light => plotters::style::colors::BLACK.mix(0.2),
            Theme::Dark => plotters::style::colors::WHITE.mix(0.2),
        }
    }

    fn axis_line_color(self) -> RGBAColor {
        match self {
            Theme::Light => plotters::style::colors::BLACK.into(),
            Theme::Dark => plotters::style::colors::WHITE.into(),
        }
    }

    fn label_color(self) -> RGBAColor {
        match self {
            Theme::Light => plotters::style::colors::BLACK.mix(0.75),
            Theme::Dark => plotters::style::colors::WHITE.mix(0.75),
        }
    }

    fn axis_desc_color(self) -> RGBAColor {
        match self {
            Theme::Light => plotters::style::colors::BLACK.into(),
            Theme::Dark => plotters::style::colors::WHITE.into(),
        }
    }
}

const THEMES: [Theme; 2] = [Theme::Light, Theme::Dark];

fn generate_scaling(output_path: PathBuf, by_bench: &ByBench) -> Result<()> {
    fs::create_dir_all(&output_path)?;

    for theme in THEMES {
        for (bench_name, by_bundler) in by_bench {
            let module_counts: FxHashSet<_> = by_bundler
                .values()
                .flat_map(|by_module_count| by_module_count.keys())
                .copied()
                .collect();
            let module_count_range = fitting_range(module_counts.iter());

            // Ensure we have labels for every sampled module count.
            let module_count_range =
                module_count_range.with_key_points(module_counts.into_iter().collect());

            let time_range_iter = by_bundler.values().flat_map(|by_module_count| {
                by_module_count.values().map(|stats| stats.point_estimate)
            });

            // Make the time range end 5% higher than the maximum time value so the highest
            // point is not cut off.
            let time_range_end = time_range_iter
                // f64 does not implement Ord.
                .fold(0.0, |max, time| if time > max { time } else { max })
                * 1.05;
            // Ensure the time range starts at 0 instead of the minimum time value.
            let time_range = 0.0..time_range_end;

            let format_time_style = if time_range.end > 10e8 {
                FormatTimeStyle::Seconds
            } else {
                FormatTimeStyle::Milliseconds
            };

            let file_name = output_path.join(format!("{}_{}.svg", bench_name, theme.name()));
            let root = SVGBackend::new(&file_name, (960, 720)).into_drawing_area();
            let mut chart = ChartBuilder::on(&root)
                .x_label_area_size(60)
                // The y labels are horizontal and have units, so they take some room.
                .y_label_area_size(80)
                .margin(30)
                .build_cartesian_2d(module_count_range, time_range)?;

            for (bundler, by_module_count) in by_bundler.iter() {
                let color = bundler.color();
                let points = by_module_count
                    .iter()
                    .map(|(count, stats)| (count.to_owned(), stats.point_estimate));

                chart
                    .draw_series(LineSeries::new(points.clone(), color.stroke_width(4)))?
                    .label(bundler.as_str())
                    .legend(move |(x, y)| {
                        PathElement::new(vec![(x, y), (x + 20, y)], color.stroke_width(4))
                    });
            }

            // This is the font used by the turbo.build website.
            let font = r#"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji""#;

            chart
                .configure_mesh()
                .x_labels(10)
                .y_labels(10)
                .x_desc("Number of modules")
                .y_desc("Mean time — lower is better")
                .x_label_style((font, 20, &theme.label_color()))
                .y_label_style((font, 20, &theme.label_color()))
                .axis_desc_style((font, 24, &theme.axis_desc_color()))
                .x_label_formatter(&|v| v.to_formatted_string(&Locale::en))
                .y_label_formatter(&|v| format_time_style.format(*v))
                .bold_line_style(theme.bold_line_color())
                .light_line_style(theme.light_line_color())
                .axis_style(theme.axis_line_color())
                .draw()?;

            chart
                .configure_series_labels()
                .background_style(theme.legend_background_color())
                .border_style(theme.bold_line_color())
                .label_font((font, 20, &theme.axis_desc_color()))
                .position(SeriesLabelPosition::UpperLeft)
                .margin(16)
                .draw()?;

            root.present()?;
        }
    }

    Ok(())
}
