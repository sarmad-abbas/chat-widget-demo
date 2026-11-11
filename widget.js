/*!
 * Website chat assistant (demo widget)
 * One script, no dependencies, no backend. Answers come from a per-business JSON config.
 * Embed:  <script src="widget.js" data-config="clinic.json"></script>
 * Matching is keyword/token scoring with typo tolerance. It is NOT a general AI.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Text helpers and matcher
   * ------------------------------------------------------------------ */

  var STOP = {};
  ('a an the is are am was do does did you your yours i me my we our us to of for in on at and or can could ' +
   'would will please plz pls kindly tell about there any have has it its this that with be so if ' +
   'hai hain ho hota hoti hote ka ki ke ko se mein me main mai par pe bhi to ye yeh wo woh kya kia ' +
   'ap aap hum mera meri mere kar kr karo kru karna bata batao btao bataen dein dain de do na ji').split(' ')
    .forEach(function (w) { STOP[w] = 1; });

  function normalise(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
      .trim();
  }
  function tokens(s) {
    var n = normalise(s);
    return n ? n.split(' ') : [];
  }

  // Damerau-Levenshtein (optimal string alignment): a swapped pair counts as one typo.
  function distance(a, b) {
    var m = a.length, n = b.length, i, j, d = [];
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }

  // Similarity of one user token to one keyword token: 1 exact, ~0.85-0.9 fuzzy, 0 none.
  // Short words (under 5 chars) and numbers must match exactly, so "fees" does not match "feel".
  function tokSim(u, k) {
    if (u === k) return 1;
    var lu = u.length, lk = k.length;
    if (Math.min(lu, lk) < 5 || /\d/.test(u) || /\d/.test(k)) return 0;
    if ((u.indexOf(k) === 0 || k.indexOf(u) === 0) && Math.abs(lu - lk) <= 3) return 0.9;
    var lim = Math.min(lu, lk) >= 9 ? 2 : 1;
    return distance(u, k) <= lim ? 0.85 : 0;
  }

  // Match one keyword (or phrase) against the user's tokens. Every token of a phrase must be
  // present, each on a different user token. Returns { s: points, used: [user token indexes] }.
  function phraseMatch(utoks, kw) {
    var exact = kw.charAt(0) === '=', kt = tokens(exact ? kw.slice(1) : kw), sum = 0, used = [], i, j;
    if (!kt.length) return null;
    for (i = 0; i < kt.length; i++) {
      var best = 0, bj = -1;
      for (j = 0; j < utoks.length; j++) {
        if (used.indexOf(j) !== -1) continue;
        var s = exact ? (utoks[j] === kt[i] ? 1 : 0) : tokSim(utoks[j], kt[i]);
        if (s > best) { best = s; bj = j; }
      }
      if (!best) return null;
      sum += best; used.push(bj);
    }
    return { s: sum, used: used };
  }
  // Each user token counts once per intent, so near-synonyms (kitna/kitne/kitni) do not stack.
  function keywordConfidence(utoks, kws) {
    var hits = [], i, p = 0, taken = {};
    for (i = 0; i < kws.length; i++) { var h = phraseMatch(utoks, kws[i]); if (h) hits.push(h); }
    hits.sort(function (a, b) { return b.s - a.s; });
    hits.forEach(function (h) {
      if (h.used.some(function (j) { return taken[j]; })) return;
      h.used.forEach(function (j) { taken[j] = 1; });
      p += h.s;
    });
    if (!p) return 0;
    return Math.min(1, 0.6 + 0.2 * (p - 1));
  }
  function content(toks) {
    var out = [], seen = {};
    toks.forEach(function (t) { if (!STOP[t] && !seen[t]) { seen[t] = 1; out.push(t); } });
    return out;
  }
  // Dice-style overlap between the user's content words and a sample question.
  function variantConfidence(utoks, variants) {
    var ut = content(utoks), best = 0;
    if (!ut.length) return 0;
    (variants || []).forEach(function (q) {
      var qt = content(tokens(q)), matched = 0;
      if (!qt.length) return;
      qt.forEach(function (k) {
        for (var j = 0; j < ut.length; j++) { if (tokSim(ut[j], k)) { matched++; break; } }
      });
      if (!matched) return;
      var dice = (2 * matched) / (ut.length + qt.length);
      if (dice > best) best = dice;
    });
    return best;
  }

  // Built-in intents. Keywords cover English and Roman Urdu. Configs can add more via "extraKeywords".
  var INTENTS = [
    { id: 'booking', kw: ['book', 'booking', 'appointment', 'appoint', 'reserve', 'reservation', 'slot', 'visit',
        'admission', 'enroll', 'enrol', 'enrolment', 'register', 'registration', 'milna', 'milna hai', 'time lena',
        'appointment lena', 'appointment chahiye', 'book karna', 'book karni', 'book krna', 'dakhla', 'dakhla lena'] },
    { id: 'hours', kw: ['hours', 'timing', 'timings', 'open', 'opening', 'closing', 'close', 'closed', 'khulta', 'khulte', 'khulti',
        'khula', 'kab khulta', 'kab tak', 'kab band', 'band hota', 'kitne baje', 'kis time', 'what time', 'sunday', 'friday',
        'schedule', 'working hours', 'waqt'] },
    { id: 'location', kw: ['address', 'location', 'where', 'kahan', 'kahaan', 'kidhar', 'kidher', 'map', 'directions', 'direction',
        'located', 'pata', 'lokation', 'adress', 'raasta', 'near', 'parking'] },
    { id: 'price', kw: ['price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees', 'fess', 'charges', 'charge', 'rate', 'rates',
        'kitna', 'kitne', 'kitni', 'qeemat', 'qimat', 'kimat', '=paise', '=paisay', 'rupay', 'rupees', 'kharcha', 'kitne ka',
        'how much', 'package', 'packages', 'afford', 'expensive', 'discount'] },
    { id: 'services', kw: ['services', 'service', 'treatments', 'treatment', 'courses', 'course', 'classes', 'subjects', 'offer',
        'offers', 'provide', 'kya kya', 'what do you do', 'khidmat', 'kaam'] },
    { id: 'contact', kw: ['contact', 'phone', 'number', 'call', 'whatsapp', 'whatsap', 'watsapp', 'raabta', 'rabta', 'baat karni',
        'speak', 'human', 'person', 'owner', 'manager', 'email'] },
    { id: 'thanks', kw: ['thanks', 'thank', 'thankyou', 'shukriya', 'shukria', 'jazakallah', 'bye', 'goodbye', 'hafiz', 'allah hafiz'] },
    { id: 'greeting', kw: ['hi', 'hello', 'hey', 'hola', 'salam', 'salaam', 'slam', 'assalam', 'assalamualaikum', 'assalamoalaikum',
        'aoa', 'asalam', 'asslam', 'morning', 'evening', 'helo', 'hy'] }
  ];

  function extraFor(cfg, id) {
    return (cfg.extraKeywords && cfg.extraKeywords[id]) || [];
  }
  function fmtLines(arr) { return arr.join('\n'); }
  function serviceLine(s) { return '• ' + s.name + (s.price ? ' — ' + s.price : ''); }

  function answerFor(id, cfg) {
    var m = cfg.messages || {};
    var name = cfg.businessName || 'us';
    var services = cfg.services || [];
    switch (id) {
      case 'greeting':
        return m.greeting || ('Assalam o Alaikum! Welcome to ' + name + '. Ask me about timings, prices or location, or I can take your booking details.');
      case 'thanks':
        return m.thanks || 'You are welcome! If you need anything else, just type here. Allah Hafiz.';
      case 'hours':
        var h = (cfg.hours || []).map(function (x) { return x.days + ': ' + x.time; });
        if (!h.length) return 'Please message us on WhatsApp for our timings.';
        return 'Our timings:\n' + fmtLines(h) + (cfg.hoursNote ? '\n' + cfg.hoursNote : '');
      case 'location':
        return (cfg.address ? 'We are at ' + cfg.address + '.' : 'Please ask us on WhatsApp for the address.') +
          (cfg.mapUrl ? '\nMap: ' + cfg.mapUrl : '');
      case 'services':
        return services.length ? 'What we offer:\n' + fmtLines(services.map(serviceLine)) +
          (cfg.priceNote ? '\n' + cfg.priceNote : '') : 'Please ask us on WhatsApp about our services.';
      case 'price':
        return services.length ? 'Our prices:\n' + fmtLines(services.map(serviceLine)) +
          (cfg.priceNote ? '\n' + cfg.priceNote : '') : 'Please ask us on WhatsApp for prices.';
      case 'contact':
        return (cfg.phoneDisplay ? 'You can reach us on ' + cfg.phoneDisplay + '. ' : '') +
          'The quickest way is WhatsApp. I can pass your details to the team now.';
      default:
        return '';
    }
  }
  function serviceAnswer(s) {
    return s.name + (s.description ? ': ' + s.description : '') + (s.price ? '\nPrice: ' + s.price : '');
  }

  /**
   * match(cfg, text) -> { id, confidence, answer, action, matched }
   * id is 'fallback' when confidence is under the threshold.
   */
  function match(cfg, text) {
    var utoks = tokens(text);
    var threshold = typeof cfg.threshold === 'number' ? cfg.threshold : 0.5;
    var cands = [], byId = {};
    function add(c) { cands.push(c); byId[c.id] = c; }

    INTENTS.forEach(function (it) {
      var conf = keywordConfidence(utoks, it.kw.concat(extraFor(cfg, it.id)));
      if (it.id === 'greeting' && utoks.length > 4) conf = Math.max(0, conf - 0.2);
      if (conf) add({ id: it.id, conf: conf, kind: 'intent' });
    });
    (cfg.services || []).forEach(function (s) {
      var kws = (s.keywords || []).concat([s.name]);
      var conf = keywordConfidence(utoks, kws);
      if (conf) add({ id: 'service:' + (s.id || s.name), conf: conf, kind: 'service', svc: s });
    });
    (cfg.faqs || []).forEach(function (f) {
      var conf = Math.max(keywordConfidence(utoks, f.keywords || []), variantConfidence(utoks, f.questions));
      if (conf) add({ id: 'faq:' + f.id, conf: conf, kind: 'faq', faq: f });
    });

    var best = null;
    cands.forEach(function (c) { if (!best || c.conf > best.conf) best = c; }); // ties keep earlier (specific before greeting)
    if (!best || best.conf < threshold) {
      return { id: 'fallback', confidence: best ? best.conf : 0, answer: (cfg.messages && cfg.messages.fallback) ||
        "I'm not sure about that one. Shall I pass this to the team on WhatsApp?", action: 'fallback' };
    }

    // A service named together with a price word -> that service's price.
    var priceHit = byId.price && byId.price.conf >= threshold;
    if (best.kind === 'service' || (best.id === 'price' && cands.some(function (c) { return c.kind === 'service' && c.conf >= threshold; }))) {
      var svc = best.kind === 'service' ? best.svc : cands.filter(function (c) { return c.kind === 'service'; })
        .sort(function (a, b) { return b.conf - a.conf; })[0].svc;
      if (priceHit || best.id === 'price') {
        return { id: 'service-price:' + (svc.id || svc.name), confidence: best.conf, action: null,
          answer: svc.name + (svc.price ? ': ' + svc.price + '.' : ': please ask us for the price.') + (cfg.priceNote ? '\n' + cfg.priceNote : '') };
      }
      return { id: best.id, confidence: best.conf, action: null, answer: serviceAnswer(svc) };
    }
    if (best.kind === 'faq') {
      return { id: best.id, confidence: best.conf, action: best.faq.action || null, answer: best.faq.answer };
    }
    var action = best.id === 'booking' ? 'booking' : (best.id === 'contact' ? 'offer' : null);
    var answer = best.id === 'booking'
      ? ((cfg.messages && cfg.messages.booking) || 'Happy to help you book. I will take a few details and prepare a WhatsApp message for the team.')
      : answerFor(best.id, cfg);
    return { id: best.id, confidence: best.conf, answer: answer, action: action };
  }

  /* ------------------------------------------------------------------ *
   * 2. Optional AI mode (local Ollama, off by default, for recorded demos)
   * ------------------------------------------------------------------ */
  function askOllama(cfg, question) {
    var ai = cfg.aiMode || {};
    if (!ai.enabled || typeof fetch !== 'function') return Promise.resolve(null);
    var ctx = ['Business: ' + cfg.businessName, 'Address: ' + (cfg.address || 'n/a')];
    (cfg.hours || []).forEach(function (h) { ctx.push('Hours ' + h.days + ': ' + h.time); });
    (cfg.services || []).forEach(function (s) { ctx.push('Service: ' + s.name + ' ' + (s.price || '') + ' ' + (s.description || '')); });
    (cfg.faqs || []).forEach(function (f) { ctx.push('FAQ: ' + (f.questions || [])[0] + ' -> ' + f.answer); });
    var sys = 'You are the website assistant for a small business in Lahore. Answer briefly using ONLY the facts below. ' +
      'If the answer is not in the facts, reply exactly: UNKNOWN. Reply in the language the customer used.\n' + ctx.join('\n');
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ai.timeoutMs || 15000);
    return fetch((ai.endpoint || 'http://localhost:11434').replace(/\/$/, '') + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ model: ai.model || 'llama3.2', stream: false,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: question }] })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        clearTimeout(timer);
        var t = j && j.message && typeof j.message.content === 'string' ? j.message.content.trim() : '';
        return t && t.indexOf('UNKNOWN') === -1 ? t : null;
      })
      .catch(function () { clearTimeout(timer); return null; }); // fail silently
  }

  /* ------------------------------------------------------------------ *
   * 3. UI
   * ------------------------------------------------------------------ */
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.w{--brand:#0f766e;--on:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.45;color:#1b1f23}',
    '.launcher{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;border:0;cursor:pointer;',
    'background:var(--brand);color:var(--on);height:56px;min-width:56px;padding:0 18px 0 16px;border-radius:28px;font:600 15px system-ui,sans-serif;',
    'box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .15s}',
    '.launcher:hover{transform:translateY(-2px)}',
    '.launcher svg{width:24px;height:24px;flex:none}',
    '.launcher[aria-expanded=true] .lbl{display:none}',
    '.launcher[aria-expanded=true]{padding:0 16px}',
    'button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}',
    '.panel{position:fixed;right:18px;bottom:86px;z-index:2147483000;width:372px;max-width:calc(100vw - 16px);height:min(580px,calc(100dvh - 104px));',
    'display:flex;flex-direction:column;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.3);animation:pop .18s ease-out}',
    '.panel[hidden]{display:none}',
    '@keyframes pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}',
    '.head{background:var(--brand);color:var(--on);padding:12px 14px;display:flex;align-items:center;gap:10px}',
    '.head .t{flex:1;min-width:0}',
    '.head .n{font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.head .s{font-size:12px;opacity:.9}',
    '.x{background:transparent;border:0;color:inherit;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:22px;line-height:1}',
    '.x:hover{background:rgba(255,255,255,.18)}',
    '.log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f6f7f8;overscroll-behavior:contain}',
    '.m{max-width:86%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.m.bot{background:#fff;border:1px solid #e4e7ea;border-bottom-left-radius:4px;align-self:flex-start}',
    '.m.user{background:var(--brand);color:var(--on);border-bottom-right-radius:4px;align-self:flex-end}',
    '.m a{color:inherit;text-decoration:underline}',
    '.m.typing{color:#6b7280;font-style:italic}',
    '.wa{display:inline-flex;align-items:center;justify-content:center;margin-top:8px;padding:11px 16px;border-radius:10px;background:#25a244;color:#fff!important;',
    'font-weight:700;text-decoration:none!important;min-height:44px}',
    '.note{display:block;margin-top:6px;font-size:12px;color:#6b7280}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;background:#f6f7f8;max-height:112px;overflow-y:auto}',
    '.chips:empty{display:none}',
    '.chip{border:1px solid var(--brand);background:#fff;color:var(--brand);border-radius:18px;padding:7px 12px;font:500 14px system-ui,sans-serif;cursor:pointer;min-height:36px}',
    '.chip:hover{background:var(--brand);color:var(--on)}',
    'form{display:flex;gap:8px;padding:10px 12px;background:#f6f7f8;border-top:1px solid #e4e7ea}',
    'input{flex:1;min-width:0;border:1px solid #c9ced3;border-radius:10px;padding:10px 12px;font:16px system-ui,sans-serif;background:#fff;color:#1b1f23}',
    '.send{border:0;background:var(--brand);color:var(--on);border-radius:10px;padding:0 16px;font:600 15px system-ui,sans-serif;cursor:pointer;min-height:44px}',
    '.foot{font-size:11px;color:#6b7280;text-align:center;padding:0 10px 8px;background:#f6f7f8}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '@media(max-width:480px){.panel{right:8px;left:8px;width:auto;max-width:none;bottom:80px;border-radius:14px}.launcher{right:12px;bottom:12px}}',
    '@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
  ].join('');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/></svg>';

  function onColour(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111111' : '#ffffff';
  }

  // Render plain text; http(s) URLs become links. Everything goes through textContent.
  function renderText(node, text) {
    String(text).split(/(https?:\/\/[^\s]+)/g).forEach(function (part, i) {
      if (i % 2 === 1) {
        var a = el('a', null, part);
        a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer';
        node.appendChild(a);
      } else if (part) {
        node.appendChild(document.createTextNode(part));
      }
    });
  }

  function waDigits(num) { return String(num || '').replace(/\D/g, ''); }
  function waLink(cfg, summary) {
    return 'https://wa.me/' + waDigits(cfg.whatsappNumber) + '?text=' + encodeURIComponent(summary);
  }

  function mount(cfg) {
    if (document.getElementById('demo-chat-host')) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var host = el('div'); host.id = 'demo-chat-host';
    var root = host.attachShadow({ mode: 'open' });
    root.appendChild(el('style', null, CSS));
    var w = el('div', 'w');
    w.style.setProperty('--brand', cfg.brandColor || '#0f766e');
    w.style.setProperty('--on', onColour(cfg.brandColor || '#0f766e'));
    root.appendChild(w);

    var launcher = el('button', 'launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'chat-panel');
    launcher.setAttribute('aria-label', 'Open chat with ' + (cfg.businessName || 'us'));
    launcher.innerHTML = ICON_CHAT; // static trusted markup, no user input
    launcher.appendChild(el('span', 'lbl', cfg.launcherLabel || 'Chat with us'));

    var panel = el('div', 'panel');
    panel.id = 'chat-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with ' + (cfg.businessName || 'us'));

    var head = el('div', 'head');
    var ht = el('div', 't');
    ht.appendChild(el('div', 'n', cfg.businessName || 'Chat'));
    ht.appendChild(el('div', 's', 'Automated assistant. Replies are from our FAQ.'));
    var closeBtn = el('button', 'x', '×');
    closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close chat');
    head.appendChild(ht); head.appendChild(closeBtn);

    var log = el('div', 'log');
    log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-label', 'Conversation');
    var chips = el('div', 'chips');
    chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Quick replies');

    var form = el('form');
    var input = el('input');
    input.type = 'text'; input.maxLength = 300; input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Type your message');
    input.placeholder = 'Type your question...';
    var send = el('button', 'send', 'Send'); send.type = 'submit';
    form.appendChild(input); form.appendChild(send);

    var foot = el('div', 'foot', cfg.whatsappIsPlaceholder ? 'Demo mode: WhatsApp number is a placeholder.' : 'Enquiries are sent via WhatsApp when you press the button.');

    [head, log, chips, form, foot].forEach(function (n) { panel.appendChild(n); });
    w.appendChild(panel); w.appendChild(launcher);
    document.body.appendChild(host);

    var flow = null, welcomed = false, busy = false;

    function scroll() { log.scrollTop = log.scrollHeight; }
    function addMsg(who, text) {
      var m = el('div', 'm ' + who);
      renderText(m, text);
      log.appendChild(m); scroll();
      return m;
    }
    function clearChips() { while (chips.firstChild) chips.removeChild(chips.firstChild); }
    function setChips(list) {
      clearChips();
      list.forEach(function (c) {
        var b = el('button', 'chip', c.label);
        b.type = 'button';
        b.addEventListener('click', function () {
          if (c.fn) { addMsg('user', c.label); clearChips(); c.fn(); } else { onUser(c.label); }
        });
        chips.appendChild(b);
      });
    }
    function defaultChips() {
      setChips((cfg.quickReplies || []).map(function (q) { return { label: q }; }));
    }
    function botSay(text, then) {
      clearChips();
      var t = el('div', 'm bot typing', '...');
      t.setAttribute('aria-hidden', 'true');
      log.appendChild(t); scroll();
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
        addMsg('bot', text);
        if (then) then();
      }, reduce ? 0 : 350);
    }

    /* ---- booking / enquiry flow ---- */
    function startFlow(prefill) {
      flow = { step: 'name', data: { need: (prefill && prefill.need) || '' } };
      botSay('Happy to help. What is your name?', function () {
        setChips([{ label: 'Cancel', fn: cancelFlow }]);
      });
    }
    function cancelFlow() {
      flow = null;
      botSay('No problem, nothing has been sent. Anything else I can help with?', defaultChips);
    }
    function askNeed() {
      flow.step = 'need';
      botSay('What do you need? Pick one or type it.', function () {
        var l = (cfg.services || []).slice(0, 5).map(function (s) { return { label: s.name }; });
        l.push({ label: 'Cancel', fn: cancelFlow });
        setChips(l);
      });
    }
    function finishFlow() {
      var d = flow.data;
      var summary = 'Hello ' + (cfg.businessName || '') + ', I would like to enquire via your website chat.\n' +
        'Name: ' + d.name + '\nPreferred time: ' + d.time + '\nNeed: ' + d.need;
      flow = null;
      clearChips();
      setTimeout(function () {
        var m = el('div', 'm bot');
        m.appendChild(document.createTextNode('Thank you, ' + d.name + '. Your enquiry is ready:\nName: ' + d.name + '\nPreferred time: ' + d.time + '\nNeed: ' + d.need));
        m.appendChild(el('br'));
        var a = el('a', 'wa', 'Send on WhatsApp');
        a.href = waLink(cfg, summary); a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.setAttribute('data-testid', 'wa-link');
        m.appendChild(a);
        m.appendChild(el('span', 'note', 'This opens WhatsApp with your message typed out. Nothing is sent until you press send there.' +
          (cfg.whatsappIsPlaceholder ? ' (Demo: this number is a placeholder.)' : '')));
        log.appendChild(m); scroll();
        setChips([{ label: 'Start another enquiry', fn: function () { startFlow(); } }, { label: 'Ask a question', fn: function () { botSay('Go ahead, I am listening.', defaultChips); } }]);
      }, reduce ? 0 : 350);
    }
    function flowInput(text) {
      var n = normalise(text);
      if (/^(cancel|stop|quit|exit|nahi|nahin|no|rehne do|chor do|cancel karo)$/.test(n)) return cancelFlow();
      var v = text.replace(/\s+/g, ' ').trim();
      if (flow.step === 'name') {
        if (v.length < 2) return botSay('Could you type your name, please?');
        flow.data.name = v.slice(0, 60);
        flow.step = 'time';
        return botSay('Thanks, ' + flow.data.name + '. When would you like to come in or be contacted?', function () {
          setChips((cfg.timeChips || ['Today', 'Tomorrow', 'This weekend']).map(function (t) { return { label: t }; })
            .concat([{ label: 'Cancel', fn: cancelFlow }]));
        });
      }
      if (flow.step === 'time') {
        flow.data.time = v.slice(0, 80);
        if (flow.data.need) return finishFlow();
        return askNeed();
      }
      if (flow.step === 'need') {
        flow.data.need = v.slice(0, 200);
        return finishFlow();
      }
    }

    /* ---- main message handling ---- */
    function respond(text) {
      var res = match(cfg, text);
      if (res.id === 'fallback') {
        busy = true;
        askOllama(cfg, text).then(function (ai) {
          busy = false;
          if (ai) { botSay(ai + '\n(AI-generated demo answer, may be inaccurate.)', defaultChips); return; }
          botSay(res.answer, function () {
            setChips([
              { label: 'Yes, pass to team', fn: function () { startFlow({ need: text.slice(0, 200) }); } },
              { label: 'No, ask something else', fn: function () { botSay('Sure, go ahead.', defaultChips); } }
            ]);
          });
        });
        return;
      }
      if (res.action === 'booking') { botSay(res.answer, function () { startFlow(); }); return; }
      if (res.action === 'offer') {
        botSay(res.answer, function () {
          setChips([{ label: 'Yes, send enquiry', fn: function () { startFlow(); } }, { label: 'Not now', fn: function () { botSay('No problem.', defaultChips); } }]);
        });
        return;
      }
      botSay(res.answer, defaultChips);
    }
    function onUser(text) {
      text = text.replace(/\s+/g, ' ').trim();
      if (!text || busy) return;
      addMsg('user', text);
      clearChips();
      if (flow) flowInput(text); else respond(text);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value; input.value = '';
      onUser(v);
    });

    /* ---- open / close / focus ---- */
    function open() {
      panel.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      launcher.setAttribute('aria-label', 'Close chat');
      if (!welcomed) {
        welcomed = true;
        addMsg('bot', cfg.welcome || ('Assalam o Alaikum! I am the assistant for ' + (cfg.businessName || 'this business') + '. Ask me about timings, prices or location, or leave an enquiry for the team.'));
        defaultChips();
      }
      input.focus();
    }
    function close() {
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      launcher.setAttribute('aria-label', 'Open chat with ' + (cfg.businessName || 'us'));
      launcher.focus();
    }
    launcher.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
    closeBtn.addEventListener('click', close);
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.slice.call(panel.querySelectorAll('button,input,a[href]')).filter(function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], active = root.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    });

    return { open: open, close: close, host: host };
  }

  /* ------------------------------------------------------------------ *
   * 4. Boot
   * ------------------------------------------------------------------ */
  var api = {
    version: '1.0.0', match: match, normalise: normalise, tokens: tokens, mount: mount,
    init: function (cfg) { if (document.body) return mount(cfg); document.addEventListener('DOMContentLoaded', function () { mount(cfg); }); }
  };
  window.DemoChat = api;

  var me = document.currentScript;
  if (me && me.getAttribute('data-config')) {
    var url = new URL(me.getAttribute('data-config'), document.baseURI).href;
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (cfg) { api.init(cfg); })
      .catch(function (err) {
        if (window.console) console.warn('[chat widget] could not load config ' + url + ' (' + err.message + '). Serve the folder over http, file:// blocks fetch.');
      });
  }
})();
