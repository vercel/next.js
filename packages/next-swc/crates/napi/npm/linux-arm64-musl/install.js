const { glibcVersionRuntime } = process.report.getReport().header;
process.exit(glibcVersionRuntime ? 1 : 0);