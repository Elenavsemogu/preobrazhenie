// Google Apps Script — вставить в Google Таблицу → Расширения → Apps Script
// После вставки: Развернуть → Новое развертывание → Веб-приложение
// Выполнять от: Меня | Доступ: Все

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  var headers = ['timestamp', 'fio', 'birthdate', 'contacts', 'occupation', 'family',
                 'children', 'goal', 'schedule', 'socials', 'consent_masters',
                 'consent_schedule', 'opposition', 'photo_consent'];

  if (sheet.getLastRow() === 0) {
    var headerNames = ['Дата', 'ФИО', 'Дата рождения', 'Контакты', 'Занятость',
                       'Семейное положение', 'Дети', 'Цель участия', 'Расписание',
                       'Соц сети', 'Согласие на мастеров', 'Согласие на расписание',
                       'Противники', 'Согласие на фото'];
    sheet.appendRow(headerNames);
    sheet.getRange(1, 1, 1, headerNames.length).setFontWeight('bold');
  }

  var row = headers.map(function(h) { return data[h] || ''; });
  sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}
