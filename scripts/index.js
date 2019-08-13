const cheerio = require('cheerio');
const argv = require('minimist')(process.argv.slice(2));
const { bases, day, night, timeout, wait, screenshots } = require('../config');
const {
  uploadData,
  parseGpsTable,
  getUploadPeriod,
  parseTransfersTable,
  parseVehiclesTable,
  parseDriversTable
} = require('../lib');

const period = getUploadPeriod({ day, night }, argv);

// Время ожидания загрузки страницы
const TIMEOUT = timeout;

// Случайный офсет для имитация перемещения мыши к элементу (не больше десяти)
const offset = () => Math.ceil(Math.random()*10);

// Случайная задержка перед/после действия
const delay = () => Math.ceil(Math.random()*1500) + wait;

if (!(argv.transfers || argv.vehicles || argv.drivers || argv.gps)) argv.all = true;

console.log('Постановка в очередь задач:')
if (argv.all || argv.transfers) console.log('\t- выгрузка платежей');
if (argv.all || argv.vehicles) console.log('\t- выгрузка автотранспорта');
if (argv.all || argv.drivers) console.log('\t- выгрузка водителей');
if (argv.all || argv.gps) console.log('\t- выгрузка GPS');

// Список (массив) водителей в смене, заполняется при выгрузке платежей
let drivers = [];
let createdAtClicked = false;

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
    .pause(delay(), takeScreen('login', 'login'))
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
      .pause(100, takeScreen('city', base))
      .pause(delay(), safeMove(`button[type="submit"]:nth-child(${idx})`))
      .pause(100, safeClick(`button[type="submit"]:nth-child(${idx})`))
      .pause(delay(), processTransfers(browser, base))
      .pause(delay(), processVehicles(browser, base))
      .pause(delay(), processDrivers(browser, base))
      .pause(delay(), processDispatcher(browser, base))
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

function takeScreen(type, base) {
  let { from, to, ...params } = { ...period, base, type };

  return function() {
    if (screenshots) {
      this.saveScreenshot(`./ps/${params.date}-${params.period}-${params.base}-${params.type}.png`);
    }

    return this;
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
    if (!(argv.transfers || argv.gps || argv.all)) return browser;

    browser
      .url('https://lk.taximeter.yandex.ru/report/driver/types', pageComplete())
      .waitForElementVisible('input#filter-datetime-start', TIMEOUT)
      .pause(100, takeScreen('transfers', base))
      .clearValue('input#filter-datetime-start')
      .pause(delay())
      .setValue('input#filter-datetime-start', `${period.from}`)
      .pause(delay())
      .clearValue('input#filter-datetime-end')
      .pause(delay())
      .setValue('input#filter-datetime-end', `${period.to}`)

      // Список водителей в смене
      .source((result) => {
        let index = {};

        let data = parseTransfersTable(cheerio.load(result.value));
        browser.assert.ok(data.length > 0, `Водителей в смене ${data.length}`);

        drivers = data.map(row => row.id);
      })

      // Выгрузка таблицы "Наличные"
      .pause(delay(), downloadAndTransfer('select#payment option[value="0"]', base, 'Cash'))

      // Выгрузка таблицы "Безналичные"
      .pause(delay(), downloadAndTransfer('select#payment option[value="1"]', base, 'Card'))

      return browser;
  }
}

function processVehicles(browser, base) {
  return function() {
    if (!(argv.vehicles || argv.all)) return browser;

    let data = {
      rows: []
    };

    browser
      .url('https://fleet.taxi.yandex.ru/vehicles', pageComplete())
      .perform((client, callback) => {
        extractVehicles(1)();

        function extractVehicles(page) {
          return function() {
            client
              .waitForElementVisible('.card__table', TIMEOUT)
              .pause(delay(), () => {
                if (!createdAtClicked)
                  client
                    .pause(delay(), safeMove('.card__column'))
                    .pause(delay(), safeClick('li[role="menuitem"]:last-child'))

                createdAtClicked = true;
              })
              .pause(5000)
              .pause(delay(), takeScreen(`vehicles-${page}`, base))
              .source(processVuePages(data, extractVehicles, parseVehiclesTable, callback));
          }
        }
      })

      .perform((client, callback) => {
        let { from, to, ...params } = { ...period, base, type: 'vehicles' };

        uploadData(data.rows, params, (answer) => {
          client.assert.ok(data.rows.length > 0, `Получено строк ТС ${data.rows.length}`);
          client.assert.ok(answer.status === 'success', 'Data transfered')

          callback();
        });
      })

    return browser;
  }
}

function processDrivers(browser, base) {
  return function() {
    if (!(argv.drivers || argv.all)) return browser;

    let data = {
      rows: []
    };

    browser
      .url('https://lk.taximeter.yandex.ru/dictionary/drivers', pageComplete())
      .perform((client, callback) => {
        extractDrivers(1)();

        function extractDrivers(page) {
          return function() {
            client
              .waitForElementVisible('.card__table', TIMEOUT)
              .pause(4000)
              .pause(delay(), takeScreen(`drivers-${page}`, base))
              .source(processVuePages(data, extractDrivers, parseDriversTable, callback));
          }
        }
      })
      .perform((client, callback) => {
        let { from, to, ...params } = { ...period, base, type: 'drivers' }

        uploadData(data.rows, params, (answer) => {
          client.assert.ok(data.rows.length > 0, `Получено строк водителей ${data.rows.length}`);
          client.assert.ok(answer.status === 'success', 'Data transfered')

          callback();
        });
      })

    return browser;
  }
}

function processDispatcher(browser, base) {
  return function() {
    if (!(argv.gps || argv.all)) return browser;

    browser.assert.ok(drivers.length >= 0, `Водителей в смене ${drivers.length}`);

    Promise.all(drivers.map(gpsRequest));

    function gpsRequest(id, idx) {
      return new Promise((res, rej) => {
        let data = [];

        browser
          .url(`https://lk.taximeter.yandex.ru/driver/${id}/gps`, pageComplete())
          .pause(delay(), safeMove('input#start'))
          .clearValue('input#start')
          .pause(delay(), takeScreen('dispatcher', base))
          .setValue('input#start', `${period.from}`)
          .pause(delay(), safeMove('input#end'))
          .clearValue('input#end')
          .pause(delay())
          .setValue('input#end', `${period.to}`)
          .pause(delay(), safeClick('#btn-update'))
          .pause(delay(), pageComplete())
          .source((result) => {
            data = parseGpsTable(cheerio.load(result.value));
          })
          .perform((client, callback) => {
            client.assert.ok(true, ` Обработано ${idx+1} из ${drivers.length}`);

            if (!data.length) return callback();

            let { from, to, ...params } = { ...period, base, type: 'gps', driver: id }

            uploadData(data, params, (answer) => {
              if (screenshots) {
                client.saveScreenshot(`./ps/${params.date}-${params.period}-${params.base}-${params.type}-${params.driver}.png`);
              }
              client.assert.ok(data.length > 0, `Получено маршрутных точек ${data.length}`);
              client.assert.ok(answer.status === 'success', 'Data transfered')

              callback();
            });
          })
          .pause(100, () => res(id));
      })
    }
  }
}

function quitDB(browser) {
  return function() {
    // Выход из базы
    browser
      .url(`https://lk.taximeter.yandex.ru/login/exit`, pageComplete())
      .pause(delay(), pageComplete())
  }
}

function downloadAndTransfer(selector, base, money) {
  return function() {
    let data = {};

    safeClick(selector).call(this)
      .pause(delay(), safeClick('#btn-update'))
      .pause(delay(), pageComplete())

      .source((result) => {
        data = parseTransfersTable(cheerio.load(result.value));
      })
      .perform((client, callback) => {
        let { from, to, ...params } = { ...period, base, type: 'transfers', money }

        uploadData(data, params, (answer) => {
          if (screenshots) {
            client.saveScreenshot(`./ps/${params.date}-${params.period}-${params.base}-${params.type}-${params.money}.png`);
          }
          client.assert.ok(data.length > 0, `Получено строк плетежей (${money}) ${data.length}`);
          client.assert.ok(answer.status === 'success', 'Data transfered')

          callback();
        });
      });

    return this;
  }
}



function processVuePages(data, recursion, parser, callback) {
  return function ({ value }) {
    const client = this;
    const $ = cheerio.load(value);

    data.rows = [...data.rows, ...parser($)];
    client.assert.ok(data.rows.length > 0, `Получено ${data.rows.length} записей`);

    const nextPage = $('.ant-pagination-item-active').next();
    const pageNumber = $(nextPage).text();
    const selector = '.' + $(nextPage)
      .attr('class')
      .split(' ')
      .join('.');

    if (selector && pageNumber) {
      client.assert.ok(true, `Загрузка следующей [${pageNumber}] страницы`);

      client
        .pause(delay(), safeClick(selector))
        .pause(5000)
        .pause(delay(), recursion(pageNumber));
    }
    else {
      client.assert.ok(true, 'Обработаны все страницы');
      return callback();
    }
  }
}
