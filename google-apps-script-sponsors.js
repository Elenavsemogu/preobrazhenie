/**
 * Google Apps Script — материалы спонсоров «Преображение»
 *
 * Установка:
 * 1. Создай Google Таблицу «Преображение 8 — спонсоры»
 * 2. Расширения → Apps Script → вставь этот код
 * 3. В корне Drive создай папку «Преображение 8 сезон — спонсоры»
 *    и вставь её ID в ROOT_FOLDER_ID ниже
 * 4. Развернуть → Новое развертывание → Веб-приложение
 *    Выполнять от: Меня | Доступ: Все
 * 5. Скопируй URL в sponsor-form.js → SF_ENDPOINT
 *
 * Листы создадутся сами: «Полная» и «Дизайн»
 */

var ROOT_FOLDER_ID = '1YFlJaNI2PzRyWJtTJVwj-ryL4uotpOg2';

var DESIGN_KEYS = {
  logo: '01_design/logo',
  photo: '01_design/photo',
  promo: '01_design/promo_15s',
  print_start: '01_design/print_start',
  print_finale: '01_design/print_finale',
  rollup: '01_design/rollup'
};

function doGet() {
  return ContentService.createTextOutput('Преображение · приём материалов спонсоров ✓')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Пустое тело запроса');
    }
    var raw = e.postData.contents;
    if (raw.length > 45000000) {
      throw new Error('Слишком большой объём файлов. Отправьте без тяжёлых видео — догрузите в Drive вручную.');
    }
    var data = JSON.parse(raw);
    var result = processSubmission(data);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', folderUrl: result.folderUrl, folderId: result.folderId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', error: String(err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function processSubmission(data) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var slug = makeSlug(data);
  var folder = root.createFolder(slug);

  ensureSubfolders(folder);

  // passport
  var passport = Object.assign({}, data);
  delete passport.files;
  folder.createFile('00_passport.json', JSON.stringify(passport, null, 2), MimeType.PLAIN_TEXT);

  writeTextFiles(folder, data);
  saveFiles(folder, data.files || {});

  appendSheets(data, folder.getUrl());

  return { folderUrl: folder.getUrl(), folderId: folder.getId() };
}

function makeSlug(data) {
  var name = String(data.name || 'bez-imeni').trim().replace(/\s+/g, '_');
  var brand = String(data.brand || '').trim().replace(/\s+/g, '_');
  var pack = String(data.package_label || data.package || '').replace(/\s+/g, '');
  var stamp = Utilities.formatDate(new Date(), 'Asia/Barnaul', 'yyyyMMdd-HHmm');
  var base = [stamp, name, brand, pack].filter(Boolean).join('__');
  return base.substring(0, 120);
}

function ensureSubfolders(folder) {
  var paths = [
    '01_design',
    '01_design/logo',
    '01_design/photo',
    '01_design/promo_15s',
    '01_design/print_start',
    '01_design/print_finale',
    '01_design/rollup',
    '02_content',
    '03_ops',
    '04_video'
  ];
  paths.forEach(function (p) { getOrCreatePath(folder, p); });
}

function getOrCreatePath(root, path) {
  var parts = path.split('/');
  var cur = root;
  parts.forEach(function (part) {
    var it = cur.getFoldersByName(part);
    cur = it.hasNext() ? it.next() : cur.createFolder(part);
  });
  return cur;
}

function writeTextFiles(folder, data) {
  var content = getOrCreatePath(folder, '02_content');
  var ops = getOrCreatePath(folder, '03_ops');

  content.createFile('bio.txt', str(data.bio), MimeType.PLAIN_TEXT);
  content.createFile('mk_theme.txt',
    ['Тема: ' + str(data.mk_theme), '', 'Польза: ' + str(data.mk_benefit), '', 'Почему прийти: ' + str(data.mk_why)].join('\n'),
    MimeType.PLAIN_TEXT);
  content.createFile('socials.txt',
    ['Instagram: ' + str(data.instagram), 'VK: ' + str(data.vk), 'Другое: ' + str(data.other_social), 'Сайт: ' + str(data.website), 'Telegram: ' + str(data.telegram), 'Телефон: ' + str(data.phone), 'Email: ' + str(data.email)].join('\n'),
    MimeType.PLAIN_TEXT);
  content.createFile('ad_copy.txt', str(data.ad_copy), MimeType.PLAIN_TEXT);

  ops.createFile('homework.txt',
    ['ДЗ:\n' + str(data.homework), '', 'Проверка:\n' + str(data.homework_check)].join('\n'),
    MimeType.PLAIN_TEXT);
  ops.createFile('gift.txt',
    ['Описание: ' + str(data.gift_desc), 'Стоимость: ' + str(data.gift_value) + ' ₽'].join('\n'),
    MimeType.PLAIN_TEXT);
  ops.createFile('mk_tech.txt', str(data.mk_tech), MimeType.PLAIN_TEXT);
  ops.createFile('offers.txt', str(data.offers), MimeType.PLAIN_TEXT);
  ops.createFile('extras.txt', str(data.extras), MimeType.PLAIN_TEXT);
  ops.createFile('group_gift.txt', str(data.group_gift), MimeType.PLAIN_TEXT);
  ops.createFile('print_plan.txt',
    ['Старт (до 05.10):\n' + str(data.print_start_desc), '', 'Выпускной (до 10.12):\n' + str(data.print_finale_desc), '', 'Ролап: ' + str(data.rollup_note)].join('\n'),
    MimeType.PLAIN_TEXT);

  // README для Елены
  var design = getOrCreatePath(folder, '01_design');
  design.createFile('_ЧИТАЙ_МЕНЯ.txt',
    [
      'Папка для дизайна (Елена / ПАПИНА)',
      'Пакет: ' + str(data.package_label),
      'Имя: ' + str(data.name),
      'Бренд: ' + str(data.brand),
      'Ниша: ' + str(data.niche),
      '',
      'logo/          — логотип',
      'photo/         — фото на однотоне',
      'promo_15s/     — ролик ≤15с',
      'print_start/   — макеты на открытие',
      'print_finale/  — макеты на выпускной',
      'rollup/        — только генеральный',
      '',
      'Тексты для макетов: ../02_content/',
      'Орг.инфа Юлии: ../03_ops/'
    ].join('\n'),
    MimeType.PLAIN_TEXT);
}

function saveFiles(folder, filesMap) {
  Object.keys(filesMap).forEach(function (key) {
    var list = filesMap[key] || [];
    var targetPath = DESIGN_KEYS[key];
    if (key === 'vizitka') targetPath = '04_video';
    if (!targetPath) targetPath = '01_design';

    var dest = getOrCreatePath(folder, targetPath);
    list.forEach(function (f, idx) {
      if (f.skip) {
        dest.createFile(
          '_НУЖНО_ЗАГРУЗИТЬ_' + key + (idx ? '_' + idx : '') + '.txt',
          'Файл слишком большой для формы.\nИмя: ' + f.name + '\nРазмер: ' + f.size + '\nТип: ' + f.type + '\n\nЗагрузите файл в эту папку вручную.',
          MimeType.PLAIN_TEXT
        );
        return;
      }
      if (!f.data) return;
      var bytes = Utilities.base64Decode(f.data);
      var blob = Utilities.newBlob(bytes, f.type || 'application/octet-stream', f.name || (key + '_' + idx));
      dest.createFile(blob);
    });
  });
}

function appendSheets(data, folderUrl) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    // Веб-приложение без привязанной таблицы — папка Drive всё равно создана
    return;
  }
  var full = getOrCreateSheet(ss, 'Полная', [
    'Дата', 'Пакет', 'Имя', 'Бренд', 'Ниша', 'Телефон', 'Telegram', 'Email',
    'Instagram', 'VK', 'Сайт', 'Регалии', 'Тема МК', 'Польза МК', 'Почему МК',
    'ДЗ', 'Проверка ДЗ', 'Техника МК', 'Доп.материалы', 'Акции', 'Подарок группе',
    'Подарок победительнице', 'Стоимость подарка', 'Печать старт', 'Печать финал', 'Ролап',
    'Текст рекламы', 'Качество файлов', 'Папка Drive'
  ]);
  var design = getOrCreateSheet(ss, 'Дизайн', [
    'Дата', 'Пакет', 'Имя', 'Бренд', 'Ниша',
    'Лого статус', 'Фото статус', 'Промо статус', 'Визитка статус',
    'Соцсети', 'Текст рекламы', 'Тема МК (для макета)', 'Папка 01_design'
  ]);

  var meta = data.file_meta || {};
  var quality = Object.keys(meta).map(function (k) {
    return k + ':' + (meta[k].level || '?');
  }).join('; ');

  full.appendRow([
    new Date(), data.package_label, data.name, data.brand, data.niche,
    data.phone, data.telegram, data.email,
    data.instagram, data.vk, data.website,
    data.bio, data.mk_theme, data.mk_benefit, data.mk_why,
    data.homework, data.homework_check, data.mk_tech, data.extras, data.offers, data.group_gift,
    data.gift_desc, data.gift_value, data.print_start_desc, data.print_finale_desc, data.rollup_note,
    data.ad_copy, quality, folderUrl
  ]);

  design.appendRow([
    new Date(), data.package_label, data.name, data.brand, data.niche,
    meta.logo ? meta.logo.level : '—',
    meta.photo ? meta.photo.level : '—',
    meta.promo ? meta.promo.level : '—',
    meta.vizitka ? meta.vizitka.level : '—',
    [data.instagram, data.vk, data.website, data.telegram].filter(Boolean).join(' | '),
    data.ad_copy,
    data.mk_theme,
    folderUrl
  ]);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function str(v) {
  return v == null || v === '' ? '—' : String(v);
}
