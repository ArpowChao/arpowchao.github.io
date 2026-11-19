/**
 * 海風專題信箱（Seagull Mail）Google Apps Script 後端
 * ---------------------------------------------------------
 * 1. 建立或開啟一個 Google 試算表 →「擴充功能」→「Apps Script」
 * 2. 將本檔案全部貼進 Code.gs 並儲存
 * 3. 在上方函式選單選擇 setupSheets 執行一次（授權並建立工作表）
 * 4. 點右上角「部署」→「新增部署」→ 類型選「網頁應用程式」
 *    - 執行身分：我（你的 Google 帳號）
 *    - 誰可以存取：所有人（Anyone）
 * 5. 將產生的 /exec 網址貼進 config.js 的 gasUrl，或大螢幕右上角設定彈窗即可連線！
 */

var LIST_CACHE_KEY = 'seagull_list_v1';
var LIST_CACHE_TTL = 20;
var MAX_RETURN_ITEMS = 200;

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var msgSheet = ss.getSheetByName('Messages');
  if (!msgSheet) {
    msgSheet = ss.insertSheet('Messages');
  }
  if (msgSheet.getLastRow() === 0) {
    msgSheet.appendRow(['id', 'timestamp', 'group', 'sender', 'avatar', 'message', 'status', 'clientId']);
    msgSheet.getRange(1, 1, 1, 8)
      .setFontWeight('bold')
      .setBackground('#1a354d')
      .setFontColor('#fffdf7');
    msgSheet.setFrozenRows(1);
  }
  msgSheet.getRange('A2:H1000').setNumberFormat('@');

  if (typeof SpreadsheetApp.newDataValidation === 'function') {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['approved', 'pending', 'hidden'], true)
      .setAllowInvalid(false)
      .build();
    msgSheet.getRange('G2:G1000').setDataValidation(rule);
  }

  var cfgSheet = ss.getSheetByName('Config');
  if (!cfgSheet) {
    cfgSheet = ss.insertSheet('Config');
  }
  if (cfgSheet.getLastRow() === 0) {
    var defaults = [
      ['key', 'value', 'note'],
      ['moderation_mode', 'instant', 'instant = 送出直接飛上大螢幕；moderate = 先存成 pending，改為 approved 才顯示'],
      ['event_title', '海風專題信箱', '顯示在大螢幕左上角的活動主標題'],
      ['max_length', '120', '單則留言最大字數上限'],
      ['cooldown_sec', '15', '同一裝置連續送出冷卻秒數（設 0 則不限制）'],
      ['banned_words', '', '要阻擋的關鍵字，請用半形逗號 , 分隔']
    ];
    cfgSheet.getRange(1, 1, defaults.length, 3).setValues(defaults);
    cfgSheet.getRange(1, 1, 1, 3)
      .setFontWeight('bold')
      .setBackground('#2b7de9')
      .setFontColor('#fffdf7');
    cfgSheet.setFrozenRows(1);
  }

  return { ok: true, message: 'Messages 與 Config 工作表已就緒' };
}

function readConfig(ss) {
  var cfg = {
    moderation_mode: 'instant',
    event_title: '海風專題信箱',
    max_length: 120,
    cooldown_sec: 15,
    banned_words: ''
  };
  var sheet = ss.getSheetByName('Config');
  if (!sheet || sheet.getLastRow() < 2) return cfg;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    var v = String(rows[i][1] === undefined || rows[i][1] === null ? '' : rows[i][1]).trim();
    if (!k) continue;
    if (k === 'max_length' || k === 'cooldown_sec') {
      var n = Number(v);
      if (!isNaN(n) && n >= 0) cfg[k] = n;
    } else if (k === 'moderation_mode') {
      cfg[k] = v === 'moderate' ? 'moderate' : 'instant';
    } else {
      cfg[k] = v;
    }
  }
  return cfg;
}

function buildApprovedPayload(ss, cfg) {
  var sheet = ss.getSheetByName('Messages');
  if (!sheet || sheet.getLastRow() < 2) {
    return {
      eventTitle: cfg.event_title,
      total: 0,
      items: []
    };
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  var approved = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var status = String(r[6] || '').trim().toLowerCase();
    if (status !== 'approved') continue;
    approved.push({
      id: String(r[0] || ''),
      timestamp: r[1] instanceof Date ? r[1].toISOString() : String(r[1] || ''),
      group: String(r[2] || '給全體專題'),
      sender: String(r[3] || '海風訪客'),
      avatar: String(r[4] || 'sailor'),
      message: String(r[5] || '')
    });
  }

  approved.sort(function (a, b) {
    return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  });

  return {
    eventTitle: cfg.event_title,
    total: approved.length,
    items: approved.slice(0, MAX_RETURN_ITEMS)
  };
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  var since = String(params.since || '').trim();
  var cache = CacheService.getScriptCache();
  var cachedRaw = cache.get(LIST_CACHE_KEY);
  var basePayload = null;

  if (cachedRaw) {
    try {
      basePayload = JSON.parse(cachedRaw);
    } catch (err) {
      basePayload = null;
    }
  }

  if (!basePayload) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cfg = readConfig(ss);
    basePayload = buildApprovedPayload(ss, cfg);
    try {
      cache.put(LIST_CACHE_KEY, JSON.stringify(basePayload), LIST_CACHE_TTL);
    } catch (err) {
      /* cache size guard */
    }
  }

  var newItems = since
    ? basePayload.items.filter(function (it) { return String(it.timestamp || '') > since; })
    : basePayload.items;

  return jsonOut({
    ok: true,
    eventTitle: basePayload.eventTitle,
    total: basePayload.total,
    items: basePayload.items,
    newItems: newItems
  });
}

function sanitizeText(str, maxLen) {
  var clean = String(str || '').replace(/[\r\n\t]+/g, ' ').trim();
  if (clean.length > maxLen) {
    clean = clean.slice(0, maxLen);
  }
  return clean;
}

function doPost(e) {
  var body = {};
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    body = raw ? JSON.parse(raw) : {};
  } catch (err) {
    return jsonOut({ ok: false, error: '無法解析送出資料（JSON 格式錯誤）' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = readConfig(ss);
  var maxLen = Math.max(10, Number(cfg.max_length) || 120);
  var cooldownSec = Math.max(0, Number(cfg.cooldown_sec) || 0);

  var rawMessage = String(body.message || '').trim();
  if (!rawMessage) {
    return jsonOut({ ok: false, error: '留言內容不能為空！' });
  }
  if (rawMessage.length > maxLen) {
    return jsonOut({ ok: false, error: '留言字數超過上限（最多 ' + maxLen + ' 字）' });
  }

  var message = sanitizeText(rawMessage, maxLen);
  var sender = sanitizeText(body.sender || '海風訪客', 20) || '海風訪客';
  var group = sanitizeText(body.group || '給全體專題', 30) || '給全體專題';
  var avatar = sanitizeText(body.avatar || 'sailor', 20) || 'sailor';
  var clientId = sanitizeText(body.clientId || '', 48);

  if (cfg.banned_words) {
    var words = cfg.banned_words.split(/[,，]/);
    var combined = (sender + ' ' + message).toLowerCase();
    for (var i = 0; i < words.length; i++) {
      var w = String(words[i] || '').trim().toLowerCase();
      if (w && combined.indexOf(w) !== -1) {
        return jsonOut({ ok: false, error: '留言包含未開放字詞，請修改後再放飛海鷗！' });
      }
    }
  }

  var cache = CacheService.getScriptCache();
  var cdKey = clientId ? 'cd_' + clientId : '';
  if (cooldownSec > 0 && cdKey && cache.get(cdKey)) {
    return jsonOut({ ok: false, error: '海鷗剛幫你寄完信，請等 ' + cooldownSec + ' 秒後再寫下一封！' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonOut({ ok: false, error: '現在同時寫信的人比較多，請稍後幾秒再試！' });
  }

  try {
    var sheet = ss.getSheetByName('Messages');
    if (!sheet) {
      setupSheets();
      sheet = ss.getSheetByName('Messages');
    }

    var nowIso = new Date().toISOString();
    var id = 'sg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    var status = cfg.moderation_mode === 'moderate' ? 'pending' : 'approved';

    var cellRow = sheet.getLastRow() + 1;
    var rowRange = sheet.getRange(cellRow, 1, 1, 8);
    rowRange.setNumberFormat('@');
    rowRange.setValues([[id, nowIso, group, sender, avatar, message, status, clientId]]);

    if (cooldownSec > 0 && cdKey) {
      cache.put(cdKey, '1', cooldownSec);
    }
    cache.remove(LIST_CACHE_KEY);

    var updated = buildApprovedPayload(ss, cfg);
    try {
      cache.put(LIST_CACHE_KEY, JSON.stringify(updated), LIST_CACHE_TTL);
    } catch (err) { /* ignore cache size */ }

    return jsonOut({
      ok: true,
      id: id,
      status: status,
      total: updated.total,
      item: status === 'approved' ? {
        id: id,
        timestamp: nowIso,
        group: group,
        sender: sender,
        avatar: avatar,
        message: message
      } : null
    });
  } finally {
    lock.releaseLock();
  }
}
