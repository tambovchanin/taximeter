const moment = require('moment');
const request = require('request');
const { api } = require('../config');

const split = (str, delimeter, part) => str.split(delimeter)[part];

const SCHEMAS = {
  TRANSFERS: ['', 'call', 'name', 'total', 'noDiscount', 'taxDriver', 'taxPark', 'taxYa', 'completed', 'canceled', 'yandex'],
  VEHICLES: ['call', 'manufactire', 'model', 'year', 'number', 'color', 'category', 'licenseNumber', 'transmission', 'mileage', 'createdAt'],
  DRIVERS: ['call', 'isWorking', '', 'name', 'vehicle', 'year', 'number', 'license', 'conditions', 'comments', 'email'],
  GPS: ['', 'timestamp', 'status', 'speed']
}

exports.uploadData = uploadData;
exports.parseGpsTable = parseGpsTable;
exports.getUploadPeriod = getUploadPeriod;
exports.parseTransfersTable = ($) => parseTable($, SCHEMAS.TRANSFERS);
exports.parseVehiclesTable = ($) => parseTable($, SCHEMAS.VEHICLES);
exports.parseDriversTable = ($) => parseTable($, SCHEMAS.DRIVERS);

function uploadData(data, params, callback) {
  if (!api.url) return callback({ status: 'success' });

  request({
    url: api.url,
    json: true,
    qs: params,
    method: 'POST',
    headers: {
      Authorization: api.token
    },
    body: data
  }, (err, res, body) => {
    callback(body);
  });
}

function parseTable($, schema) {
  return $('tr[data-guid]').map((idx, line) => {
    const row = {
      id: $(line).attr('data-guid')
    };

    $('td', line).each((idx, cell) => {
      if (!schema[idx]) return;

      row[schema[idx]] = ($(cell).text() || '').trim();
    });

    return row;
  }).toArray();
}

function parseGpsTable($) {
  return $('tr[data-lat]').map((idx, line) => {
    const row = {};

    $('td', line).each((idx, cell) => {
      if (!SCHEMAS.GPS[idx]) return;

      row[SCHEMAS.GPS[idx]] = ($(cell).text() || '').trim();
    });

    return row;
  }).toArray();
}

function getUploadPeriod(config) {
  let reportDate = moment();
  let from, to;
  const day = moment({ h: split(config.day.to, ':', 0), m: split(config.day.to, ':', 1) });
  const night = moment({ h: split(config.night.to, ':', 0), m: split(config.night.to, ':', 1) });

  // Признак что сейчас идет дневная смена, выгружаться будет ночная если isDay = true
  const isDay = reportDate.isBetween(night, day)

  // Ночная смена выгружается со вчерашним числом
  if (isDay) {
    reportDate = reportDate.add(-1, 'days');

    to = moment({ h: split(config.night.to, ':', 0), m: split(config.night.to, ':', 1) })
    from = moment({ h: split(config.night.from, ':', 0), m: split(config.night.from, ':', 1) }).add(-1, 'days');
  } else {
    from = moment({ h: split(config.day.from, ':', 0), m: split(config.day.from, ':', 1) });
    to = moment({ h: split(config.day.to, ':', 0), m: split(config.day.to, ':', 1) });

    // Дневная смена выгружается за вчераесли идет ночная смена и время после полуночи
    if (reportDate < night) {
      reportDate = reportDate.add(-1, 'days');
      from = from.add(-1, 'days');
      to = to.add(-1, 'days');
    }
  }

  console.log(`Формирование отчетов для ${isDay?'Ночной':'Дневной'} смены от ${reportDate.format('DD MMM')}`);

  return {
    from: from.format('DD.MM.YYYY\tHH:mm'),
    to: to.format('DD.MM.YYYY\tHH:mm'),
    date: reportDate.format(`YYYYMMDD`),
    period: isDay ? 'night': 'day'
  }
}
