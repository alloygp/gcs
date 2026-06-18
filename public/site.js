/* German Car Specialists — shared site runtime.
   Loaded once via BaseLayout, after Lucide + image-slot.js. Handles:
   star fills, mobile drawer, scroll-reveal, nav dropdowns (hover-intent),
   and the persistent make-picker bar (localStorage 'gcs_make'). */
(function () {
  var star = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.6 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z"/></svg>';
  ['d3-ts', 'd3-hp', 'd3-fr', 'tb-s', 'hero-s', 'rb-s'].forEach(function (id) {
    var e = document.getElementById(id); if (e) e.innerHTML = star.repeat(5);
  });
  document.querySelectorAll('[data-stars]').forEach(function (e) { e.innerHTML = star.repeat(5); });

  // Mobile drawer
  var drawer = document.getElementById('drawer');
  var burger = document.getElementById('burger');
  var dx = document.getElementById('dx');
  if (burger && drawer) burger.onclick = function () { drawer.classList.add('open'); };
  if (dx && drawer) dx.onclick = function () { drawer.classList.remove('open'); };
  if (drawer) drawer.querySelectorAll('a').forEach(function (a) { a.onclick = function () { drawer.classList.remove('open'); }; });

  // Scroll-reveal (fail-safe: content must never stay invisible)
  var reveals = document.querySelectorAll('.reveal');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (e) { io.observe(e); });
    // Safety net: nothing should remain hidden if the observer never fires for it.
    setTimeout(function () { reveals.forEach(function (e) { if (!e.classList.contains('in')) e.classList.add('in'); }); }, 2500);
  } else {
    // No IntersectionObserver, or the user prefers reduced motion: show everything immediately.
    reveals.forEach(function (e) { e.classList.add('in'); });
  }

  // Photo slideshow (crossfade). Guarded: no-op with <2 slides or reduced motion.
  (function () {
    var slides = [].slice.call(document.querySelectorAll('.why-slide'));
    if (slides.length < 2) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var i = 0;
    setInterval(function () {
      slides[i].classList.remove('is-active');
      i = (i + 1) % slides.length;
      slides[i].classList.add('is-active');
    }, 4500);
  })();

  // Sticky nav: hide on scroll down, ease back on scroll up; glassy once scrolled.
  (function () {
    var hdr = document.getElementById('hdr');
    if (!hdr) return;
    var lastY = window.pageYOffset || 0;
    var ticking = false;
    function update() {
      var y = window.pageYOffset || 0;
      if (y > 8) hdr.classList.add('is-glass'); else hdr.classList.remove('is-glass');
      if (Math.abs(y - lastY) > 4) {
        if (y > lastY && y > 120) hdr.classList.add('is-hidden');
        else if (y < lastY) hdr.classList.remove('is-hidden');
        lastY = y;
      }
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  })();

  // Hero review carousel — rotate between Google reviews with arrows + dots. Guarded.
  (function () {
    var track = document.getElementById('hfmTrack');
    if (!track) return;
    var slides = track.children.length, i = 0, timer;
    var dotsWrap = document.getElementById('hfmDots');
    for (var d = 0; d < slides; d++) {
      var b = document.createElement('button');
      b.className = 'hfm-dot' + (d === 0 ? ' on' : ''); b.type = 'button';
      b.setAttribute('aria-label', 'Review ' + (d + 1));
      (function (n) { b.onclick = function () { go(n); reset(); }; })(d);
      dotsWrap.appendChild(b);
    }
    var dots = dotsWrap.children;
    function go(n) { i = (n + slides) % slides; track.style.transform = 'translateX(' + (-i * 100) + '%)'; for (var k = 0; k < dots.length; k++) dots[k].classList.toggle('on', k === i); }
    function reset() { clearInterval(timer); timer = setInterval(function () { go(i + 1); }, 6000); }
    var prev = document.getElementById('hfmPrev'), next = document.getElementById('hfmNext');
    if (prev) prev.onclick = function () { go(i - 1); reset(); };
    if (next) next.onclick = function () { go(i + 1); reset(); };
    var car = track.closest('.hfm-rev-carousel');
    if (car) { car.addEventListener('mouseenter', function () { clearInterval(timer); }); car.addEventListener('mouseleave', reset); }
    reset();
  })();

  // Shop Notes category filter. Guarded: no-op without the chip bar.
  (function () {
    var chips = document.getElementById('catChips');
    if (!chips) return;
    var links = [].slice.call(chips.querySelectorAll('a'));
    var posts = [].slice.call(document.querySelectorAll('[data-cat]'));
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        links.forEach(function (x) { x.classList.remove('on'); });
        a.classList.add('on');
        var f = a.getAttribute('data-filter');
        posts.forEach(function (p) {
          p.style.display = (f === 'all' || p.getAttribute('data-cat') === f) ? '' : 'none';
        });
      });
    });
  })();

  // Nav dropdowns (Makes mega + Why Us cards): identical hover-intent.
  (function () {
    var dds = [].slice.call(document.querySelectorAll('#makesMenu, .nav .has-menu'));
    function closeAll(except) { dds.forEach(function (o) { if (o !== except) o.classList.remove('open'); }); }
    dds.forEach(function (dd) {
      var t;
      dd.addEventListener('mouseenter', function () { clearTimeout(t); closeAll(dd); dd.classList.add('open'); });
      dd.addEventListener('mouseleave', function () { clearTimeout(t); t = setTimeout(function () { dd.classList.remove('open'); }, 140); });
      dd.querySelectorAll('a.mtile, a.ctile').forEach(function (a) { a.addEventListener('click', function () { dd.classList.remove('open'); }); });
    });
    document.querySelectorAll('.nav > a').forEach(function (el) { el.addEventListener('mouseenter', function () { closeAll(null); }); });
  })();

  // Make-picker bar. Persists choice in localStorage and personalizes soft copy only
  // ([data-make-tpl] with {make}, and [data-make-word]). SEO-critical H1/title/meta stay static.
  (function () {
    var KEY = 'gcs_make';
    var bar = document.getElementById('carbar');
    if (!bar) return;
    var chips = [].slice.call(bar.querySelectorAll('.cb-chip'));
    var resetBtn = document.getElementById('cbReset');
    var cbText = bar.querySelector('.cb-text');
    var targets = [].slice.call(document.querySelectorAll('[data-make-tpl]'));
    var words = [].slice.call(document.querySelectorAll('[data-make-word]'));
    targets.forEach(function (el) { if (el.getAttribute('data-def') === null) el.setAttribute('data-def', el.textContent.trim()); });
    words.forEach(function (el) { if (el.getAttribute('data-def') === null) el.setAttribute('data-def', el.textContent.trim()); });
    var sel = document.getElementById('apptMake');
    var pageDefault = bar.getAttribute('data-default-make') || null;
    function render() {
      var stored = localStorage.getItem(KEY);
      var hi = stored || pageDefault;
      chips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-make') === hi); });
      bar.classList.toggle('chosen', !!stored);
      if (resetBtn) resetBtn.hidden = !stored;
      if (cbText) cbText.textContent = stored ? ("You're set up for your " + stored) : 'Choose your make';
      targets.forEach(function (el) { el.textContent = stored ? el.getAttribute('data-make-tpl').split('{make}').join(stored) : el.getAttribute('data-def'); });
      words.forEach(function (el) { el.textContent = stored ? stored : el.getAttribute('data-def'); });
      if (sel && stored) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value.indexOf(stored) === 0) { sel.selectedIndex = i; break; } } }
    }
    chips.forEach(function (c) { c.addEventListener('click', function () { localStorage.setItem(KEY, c.getAttribute('data-make')); render(); }); });
    if (resetBtn) resetBtn.addEventListener('click', function () { localStorage.removeItem(KEY); render(); });
    render();
  })();

  // Booking / estimate / question form → POST /api/appointment (Shopmonkey + shop email).
  (function () {
    var form = document.getElementById('bkForm');
    if (!form) return;
    var btn = document.getElementById('submitBtn');
    var btnText = document.getElementById('btnText');
    var body = document.getElementById('formBody');
    var success = document.getElementById('formSuccess');
    var note = document.getElementById('formNote');
    var defaultNote = note ? note.textContent : '';

    // Custom drop-off date picker. Native <input type=date min> is only a hint in
    // several browsers (Firefox desktop, some mobile pickers let you navigate/type
    // earlier dates), so we render our own calendar and ONLY ever expose selectable
    // days. Floor = the later of today / June 24, 2026 — disabled days can't be
    // clicked or typed, so an invalid date can never reach the form.
    (function () {
      var trigger = document.getElementById('dpTrigger');
      var pop = document.getElementById('dpPop');
      var hidden = document.getElementById('dpValue');
      var labelEl = document.getElementById('dpLabel');
      if (!trigger || !pop || !hidden || !labelEl) return;

      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var iso = function (dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); };

      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var OPEN = new Date(2026, 5, 24); // June 24, 2026 (month is 0-based)
      var floor = today.getTime() > OPEN.getTime() ? today : OPEN;
      var cap = new Date(floor.getFullYear() + 1, floor.getMonth(), floor.getDate()); // up to a year out
      var viewY = floor.getFullYear(), viewM = floor.getMonth();
      var selected = null;

      var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      var DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      var WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      var CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
      var CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

      function fmt(dt) { return WD[dt.getDay()] + ', ' + MONTHS[dt.getMonth()].slice(0, 3) + ' ' + dt.getDate() + ', ' + dt.getFullYear(); }

      function render() {
        var startDow = new Date(viewY, viewM, 1).getDay();
        var daysIn = new Date(viewY, viewM + 1, 0).getDate();
        var prevDisabled = viewY < floor.getFullYear() || (viewY === floor.getFullYear() && viewM <= floor.getMonth());
        var nextDisabled = viewY > cap.getFullYear() || (viewY === cap.getFullYear() && viewM >= cap.getMonth());
        var html = '<div class="dp-head">'
          + '<button type="button" class="dp-nav" data-nav="-1"' + (prevDisabled ? ' disabled' : '') + ' aria-label="Previous month">' + CHEV_L + '</button>'
          + '<span class="dp-title">' + MONTHS[viewM] + ' ' + viewY + '</span>'
          + '<button type="button" class="dp-nav" data-nav="1"' + (nextDisabled ? ' disabled' : '') + ' aria-label="Next month">' + CHEV_R + '</button>'
          + '</div><div class="dp-dow">';
        var i;
        for (i = 0; i < 7; i++) html += '<span>' + DOW[i] + '</span>';
        html += '</div><div class="dp-grid">';
        for (i = 0; i < startDow; i++) html += '<button type="button" class="dp-day empty" disabled tabindex="-1"></button>';
        for (var day = 1; day <= daysIn; day++) {
          var cur = new Date(viewY, viewM, day);
          var dis = cur.getTime() < floor.getTime() || cur.getTime() > cap.getTime();
          var cls = 'dp-day';
          if (cur.getTime() === today.getTime()) cls += ' today';
          if (selected && cur.getTime() === selected.getTime()) cls += ' sel';
          html += '<button type="button" class="' + cls + '"' + (dis ? ' disabled' : ' data-day="' + iso(cur) + '"') + '>' + day + '</button>';
        }
        html += '</div>';
        if (selected) html += '<div class="dp-foot"><button type="button" class="dp-clear" data-clear>Clear date</button></div>';
        pop.innerHTML = html;
      }

      function open() { render(); pop.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
      function close() { pop.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }

      trigger.addEventListener('click', function () { if (pop.hidden) open(); else close(); });

      pop.addEventListener('click', function (ev) {
        var nav = ev.target.closest('[data-nav]');
        if (nav) {
          viewM += parseInt(nav.getAttribute('data-nav'), 10);
          if (viewM < 0) { viewM = 11; viewY--; } else if (viewM > 11) { viewM = 0; viewY++; }
          render(); return;
        }
        if (ev.target.closest('[data-clear]')) {
          selected = null; hidden.value = '';
          labelEl.textContent = 'Choose a date'; labelEl.classList.remove('set');
          close(); return;
        }
        var dayBtn = ev.target.closest('[data-day]');
        if (dayBtn) {
          var v = dayBtn.getAttribute('data-day'), p = v.split('-');
          selected = new Date(+p[0], +p[1] - 1, +p[2]);
          hidden.value = v;
          labelEl.textContent = fmt(selected); labelEl.classList.add('set');
          close();
        }
      });

      document.addEventListener('click', function (ev) {
        if (!pop.hidden && !ev.target.closest('#datePicker')) close();
      });
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && !pop.hidden) close();
      });
    })();

    // VIN lookup: decode a 17-char VIN via NHTSA (free, no key) and auto-fill
    // Make + Model & year — same idea as Shopmonkey's embed VIN lookup.
    var vinEl = form.querySelector('[name="vin"]');
    var makeEl = document.getElementById('apptMake');
    var modelEl = form.querySelector('[name="model"]');
    var lastVin = '';
    function decodeVin() {
      if (!vinEl) return;
      var vin = (vinEl.value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (vin.length !== 17 || vin === lastVin) return;
      lastVin = vin;
      fetch('https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/' + vin + '?format=json')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var v = d && d.Results && d.Results[0];
          if (!v) return;
          if (makeEl && v.Make) {
            var mk = v.Make.toUpperCase(), matched = false, i;
            for (i = 0; i < makeEl.options.length; i++) {
              var opt = makeEl.options[i].text.toUpperCase();
              if (opt.indexOf(mk) === 0 || mk.indexOf(opt) === 0) { makeEl.selectedIndex = i; matched = true; break; }
            }
            if (!matched) for (i = 0; i < makeEl.options.length; i++) {
              if (/other/i.test(makeEl.options[i].text)) { makeEl.selectedIndex = i; break; }
            }
          }
          if (modelEl && v.Model) modelEl.value = ((v.ModelYear || '') + ' ' + v.Model).trim();
        })
        .catch(function () {});
    }
    if (vinEl) { vinEl.addEventListener('input', decodeVin); vinEl.addEventListener('change', decodeVin); }

    // Phone field: live-format as (111) 111-1111 while typing.
    var phoneEl = form.querySelector('[name="phone"]');
    if (phoneEl) phoneEl.addEventListener('input', function () {
      var d = phoneEl.value.replace(/\D/g, '').slice(0, 10);
      var out = d;
      if (d.length > 6) out = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
      else if (d.length > 3) out = '(' + d.slice(0, 3) + ') ' + d.slice(3);
      else if (d.length > 0) out = '(' + d;
      phoneEl.value = out;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = 'Sending…';
      if (note) { note.style.color = ''; note.textContent = defaultNote; }

      fetch('/api/appointment', { method: 'POST', body: new FormData(form) })
        .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok && r.j && r.j.success) {
            if (body) body.style.display = 'none';
            if (note) note.style.display = 'none';
            if (success) success.classList.add('show');
          } else {
            throw new Error((r.j && r.j.error) || 'Request failed');
          }
        })
        .catch(function (err) {
          if (btn) btn.disabled = false;
          if (btnText) btnText.textContent = 'Request Appointment';
          if (note) { note.style.color = '#b00020'; note.textContent = err.message + ' — or call us at (210) 399-1172.'; }
        });
    });
  })();

  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
})();
