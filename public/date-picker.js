// public/date-picker.js
// Reusable, dependency-free calendar date picker shared by the appointments form
// (/appointments) and the shop's settings page (/admin/booking) so they look and
// behave identically. Native <input type=date min> is only a hint in Firefox/some
// mobile browsers (you can navigate/type blocked dates), so we render our own
// calendar and ONLY expose selectable days.
//
// Usage:
//   var dp = initDatePicker({
//     mount: el,                 // container element to render into
//     name: 'date',              // hidden <input> name submitted with the form
//     value: '2026-06-24',       // optional initial selection (YYYY-MM-DD)
//     floor: new Date(2026,5,24),// earliest selectable (default: today)
//     cap:   new Date(...),      // latest selectable (default: floor + 1 year)
//     placeholder: 'Choose a date',
//     allowClear: true,          // show a "Clear date" button (default true)
//     isDisabled: function (d) { return false; }, // EXTRA per-day block on top of
//                                // floor/cap — e.g. blackout dates or closed weekdays
//     onChange: function (iso) {} // fires when the selection changes ('' when cleared)
//   });
//   dp.setFloor(date) · dp.setValue(iso|null) · dp.getValue() · dp.open() · dp.close()
(function () {
  function ensureStyles() {
    if (document.getElementById('gcs-dp-styles')) return;
    var css =
      '.dp{position:relative;}'
      + '.dp-trigger{width:100%;box-sizing:border-box;height:52px;display:flex;align-items:center;gap:10px;border:1.5px solid var(--fog,#e3e7ee);border-radius:10px;background:#fff;padding:0 14px;cursor:pointer;font:inherit;color:var(--navy,#16233b);text-align:left;transition:border-color .15s,box-shadow .15s;}'
      + '.dp-trigger:hover{border-color:var(--acc,#af0d19);}'
      + '.dp-trigger[aria-expanded="true"]{border-color:var(--acc,#af0d19);box-shadow:0 0 0 3px rgba(175,13,25,.1);}'
      + '.dp-cal{width:18px;height:18px;color:var(--steel-400,#647084);flex:none;}'
      + '.dp-label{flex:1;font-size:15px;color:var(--steel-400,#647084);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.dp-label.set{color:var(--navy,#16233b);font-weight:600;}'
      + '.dp-caret{width:16px;height:16px;color:var(--steel-400,#647084);flex:none;transition:transform .15s;}'
      + '.dp-trigger[aria-expanded="true"] .dp-caret{transform:rotate(180deg);}'
      + '.dp-pop{position:absolute;z-index:50;top:calc(100% + 6px);left:0;width:300px;max-width:calc(100vw - 56px);background:#fff;border:1px solid var(--fog,#e3e7ee);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.22);padding:14px;}'
      + '.dp-pop.up{top:auto;bottom:calc(100% + 6px);}'
      + '.dp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}'
      + '.dp-title{font-weight:800;font-size:15px;color:var(--navy,#16233b);}'
      + '.dp-nav{width:34px;height:34px;border-radius:8px;border:1px solid var(--fog,#e3e7ee);background:#fff;display:grid;place-items:center;cursor:pointer;color:var(--navy,#16233b);padding:0;}'
      + '.dp-nav:hover:not(:disabled){border-color:var(--acc,#af0d19);color:var(--acc,#af0d19);}'
      + '.dp-nav:disabled{opacity:.3;cursor:default;}'
      + '.dp-nav svg{width:16px;height:16px;}'
      + '.dp-dow{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;margin-bottom:4px;}'
      + '.dp-dow span{text-align:center;font-size:11px;font-weight:700;color:var(--steel-400,#647084);padding:4px 0;}'
      + '.dp-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;}'
      + '.dp-day{aspect-ratio:1;border:none;background:none;border-radius:8px;font-size:14px;color:var(--navy,#16233b);cursor:pointer;display:grid;place-items:center;font-weight:500;padding:0;}'
      + '.dp-day:hover:not(:disabled):not(.sel){background:var(--mist,#f4f6fa);}'
      + '.dp-day:disabled{color:#c5cbd4;cursor:default;}'
      + '.dp-day.empty{visibility:hidden;}'
      + '.dp-day.today{box-shadow:inset 0 0 0 1.5px var(--fog,#e3e7ee);}'
      + '.dp-day.sel{background:var(--acc,#af0d19);color:#fff;font-weight:700;}'
      + '.dp-foot{display:flex;justify-content:flex-end;margin-top:10px;padding-top:10px;border-top:1px solid var(--fog,#e3e7ee);}'
      + '.dp-clear{background:none;border:none;color:var(--steel-400,#647084);font-size:13px;cursor:pointer;font-weight:600;padding:0;}'
      + '.dp-clear:hover{color:var(--acc,#af0d19);}';
    var s = document.createElement('style');
    s.id = 'gcs-dp-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  var CAL = '<svg class="dp-cal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseISO(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt(d) { return WD[d.getDay()] + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear(); }

  window.initDatePicker = function (opts) {
    ensureStyles();
    var mount = opts.mount;
    if (!mount) return null;
    var name = opts.name || 'date';
    var placeholder = opts.placeholder || 'Choose a date';
    var allowClear = opts.allowClear !== false;
    var extraDisabled = typeof opts.isDisabled === 'function' ? opts.isDisabled : function () { return false; };
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    var today = midnight(new Date());
    var floor = opts.floor ? midnight(opts.floor) : today;
    var cap = opts.cap ? midnight(opts.cap) : new Date(floor.getFullYear() + 1, floor.getMonth(), floor.getDate());
    var selected = opts.value ? midnight(parseISO(opts.value)) : null;
    var viewY, viewM;
    function resetView() { var base = selected || floor; viewY = base.getFullYear(); viewM = base.getMonth(); }
    resetView();

    mount.classList.add('dp');
    mount.innerHTML =
      '<button type="button" class="dp-trigger" aria-haspopup="dialog" aria-expanded="false">'
      + CAL + '<span class="dp-label">' + placeholder + '</span>'
      + '<svg class="dp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      + '</button>'
      + '<input type="hidden" name="' + name + '">'
      + '<div class="dp-pop" hidden></div>';
    var trigger = mount.querySelector('.dp-trigger');
    var labelEl = mount.querySelector('.dp-label');
    var hidden = mount.querySelector('input[type="hidden"]');
    var pop = mount.querySelector('.dp-pop');

    function dayDisabled(d) {
      return d.getTime() < floor.getTime() || d.getTime() > cap.getTime() || extraDisabled(d);
    }

    function syncLabel() {
      if (selected) { labelEl.textContent = fmt(selected); labelEl.classList.add('set'); hidden.value = iso(selected); }
      else { labelEl.textContent = placeholder; labelEl.classList.remove('set'); hidden.value = ''; }
    }
    syncLabel();

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
        var dis = dayDisabled(cur);
        var cls = 'dp-day';
        if (cur.getTime() === today.getTime()) cls += ' today';
        if (selected && cur.getTime() === selected.getTime()) cls += ' sel';
        html += '<button type="button" class="' + cls + '"' + (dis ? ' disabled' : ' data-day="' + iso(cur) + '"') + '>' + day + '</button>';
      }
      html += '</div>';
      if (allowClear && selected) html += '<div class="dp-foot"><button type="button" class="dp-clear" data-clear>Clear date</button></div>';
      pop.innerHTML = html;
    }

    function open() {
      render();
      pop.classList.remove('up');
      pop.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      // Flip above the field if the calendar would run off the bottom of the viewport.
      var rect = trigger.getBoundingClientRect();
      if (rect.bottom + 6 + pop.offsetHeight > window.innerHeight && rect.top - 6 - pop.offsetHeight > 0) {
        pop.classList.add('up');
      }
    }
    function close() { pop.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }

    trigger.addEventListener('click', function () { if (pop.hidden) open(); else close(); });

    pop.addEventListener('click', function (ev) {
      // Stop this click from reaching the document outside-click handler — render()
      // replaces the clicked node, so its closest() check would later fail and the
      // calendar would wrongly close when changing month.
      ev.stopPropagation();
      var nav = ev.target.closest('[data-nav]');
      if (nav) {
        viewM += parseInt(nav.getAttribute('data-nav'), 10);
        if (viewM < 0) { viewM = 11; viewY--; } else if (viewM > 11) { viewM = 0; viewY++; }
        render(); return;
      }
      if (ev.target.closest('[data-clear]')) {
        selected = null; syncLabel(); close(); onChange(''); return;
      }
      var dayBtn = ev.target.closest('[data-day]');
      if (dayBtn) {
        selected = parseISO(dayBtn.getAttribute('data-day'));
        syncLabel(); close(); onChange(iso(selected));
      }
    });

    function onDocClick(ev) { if (!pop.hidden && !mount.contains(ev.target)) close(); }
    function onKey(ev) { if (ev.key === 'Escape' && !pop.hidden) close(); }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);

    return {
      el: mount,
      getValue: function () { return hidden.value || ''; },
      setValue: function (v) {
        selected = v ? midnight(parseISO(v)) : null;
        resetView(); syncLabel(); if (!pop.hidden) render();
      },
      setFloor: function (date) {
        floor = midnight(date);
        if (cap.getTime() < floor.getTime()) cap = new Date(floor.getFullYear() + 1, floor.getMonth(), floor.getDate());
        if (!selected) resetView();
        if (!pop.hidden) render();
      },
      open: open,
      close: close,
    };
  };
})();
