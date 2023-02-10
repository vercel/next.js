module.exports = {
  src_folders: ["test/e2e/"],
  output_folder: "reports",
  page_objects_path: ["nightwatch/pages/"],
  custom_commands_path: ["nightwatch/custom-commands/"],
  custom_assertions_path: "",
  plugins: ["@nightwatch/react"],
  globals_path: "test/globals.js",

  test_settings: {
    default: {
      disable_error_log: false,
      launch_url: "http://localhost:3000",

      screenshots: {
        enabled: false,
        path: "screens",
        on_failure: true,
      },

      desiredCapabilities: {
        browserName: "chrome",
        "goog:chromeOptions": {
          w3c: true,
          args: [],
        },
      },

      webdriver: {
        start_process: true,
        log_path: false,
        server_path: "",
      },
    },

    safari: {
      desiredCapabilities: {
        browserName: "safari",
        alwaysMatch: {
          acceptInsecureCerts: false,
        },
      },
      webdriver: {
        start_process: true,
        server_path: "",
      },
    },

    firefox: {
      desiredCapabilities: {
        browserName: "firefox",
        alwaysMatch: {
          acceptInsecureCerts: true,
          "moz:firefoxOptions": {
            args: [],
          },
        },
      },
      webdriver: {
        start_process: true,
        server_path: "",
        cli_args: [],
      },
    },

    chrome: {},

    edge: {
      desiredCapabilities: {
        browserName: "MicrosoftEdge",
        "ms:edgeOptions": {
          w3c: true,
          args: [],
        },
      },

      webdriver: {
        start_process: true,
        // Download msedgedriver from https://docs.microsoft.com/en-us/microsoft-edge/webdriver-chromium/
        // and set the location below:
        server_path: "",
        cli_args: [],
      },
    },
  },
};
