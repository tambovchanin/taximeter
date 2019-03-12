const chromedriver = require('chromedriver');
const config = require('./config');

const globals = {

  abortOnAssertionFailure: false,

  retryAssertionTimeout: 10000,

  asyncHookTimeout: 60000,

  before: function(done) {
    chromedriver.start();

    done();
  },

  after: function(done) {
    chromedriver.stop();

    done();
  }
};

module.exports = { ...globals, ...config };
