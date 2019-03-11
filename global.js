const chromedriver = require('chromedriver');
const config = require('./config');

const globals = {
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
