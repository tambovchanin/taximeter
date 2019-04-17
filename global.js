const chromedriver = require('chromedriver');
const config = require('./config');

const globals = {
  retryAssertionTimeout: 10000,

  asyncHookTimeout: 60000,

  before: function(done) {
    chromedriver.start();

    done();
  },

  beforeEach: function(browser, done) {
    browser.resizeWindow(2304, 1728, done);
  },

  after: function(done) {
    chromedriver.stop();

    done();
  }
};

module.exports = { ...globals, ...config };
