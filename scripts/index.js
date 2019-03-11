const cheerio = require('cheerio');
const request = require('request');
const { bases, token, day, night } = require('../config');
const {
  getUploadPeriod,
  parseTransfersTable,
  parseVehiclesTable,
  parseDriversTable
} = require('../lib');

const period = getUploadPeriod({ day, night });

console.log('* period', period);

// Время ожидания загрузки страницы
const TIMEOUT = 10000;

// Случайный офсет для имитация перемещения мыши к элементу (не больше десяти)
const offset = () => Math.ceil(Math.random()*10);

// Случайная задержка перед/после действия (от 0.5с до 2с)
const delay = () => Math.ceil(Math.random()*1500)+500;

const sctipt = {
  'Yandex login' : yaLogin
};

bases.forEach((base, idx) => {
  sctipt[`Processing ${base}`] = processCity(idx+1, base);
});

sctipt['Close session'] = closeSession;

module.exports = sctipt;

function yaLogin(browser) {
  browser
    .url('https://passport.yandex.ru', pageComplete())
    .pause(delay(), safeMove('input[name="login"'))
    .setValue('input[name="login"]', [browser.globals.login])
    .pause(delay())
    .keys(browser.Keys.ENTER, safeMove('input[name="passwd"'))
    .pause(delay())
    .setValue('input[name="passwd"]', [browser.globals.password])
    .pause(delay())
    .keys(browser.Keys.ENTER, pageComplete())
    .waitForElementVisible('body', TIMEOUT)
    .pause(delay());
}

function processCity(idx, base) {
  return function(browser) {
    browser
      .url('https://lk.taximeter.yandex.ru/login', pageComplete())
      .pause(delay(), safeMove(`button[type="submit"]:nth-child(${idx})`))
      .pause(delay(), safeClick(`button[type="submit"]:nth-child(${idx})`))
      .pause(delay(), processTransfers(browser, base))
      .pause(delay(), processVehicles(browser, base))
      .pause(delay(), processDrivers(browser, base))
      // .pause(delay(), processDispatcher(browser, base))
      .pause(delay(), quitDB(browser))
  }
}

function closeSession(browser) {
  browser.end()
}

function pageComplete(callback) {
  return function() {
    this.execute('return document.readyState;', result => {
      if (result.value === 'complete') {
        return this.waitForElementVisible('body', TIMEOUT, callback);
      } else {
        this.pause(500, pageComplete);
      }
    });
  }
}

function safeMove(selector) {
  return function() {
    this
      .waitForElementVisible(selector, TIMEOUT)
      .pause(delay())
      .moveToElement(selector, offset(), offset());

    return this;
  }
}

function safeClick(selector) {
  return function() {
    safeMove(selector).call(this)
      .pause(delay())
      .click(selector);

    return this;
  }
}

function processTransfers(browser, base) {
  return function() {
    browser
      .pause(delay(), safeClick('a.nav-icon-print'))
      .pause(delay(), safeClick('a.nav-icon-print[href="/report/driver/types"]'))
      .pause(delay(), safeClick('input#change-datetime'))
      .waitForElementVisible('input#filter-datetime-start', TIMEOUT)
      .clearValue('input#filter-datetime-start')
      .pause(delay())
      .setValue('input#filter-datetime-start', `${period.from}`)
      .pause(delay())
      .clearValue('input#filter-datetime-end')
      .pause(delay())
      .setValue('input#filter-datetime-end', `${period.to}`)

      // Выгрузка таблицы "Наличные"
      .pause(delay(), downloadAndTransfer('select#payment option[value="0"]', base, 'Наличные'))

      // Выгрузка таблицы "Безналичные"
      .pause(delay(), downloadAndTransfer('select#payment option[value="1"]', base, 'Безналичне'))

      return browser;
  }
}

function processVehicles(browser, base) {
  return function() {
    let data = {};

    browser
      .url('https://lk.taximeter.yandex.ru/dictionary/cars', pageComplete())
      .waitForElementVisible('#table1[data-open="car"]', TIMEOUT)
      .source((result) => {
        data = parseVehiclesTable(cheerio.load(result.value));
        browser.assert.ok(data.length > 0);
      })
      .perform((client, callback) => {
        uploadData(data, `${period.date}-vehicles-${base}`, (answer) => {
          client.assert.ok(data.length > 0, `Получено строк ТС ${data.length}`);
          client.assert.ok(answer.status === 'success', 'Data transfered')

          callback();
        });
      })

    return browser;
  }
}

function processDrivers(browser, base) {
  return function() {
    let data = {};

    browser
      .url('https://lk.taximeter.yandex.ru/dictionary/drivers', pageComplete())
      .waitForElementVisible('#table1[data-open="driver"]', TIMEOUT)
      .source((result) => {
        data = parseDriversTable(cheerio.load(result.value));
        browser.assert.ok(data.length > 0);
      })
      .perform((client, callback) => {
        uploadData(data, `${period.date}-drivers-${base}`, (answer) => {
          client.assert.ok(data.length > 0, `Получено строк водителей ${data.length}`);
          client.assert.ok(answer.status === 'success', 'Data transfered')

          callback();
        });
      })

    return browser;
  }
}

function processDispatcher(browser, base) {
  return function() {
    let data = {};

    browser
      .url('https://lk.taximeter.yandex.ru/dispatcher')
      .waitForElementVisible('.container-left', TIMEOUT)
  }
}

function quitDB(browser) {
  return function() {
    // Выход из базы
    browser
      // .pause(delay(), safeClick('#showMainMenu'))
      .pause(delay(), safeClick('a.nav-icon-logout'))
      .pause(delay(), pageComplete())
  }
}

function downloadAndTransfer(selector, base, type) {
  return function() {
    let data = {};

    safeClick(selector).call(this)
      .pause(delay(), safeClick('#btn-update'))
      .pause(delay(), pageComplete())
      .source((result) => {
        data = parseTransfersTable(cheerio.load(result.value));
      })
      .perform((client, callback) => {
        uploadData(data, `${period.date}-transfers-${base}`, (answer) => {
          client.assert.ok(data.length > 0, `Получено строк плетежей (${type}) ${data.length}`);
          client.assert.ok(answer.status === 'success', 'Data transfered')

          callback();
        });
      });

    return this;
  }
}

function uploadData(data, type, callback) {
  request({
    url: `https://api.coasttaxi.ru/yandex/taximeter/post_json?type=${type}`,
    json: true,
    method: 'POST',
    headers: {
      Authorization: token,
    },
    body: data
  }, (err, res, body) => {
      callback(body);
  });
}
