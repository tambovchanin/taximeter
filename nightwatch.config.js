const chromedriver = require('chromedriver');

const config = {
  "src_folders": ["scripts"],
  "globals_path": "global.js",

  "selenium" : {
    "start_process" : false
  },

  "test_settings": {
    "default": {
      'selenium_host': 'localhost',
      'selenium_port': 9515,
      'default_path_prefix': '',
      'silent': true,
      'desiredCapabilities': {
        'browserName': 'chrome',
        'chromeOptions': {
          'args': [
            '--no-sandbox',
            '--headless'
          ]
        },
        'acceptSslCerts': true
      }
    }
  }
}

module.exports = config;
