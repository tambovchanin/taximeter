const config = {
  'src_folders': ['scripts'],
  'globals_path': 'global.js',

  'selenium': {
    'start_process': false
  },

  'test_settings': {
    'default': {
      'selenium_host': 'localhost',
      'selenium_port': 9515,
      'default_path_prefix': '',
      'silent': true,
      'screenshots': {
        'enabled': true,
        'path': 'errors/',
        'on_failure': true,
        'on_error': true
      },
      'request_timeout_options': {
        'timeout': 100000
      },
      'desiredCapabilities': {
        'browserName': 'chrome',
        'chromeOptions': {
          'prefs': {
            'intl.accept_languages': 'ru-RU,ru'
          },
          'args': [
            '--no-sandbox',
            '--headless',
            '--disable-dev-shm-usage',
            '--lang=ru'
          ]
        },
        'acceptSslCerts': true
      }
    }
  }
};

module.exports = config;
