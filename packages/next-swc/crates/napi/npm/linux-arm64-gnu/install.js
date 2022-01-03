const { glibcVersionRuntime } = process.report.getReport().header;
process.exit(glibcVersionRuntime ? 0 : 1);