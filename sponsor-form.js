/**
 * Форма материалов спонсоров «Преображение»
 * Проверка качества → отправка в Google Apps Script → папки Drive
 *
 * Вставь URL веб-приложения GAS сюда после деплоя:
 */
var SF_ENDPOINT = 'https://script.google.com/macros/s/AKfycby0RkPvukIPI8qymB9Qxqm1L2KV7D6fZUqY5CKX1-ncEuWs9ZyhiWxbM548iU48NvxW5w/exec';

(function () {
  var form = document.getElementById('sponsorForm');
  if (!form) return;

  var pkgSelect = document.getElementById('package');
  var steps = Array.prototype.slice.call(form.querySelectorAll('.sf-step[data-step]'));
  var progress = document.getElementById('sfProgress');
  var stepLabel = document.getElementById('sfStepLabel');
  var btnPrev = document.getElementById('sfPrev');
  var btnNext = document.getElementById('sfNext');
  var btnSubmit = document.getElementById('sfSubmit');
  var formError = document.getElementById('sfFormError');
  var fileMeta = {}; // name -> { ok, level, messages, width, height, duration, size }
  var currentIdx = 0;

  var PACKAGE_LABELS = {
    sponsor: 'Спонсор',
    sponsor_plus: 'Спонсор+',
    expert: 'Эксперт',
    sponsor_expert: 'Спонсор-эксперт',
    general: 'Генеральный'
  };

  function pkg() { return pkgSelect.value; }

  function visibleSteps() {
    return steps.filter(function (s) {
      if (s.dataset.step === 'done') return false;
      var show = s.getAttribute('data-show');
      if (!show) return true;
      var p = pkg();
      if (!p) return false;
      return show.split(',').indexOf(p) !== -1;
    });
  }

  function applyPackageVisibility() {
    var p = pkg();
    form.querySelectorAll('.sf-only').forEach(function (el) {
      var show = (el.getAttribute('data-show') || '').split(',');
      var on = p && show.indexOf(p) !== -1;
      el.hidden = !on;
      el.querySelectorAll('[required]').forEach(function (inp) {
        if (on) {
          if (inp.dataset.wasRequired !== '0') inp.required = true;
        } else {
          inp.dataset.wasRequired = inp.required ? '1' : '0';
          inp.required = false;
        }
      });
    });
    // Gift value only when gift step visible
    var giftVal = form.querySelector('[name="gift_value"]');
    var giftDesc = form.querySelector('[name="gift_desc"]');
    var needGift = ['sponsor_plus', 'expert', 'sponsor_expert', 'general'].indexOf(p) !== -1;
    if (giftVal) giftVal.required = needGift;
    if (giftDesc) giftDesc.required = needGift;

    // Expert textareas
    var needExpert = ['expert', 'sponsor_expert', 'general'].indexOf(p) !== -1;
    ['bio', 'mk_theme', 'mk_benefit', 'mk_why', 'homework', 'homework_check', 'mk_tech'].forEach(function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      if (el) el.required = needExpert;
    });

    render();
  }

  function render() {
    var vis = visibleSteps();
    if (currentIdx >= vis.length) currentIdx = Math.max(0, vis.length - 1);
    steps.forEach(function (s) { s.classList.remove('is-active'); });
    var done = form.querySelector('[data-step="done"]');
    if (done) done.hidden = true;

    var active = vis[currentIdx];
    if (active) active.classList.add('is-active');

    var total = vis.length;
    var num = currentIdx + 1;
    progress.style.width = ((num / total) * 100) + '%';
    stepLabel.textContent = 'Шаг ' + num + ' из ' + total;

    btnPrev.hidden = currentIdx === 0;
    var last = currentIdx === total - 1;
    btnNext.hidden = last;
    btnSubmit.hidden = !last;
    document.getElementById('sfNav').hidden = false;

    if (last) buildReview();
  }

  function validateCurrent() {
    formError.hidden = true;
    var vis = visibleSteps();
    var step = vis[currentIdx];
    if (!step) return true;

    if (currentIdx === 0 && !pkg()) {
      formError.textContent = 'Выберите пакет участия';
      formError.hidden = false;
      return false;
    }

    var required = step.querySelectorAll('[required]');
    for (var i = 0; i < required.length; i++) {
      var el = required[i];
      if (el.closest('[hidden]')) continue;
      if (el.type === 'file') {
        if (!el.files || !el.files.length) {
          formError.textContent = 'Прикрепите файл: ' + (el.closest('.sf-upload')?.querySelector('h3')?.textContent || el.name);
          formError.hidden = false;
          return false;
        }
        var meta = fileMeta[el.name];
        if (meta && meta.level === 'bad') {
          formError.textContent = 'Файл «' + el.name + '» не проходит по качеству. Замените файл.';
          formError.hidden = false;
          return false;
        }
      } else if (el.type === 'checkbox') {
        if (!el.checked) {
          formError.textContent = 'Нужно подтверждение согласия';
          formError.hidden = false;
          return false;
        }
      } else if (!String(el.value || '').trim()) {
        formError.textContent = 'Заполните поле: ' + (el.previousElementSibling?.textContent || el.name);
        formError.hidden = false;
        el.focus();
        return false;
      }
    }

    // Optional files that were attached but blocked
    var uploads = step.querySelectorAll('.sf-upload input[type=file]');
    for (var j = 0; j < uploads.length; j++) {
      var f = uploads[j];
      if (f.files && f.files.length && fileMeta[f.name] && fileMeta[f.name].level === 'bad') {
        formError.textContent = 'Есть файл с критичной ошибкой качества. Замените его.';
        formError.hidden = false;
        return false;
      }
    }
    return true;
  }

  /* ——— Quality checks ——— */
  function formatBytes(n) {
    if (n < 1024) return n + ' Б';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' КБ';
    return (n / 1048576).toFixed(1) + ' МБ';
  }

  function setStatus(wrap, level, messages) {
    var box = wrap.querySelector('.sf-upload__status');
    if (!box) return;
    var cls = level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : 'bad';
    var title = level === 'ok' ? '✓ Качество подходит' : level === 'warn' ? '⚠ Есть замечания — можно отправить, но лучше заменить' : '✕ Не подходит для макетов';
    box.innerHTML = '<div class="' + cls + '"><strong>' + title + '</strong><br>' + messages.join('<br>') + '</div>';
  }

  function readImageMeta(file) {
    return new Promise(function (resolve) {
      if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
        resolve({ width: 0, height: 0, svg: true });
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve({ width: img.naturalWidth, height: img.naturalHeight, svg: false });
        URL.revokeObjectURL(url);
      };
      img.onerror = function () {
        resolve({ width: 0, height: 0, error: true });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  function readVideoMeta(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = function () {
        resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
        URL.revokeObjectURL(url);
      };
      v.onerror = function () {
        resolve({ duration: 0, error: true });
        URL.revokeObjectURL(url);
      };
      v.src = url;
    });
  }

  async function checkLogo(file) {
    var messages = [];
    var level = 'ok';
    var meta = await readImageMeta(file);
    var long = Math.max(meta.width || 0, meta.height || 0);
    if (meta.svg) {
      messages.push('SVG — отлично для логотипа');
    } else if (meta.error) {
      return { level: 'bad', messages: ['Не удалось прочитать изображение'] };
    } else {
      messages.push(meta.width + '×' + meta.height + ' · ' + formatBytes(file.size));
      if (long < 800) {
        level = 'bad';
        messages.push('Слишком маленькое: нужно от 1500 px по длинной стороне (минимум 800)');
      } else if (long < 1500) {
        level = 'warn';
        messages.push('Для печати лучше от 1500 px. Сейчас ' + long + ' px');
      }
      if (/jpe?g$/i.test(file.name) || file.type === 'image/jpeg') {
        level = level === 'bad' ? 'bad' : 'warn';
        messages.push('JPEG без прозрачности. Для лого лучше PNG или SVG');
      }
    }
    if (file.size > 25 * 1048576) {
      level = 'bad';
      messages.push('Файл больше 25 МБ');
    }
    return { level: level, messages: messages, width: meta.width, height: meta.height, size: file.size };
  }

  async function checkPhoto(file) {
    var messages = [];
    var level = 'ok';
    var meta = await readImageMeta(file);
    var long = Math.max(meta.width || 0, meta.height || 0);
    if (meta.error || !long) {
      return { level: 'bad', messages: ['Не удалось прочитать фото'] };
    }
    messages.push(meta.width + '×' + meta.height + ' · ' + formatBytes(file.size));
    if (long < 1400) {
      level = 'bad';
      messages.push('Мало для макетов: нужно от 2000 px (минимум 1400)');
    } else if (long < 2000) {
      level = 'warn';
      messages.push('Для баннеров лучше от 2000 px. Сейчас ' + long + ' px');
    }
    if (file.size > 40 * 1048576) {
      level = 'bad';
      messages.push('Файл больше 40 МБ');
    }
    return { level: level, messages: messages, width: meta.width, height: meta.height, size: file.size };
  }

  async function checkPromo(file) {
    var messages = [];
    var level = 'ok';
    var meta = await readVideoMeta(file);
    if (meta.error) return { level: 'warn', messages: ['Не удалось прочитать длительность — проверьте вручную'] };
    var d = meta.duration || 0;
    messages.push(Math.round(d) + ' сек · ' + formatBytes(file.size));
    if (d > 20) {
      level = 'bad';
      messages.push('Нужно до 15 секунд (макс. 20)');
    } else if (d > 15) {
      level = 'warn';
      messages.push('Чуть длиннее 15 сек — обрежьте, если можно');
    }
    if (file.size > 100 * 1048576) {
      level = 'bad';
      messages.push('Файл больше 100 МБ');
    }
    return { level: level, messages: messages, duration: d, size: file.size };
  }

  async function checkVizitka(file) {
    var messages = [];
    var level = 'ok';
    var meta = await readVideoMeta(file);
    if (meta.error) return { level: 'warn', messages: ['Не удалось прочитать длительность'] };
    var d = meta.duration || 0;
    messages.push(Math.round(d) + ' сек · ' + formatBytes(file.size));
    if (d < 30 || d > 90) {
      level = 'bad';
      messages.push('Цель — около 60 секунд (допустимо 30–90)');
    } else if (d < 45 || d > 75) {
      level = 'warn';
      messages.push('Лучше около 60 секунд');
    }
    if (file.size > 300 * 1048576) {
      level = 'bad';
      messages.push('Файл больше 300 МБ — загрузите в папку Drive после отправки');
    } else if (file.size > 100 * 1048576) {
      level = 'warn';
      messages.push('Большой файл — если отправка зависнет, положите в Drive вручную');
    }
    return { level: level, messages: messages, duration: d, size: file.size };
  }

  async function checkPrint(file) {
    var messages = [];
    var level = 'ok';
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      messages.push('PDF · ' + formatBytes(file.size));
      if (file.size > 50 * 1048576) {
        level = 'bad';
        messages.push('PDF больше 50 МБ');
      }
      return { level: level, messages: messages, size: file.size };
    }
    if (/\.svg$/i.test(file.name) || /\.ai$/i.test(file.name)) {
      messages.push('Вектор · ' + formatBytes(file.size));
      return { level: 'ok', messages: messages, size: file.size };
    }
    var meta = await readImageMeta(file);
    var long = Math.max(meta.width || 0, meta.height || 0);
    messages.push((long ? meta.width + '×' + meta.height + ' · ' : '') + formatBytes(file.size));
    if (long && long < 1400) {
      level = 'bad';
      messages.push('Растр для печати — от 2000 px (минимум 1400)');
    } else if (long && long < 2000) {
      level = 'warn';
      messages.push('Для печати лучше от 2000 px');
    }
    if (/jpe?g$/i.test(file.name)) {
      level = level === 'bad' ? 'bad' : 'warn';
      messages.push('JPEG хуже для печати с текстом — лучше PDF или PNG');
    }
    return { level: level, messages: messages, width: meta.width, height: meta.height, size: file.size };
  }

  var checkers = {
    logo: checkLogo,
    photo: checkPhoto,
    promo: checkPromo,
    vizitka: checkVizitka,
    print_start: checkPrint,
    print_finale: checkPrint,
    rollup: checkPrint
  };

  form.querySelectorAll('.sf-upload').forEach(function (wrap) {
    var kind = wrap.getAttribute('data-upload');
    var input = wrap.querySelector('input[type=file]');
    if (!input || !kind) return;
    input.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) {
        fileMeta[input.name] = null;
        wrap.querySelector('.sf-upload__status').innerHTML = '';
        var prev = wrap.querySelector('.sf-upload__preview');
        if (prev) { prev.hidden = true; prev.innerHTML = ''; }
        return;
      }
      var checker = checkers[kind];
      var worst = 'ok';
      var allMsg = [];
      for (var i = 0; i < files.length; i++) {
        var res = await checker(files[i]);
        if (res.level === 'bad') worst = 'bad';
        else if (res.level === 'warn' && worst !== 'bad') worst = 'warn';
        allMsg = allMsg.concat(res.messages.map(function (m) {
          return files.length > 1 ? (files[i].name + ': ' + m) : m;
        }));
        fileMeta[input.name] = res;
      }
      setStatus(wrap, worst, allMsg);
      fileMeta[input.name].level = worst;
      fileMeta[input.name].messages = allMsg;

      var prev = wrap.querySelector('.sf-upload__preview');
      if (prev && files[0].type.indexOf('image/') === 0) {
        var url = URL.createObjectURL(files[0]);
        prev.innerHTML = '<img src="' + url + '" alt="">';
        prev.hidden = false;
      }
    });
  });

  function buildReview() {
    var fd = new FormData(form);
    var pack = PACKAGE_LABELS[pkg()] || '—';
    var html = '<dl>';
    html += '<dt>Пакет</dt><dd>' + pack + '</dd>';
    html += '<dt>Имя</dt><dd>' + (fd.get('name') || '—') + '</dd>';
    html += '<dt>Бренд</dt><dd>' + (fd.get('brand') || '—') + '</dd>';
    html += '<dt>Ниша</dt><dd>' + (fd.get('niche') || '—') + '</dd>';
    html += '<dt>Telegram</dt><dd>' + (fd.get('telegram') || '—') + '</dd>';
    html += '</dl>';
    document.getElementById('sfReview').innerHTML = html;

    var warns = [];
    Object.keys(fileMeta).forEach(function (k) {
      var m = fileMeta[k];
      if (m && m.level === 'warn') warns.push('<strong>' + k + '</strong>: ' + m.messages.join('; '));
    });
    var box = document.getElementById('sfWarnings');
    if (warns.length) {
      box.hidden = false;
      box.innerHTML = '<strong>Предупреждения по качеству</strong><br>' + warns.join('<br>');
    } else {
      box.hidden = true;
      box.innerHTML = '';
    }
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      // В POST нельзя тащить большие base64 — Apps Script / мобильный интернет отдают HTML-ошибку
      var isVideo = file.type.indexOf('video/') === 0;
      var limit = isVideo ? (2 * 1048576) : (3 * 1048576);
      if (file.size > limit) {
        resolve({ skip: true, name: file.name, size: file.size, type: file.type });
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var base64 = String(dataUrl).split(',')[1] || '';
        resolve({ name: file.name, type: file.type, size: file.size, data: base64 });
      };
      reader.onerror = function () {
        reject(new Error('Не удалось прочитать файл «' + file.name + '». Выберите его заново.'));
      };
      reader.readAsDataURL(file);
    });
  }

  function trimPayloadForSend(payload) {
    // Если суммарно слишком тяжело — оставляем только мета + skip-заглушки
    var MAX_CHARS = 3.2 * 1048576;
    var copy = JSON.parse(JSON.stringify(payload));
    var raw = JSON.stringify(copy);
    if (raw.length <= MAX_CHARS) return copy;
    if (copy.files) {
      Object.keys(copy.files).forEach(function (k) {
        copy.files[k] = (copy.files[k] || []).map(function (f) {
          if (f.skip || !f.data) return f;
          return { skip: true, name: f.name, size: f.size, type: f.type, trimmed: true };
        });
      });
    }
    return copy;
  }

  function formatSubmitError(err, responseText) {
    if (responseText && /^\s*</.test(responseText)) {
      return 'Сервер не принял отправку (часто из‑за тяжёлых файлов или слабого интернета). Оставьте в форме лого и фото до 3 МБ — остальное догрузите в папку Drive после успеха, или напишите Юлии.';
    }
    var msg = (err && err.message) ? err.message : '';
    if (!msg || msg === '[object ProgressEvent]' || /ProgressEvent/.test(msg)) {
      return 'Не удалось прочитать один из файлов или оборвалась сеть. Уберите тяжёлые видео из формы и попробуйте снова.';
    }
    if (/Failed to fetch|NetworkError|Load failed|abort|AbortError/i.test(msg)) {
      return 'Сеть оборвалась или истекло время ожидания. Проверьте интернет, уберите файлы больше 3 МБ и попробуйте ещё раз.';
    }
    if (/JSON|Unexpected token/i.test(msg)) {
      return 'Ответ сервера повреждён (часто из‑за тяжёлых файлов). Отправьте без больших видео/PDF — догрузите их в Drive вручную.';
    }
    return msg;
  }

  async function collectPayload() {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (val, key) {
      if (typeof val === 'string') data[key] = val;
    });
    data.package_label = PACKAGE_LABELS[pkg()] || pkg();
    data.file_meta = {};
    Object.keys(fileMeta).forEach(function (k) {
      if (fileMeta[k]) {
        data.file_meta[k] = {
          level: fileMeta[k].level,
          messages: fileMeta[k].messages,
          width: fileMeta[k].width,
          height: fileMeta[k].height,
          duration: fileMeta[k].duration,
          size: fileMeta[k].size
        };
      }
    });

    data.files = {};
    var inputs = form.querySelectorAll('input[type=file]');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      if (!input.files || !input.files.length) continue;
      if (input.closest('[hidden]')) continue;
      var list = [];
      for (var j = 0; j < input.files.length; j++) {
        list.push(await fileToBase64(input.files[j]));
      }
      data.files[input.name] = list;
    }
    return data;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateCurrent()) return;

    if (!SF_ENDPOINT) {
      // Локальный режим: скачать JSON-паспорт для ручной раскладки
      var payload = await collectPayload();
      // убрать тяжёлые base64 из скачиваемого превью — оставить мета
      var light = JSON.parse(JSON.stringify(payload));
      if (light.files) {
        Object.keys(light.files).forEach(function (k) {
          light.files[k] = light.files[k].map(function (f) {
            return { name: f.name, type: f.type, size: f.size, skipped: !!f.skip, hasData: !!f.data };
          });
        });
      }
      var blob = new Blob([JSON.stringify(light, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'preo-sponsor-' + (payload.name || 'draft').replace(/\s+/g, '_') + '.json';
      a.click();

      showDone(null, true);
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Отправляем…';
    formError.hidden = true;
    var responseText = '';
    try {
      var body = trimPayloadForSend(await collectPayload());
      var skipped = 0;
      if (body.files) {
        Object.keys(body.files).forEach(function (k) {
          (body.files[k] || []).forEach(function (f) { if (f.skip) skipped++; });
        });
      }
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 90000) : null;
      var res = await fetch(SF_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      responseText = await res.text();
      var json;
      try {
        json = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(formatSubmitError(parseErr, responseText));
      }
      if (!json || json.status !== 'ok') {
        throw new Error((json && json.error) ? json.error : 'Ошибка сервера');
      }
      showDone(json.folderUrl || null, false, skipped);
    } catch (err) {
      var friendly = formatSubmitError(err, responseText);
      formError.textContent = 'Не отправилось: ' + friendly + ' Если не получается — напишите Юлии.';
      formError.hidden = false;
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Отправить';
    }
  });

  function showDone(folderUrl, localMode, skippedCount) {
    steps.forEach(function (s) { s.classList.remove('is-active'); });
    var done = form.querySelector('[data-step="done"]');
    done.hidden = false;
    done.classList.add('is-active');
    document.getElementById('sfNav').hidden = true;
    stepLabel.textContent = 'Готово';
    progress.style.width = '100%';
    var lead = document.getElementById('sfDoneLead');
    var link = document.getElementById('sfFolderLink');
    if (localMode) {
      lead.textContent = 'Пока сервер Drive не подключён — скачан JSON-паспорт. Подключите Google Apps Script (см. google-apps-script-sponsors.js) и вставьте URL в sponsor-form.js.';
      link.hidden = true;
    } else if (folderUrl) {
      var extra = skippedCount
        ? ' Часть тяжёлых файлов не ушла через форму — откройте папку и догрузите их вручную (там лежат подсказки _НУЖНО_ЗАГРУЗИТЬ_).'
        : '';
      lead.textContent = 'Папка на Google Drive создана.' + extra;
      link.hidden = false;
      link.innerHTML = '<a href="' + folderUrl + '" target="_blank" rel="noopener">' + folderUrl + '</a>';
    }
  }

  btnNext.addEventListener('click', function () {
    if (!validateCurrent()) return;
    currentIdx++;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  btnPrev.addEventListener('click', function () {
    currentIdx = Math.max(0, currentIdx - 1);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  pkgSelect.addEventListener('change', function () {
    currentIdx = 0;
    applyPackageVisibility();
  });

  applyPackageVisibility();
})();
