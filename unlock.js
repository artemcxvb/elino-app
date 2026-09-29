/* ===== КОД ДОСТУПА К ТЕСТАМ =====
   Код детерминированный: зависит только от номера телефона сотрудника, поэтому проверяется без интернета.
   ВАЖНО: тот же алгоритм и та же соль должны быть в Google Apps Script (Code.gs: CODE_SALT / codeFor_).
   Алгоритм: FNV-1a (32 бит) от строки SALT + ':' + digits, затем остаток от деления на 10000, 4 цифры с нулями слева.
   digits — 11 цифр номера в виде 7XXXXXXXXXX.
   Тестовый вектор: телефон +7 900 123-45-67 (digits 79001234567) → код см. google-apps-script/code-test.js */
window.ELINO_UNLOCK = (function () {
  var SALT = 'elino-tests-2026-Kq7v';
  function hash32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function codeFor(phoneDigits) {
    var n = hash32(SALT + ':' + String(phoneDigits)) % 10000;
    return ('0000' + n).slice(-4);
  }
  return { SALT: SALT, hash32: hash32, codeFor: codeFor };
})();
