/* ============================================================
   雾记 · 月度总结  —  summary.js
   ============================================================ */
(function (global) {
  'use strict';

  var STOP = ('的 了 和 是 在 我 有 也 就 不 人 都 一 一个 上 下 中 大 小 这 那 里 与 及 或 但 把 被 让 对 从 到 说 想 会 能 要 时 候 东 西 什么 怎么 因为 所以 然后 还有 自己 一个 可以 已经 真的 感觉 觉得 这样 那样 没有 可能 就是 不是 一直 一些 现在 今天 昨天 明天 时候 东西').split(/\s+/);

  var view = new Date();
  var year = view.getFullYear();
  var month = view.getMonth();

  function pad(n) { return String(n).padStart(2, '0'); }

  function updateLabel() {
    var label = document.getElementById('monthLabel');
    if (label) label.textContent = year + '年' + (month + 1) + '月';
    var now = new Date();
    var next = document.getElementById('nextMonth');
    if (next) next.disabled = (year === now.getFullYear() && month === now.getMonth());
  }

  function levelOf(n) {
    if (!n) return 0;
    if (n === 1) return 1;
    if (n <= 3) return 2;
    if (n <= 6) return 3;
    return 4;
  }

  function renderHeatmap(notes) {
    var box = document.getElementById('heatmap');
    if (!box) return;
    box.innerHTML = '';

    var days = new Date(year, month + 1, 0).getDate();
    var firstDow = new Date(year, month, 1).getDay(); // 0=周日
    var lead = (firstDow + 6) % 7; // 周一开头
    var counts = new Array(days + 1).fill(0);
    notes.forEach(function (n) {
      var d = new Date(n.createdAt);
      if (d.getFullYear() === year && d.getMonth() === month) counts[d.getDate()]++;
    });

    var today = new Date();
    for (var i = 0; i < lead; i++) {
      var blank = document.createElement('div');
      blank.className = 'heat-cell blank';
      box.appendChild(blank);
    }
    for (var day = 1; day <= days; day++) {
      var cell = document.createElement('div');
      cell.className = 'heat-cell l' + levelOf(counts[day]);
      if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
        cell.classList.add('today');
      }
      cell.title = (month + 1) + '月' + day + '日 · ' + counts[day] + ' 条';
      box.appendChild(cell);
    }
  }

  function renderBars(notes, groups) {
    var box = document.getElementById('groupBars');
    if (!box) return;
    box.innerHTML = '';
    var counts = {};
    notes.forEach(function (n) { var k = n.groupId || ''; counts[k] = (counts[k] || 0) + 1; });

    var rows = groups.map(function (g) { return { name: g.name, count: counts[g.id] || 0, color: g.color }; });
    if (counts['']) rows.push({ name: '未分组', count: counts[''], color: '#8ba0a8' });
    rows = rows.filter(function (r) { return r.count > 0; }).sort(function (a, b) { return b.count - a.count; });

    if (!rows.length) { box.innerHTML = '<p class="no-data">本月还没有记录</p>'; return; }
    var max = rows[0].count;
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = '<span class="bar-name">' + UI.esc(r.name) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + Math.max(6, Math.round(r.count / max * 100)) + '%;background:' + UI.esc(r.color || 'var(--accent)') + '"></span></span>' +
        '<span class="bar-val">' + r.count + '</span>';
      box.appendChild(row);
    });
  }

  function renderWords(notes) {
    var box = document.getElementById('wordCloud');
    if (!box) return;
    box.innerHTML = '';
    var freq = {};
    notes.forEach(function (n) {
      var text = n.text || '';
      var segs = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      segs.forEach(function (seg) {
        for (var i = 0; i < seg.length - 1; i++) {
          var w = seg.slice(i, i + 2);
          if (STOP.indexOf(w) !== -1) continue;
          freq[w] = (freq[w] || 0) + 1;
        }
      });
    });
    var list = Object.keys(freq).map(function (k) { return { w: k, n: freq[k] }; })
      .filter(function (o) { return o.n >= 2; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 14);

    if (!list.length) { box.innerHTML = '<p class="no-data">再记录一些文字，就能看到高频词了</p>'; return; }
    list.forEach(function (o) {
      var tag = document.createElement('span');
      tag.className = 'word';
      tag.textContent = o.w;
      tag.style.fontSize = (11 + Math.min(o.n, 8)) + 'px';
      box.appendChild(tag);
    });
  }

  function render() {
    updateLabel();
    return Promise.all([DB.getNotesByMonth(year, month), DB.getGroups()]).then(function (r) {
      var notes = r[0], groups = r[1];
      var activeDays = {};
      var photos = 0;
      notes.forEach(function (n) {
        activeDays[new Date(n.createdAt).getDate()] = 1;
        photos += (n.images || []).length;
      });
      var totalEl = document.getElementById('statTotal');
      var activeEl = document.getElementById('statActive');
      var photoEl = document.getElementById('statPhotos');
      if (totalEl) totalEl.textContent = notes.length;
      if (activeEl) activeEl.textContent = Object.keys(activeDays).length;
      if (photoEl) photoEl.textContent = photos;
      renderHeatmap(notes);
      renderBars(notes, groups);
      renderWords(notes);
    });
  }

  function changeMonth(delta) {
    var d = new Date(year, month + delta, 1);
    var now = new Date();
    if (d > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    year = d.getFullYear();
    month = d.getMonth();
    render();
  }

  function resetToNow() {
    var d = new Date();
    year = d.getFullYear(); month = d.getMonth();
    updateLabel();
  }

  global.Summary = { render: render, changeMonth: changeMonth, resetToNow: resetToNow };
})(window);
