use std::{
    collections::{hash_map::Entry, BTreeMap, HashMap},
    fs::{self, File},
    io::BufReader,
    path::PathBuf,
};

use anyhow::{Context, Result};
use plotters::{
    backend::SVGBackend,
    data::fitting_range,
    prelude::{
        ChartBuilder, Circle, EmptyElement, IntoDrawingArea, PathElement, SeriesLabelPosition,
    },
    series::{LineSeries, PointSeries},
    style::RGBColor,
};

use crate::summarize_bench::data::{BaseBenchmarks, CStats};

type ByModuleCount = BTreeMap<u32, CStats>;
type ByBundler = BTreeMap<String, ByModuleCount>;
type ByBench = BTreeMap<String, ByBundler>;

const COLORS: &[RGBColor] = &[
    plotters::style::full_palette::BLUE,
    plotters::style::full_palette::CYAN,
    plotters::style::full_palette::RED,
    plotters::style::full_palette::GREEN,
    plotters::style::full_palette::INDIGO,
    plotters::style::full_palette::PURPLE,
    plotters::style::full_palette::PINK_900,
];

pub fn generate(summary_path: PathBuf) -> Result<()> {
    let summary_file = File::open(&summary_path)?;
    let reader = BufReader::new(summary_file);
    let summary: BaseBenchmarks = serde_json::from_reader(reader)?;

    let mut by_bench: ByBench = BTreeMap::new();
    for (_, bench) in summary.benchmarks {
        // TODO: Improve heuristic for detecting bundler benchmarks
        if !bench.info.group_id.starts_with("bench_") {
            continue;
        }

        let by_bundler = by_bench.entry(bench.info.group_id).or_default();

        let by_module_count = by_bundler
            .entry(bench.info.function_id.context("Missing function_id")?)
            .or_default();

        by_module_count.insert(
            bench
                .info
                .value_str
                .context("Missing value_str")?
                .split_ascii_whitespace()
                .collect::<Vec<&str>>()[0]
                .parse()?,
            bench.estimates.mean,
        );
    }

    let mut bundler_color = BundlerColor::new();
    let output_path = summary_path.parent().context("summary_path needs parent")?;
    generate_scaling(output_path.join("scaling"), &by_bench, &mut bundler_color)?;

    Ok(())
}

fn generate_scaling(
    output_path: PathBuf,
    by_bench: &ByBench,
    bundler_color: &mut BundlerColor,
) -> Result<()> {
    fs::create_dir_all(&output_path)?;

    for (bench_name, by_bundler) in by_bench {
        let module_count_range = fitting_range(
            by_bundler
                .values()
                .flat_map(|by_module_count| by_module_count.keys()),
        );

        let time_range_iter = by_bundler.values().flat_map(|by_module_count| {
            by_module_count
                .values()
                .map(|stats| ns_to_ms(stats.point_estimate))
        });

        // TODO: Avoid vector allocation -- not sure why this is necessary for
        // typechecker
        let time_range = fitting_range(time_range_iter.collect::<Vec<f64>>().iter());

        let file_name = output_path.join(format!("{}.svg", bench_name));
        let root = SVGBackend::new(&file_name, (960, 720)).into_drawing_area();
        let mut chart = ChartBuilder::on(&root)
            .caption(bench_name, ("sans-serif", 32))
            .x_label_area_size(40)
            .y_label_area_size(80)
            .margin(20)
            .build_cartesian_2d(module_count_range, time_range)?;

        for (bundler, by_module_count) in by_bundler {
            let color = bundler_color.get(bundler)?;
            let points = by_module_count
                .iter()
                .map(|(count, stats)| (count.to_owned(), ns_to_ms(stats.point_estimate)));

            chart
                .draw_series(LineSeries::new(points.clone(), color))?
                .label(bundler)
                .legend(move |(x, y)| PathElement::new(vec![(x, y), (x + 20, y)], color));

            chart.draw_series(PointSeries::of_element(
                points.clone(),
                2,
                color,
                &|coord, size, style| {
                    EmptyElement::at(coord) + Circle::new((0, 0), size, style.filled())
                },
            ))?;
        }

        chart
            .configure_mesh()
            .x_desc("Number of modules")
            .x_labels(10)
            .y_labels(10)
            .y_desc("Mean time (ms) -- lower is better")
            .draw()?;

        chart
            .configure_series_labels()
            .background_style(plotters::style::WHITE)
            .border_style(plotters::style::BLACK)
            .position(SeriesLabelPosition::UpperLeft)
            .margin(10)
            .draw()?;

        root.present()?;
    }

    Ok(())
}

// Avoid Duration to preserve fractional values. Additionally, plotters works
// directly with f64.
fn ns_to_ms(ns: f64) -> f64 {
    ns / 1.0e6
}

struct BundlerColor {
    bundler_to_color: HashMap<String, &'static RGBColor>,
    iter: Box<dyn Iterator<Item = &'static RGBColor>>,
}

impl BundlerColor {
    fn new() -> Self {
        Self {
            bundler_to_color: HashMap::new(),
            iter: Box::new(COLORS.iter()),
        }
    }

    fn get(&mut self, bundler_name: &str) -> Result<RGBColor> {
        let entry = self.bundler_to_color.entry(bundler_name.to_owned());
        Ok(match entry {
            Entry::Occupied(mut o) => **o.get_mut(),
            Entry::Vacant(v) => **v.insert(self.iter.next().context("Next color")?),
        })
    }
}
