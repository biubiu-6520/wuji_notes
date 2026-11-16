/* ============================================================
   雾记 · 背景引擎  —  background.js
   把天气 + 时间映射为 body[data-mood]，驱动 CSS 雾化氛围
   ============================================================ */
(function (global) {
  'use strict';

  var PHASE_CN = { dawn: '清晨', day: '白昼', dusk: '黄昏', night: '夜晚' };
  var lastPhase = null;
  var onPhaseChange = null;

  function updateLine(data) {
    var line = document.getElementById('weatherLine');
    if (!line) return;
    if (!data) { line.textContent = '正在感知此刻天气…'; return; }
    var parts = [];
    if (data.city) parts.push(data.city);
    if (data.desc) parts.push(data.desc);
    if (typeof data.temp === 'number') parts.push(data.temp + '°');
    if (PHASE_CN[data.phase]) parts.push(PHASE_CN[data.phase]);
    line.textContent = parts.join(' · ') || '雾记';
  }

  function apply(data) {
    var mode = Weather.getMode();
    var phase = Weather.timePhase(new Date(), data && data.isDay);

    if (!data && mode === 'auto') data = Weather.getCached() || Weather.timeOnly();

    var mood;
    if (mode === 'off') {
      mood = 'cloudy';
    } else if (mode === 'time') {
      mood = 'clear-' + Weather.timePhase(new Date(), null);
    } else {
      mood = data.mood || Weather.deriveMood((data && data.wxKey) || 'clear', phase);
    }

    document.body.setAttribute('data-mood', mood);
    document.body.setAttribute('data-weather', mode === 'auto' && data ? (data.wxKey || '') : '');
    document.body.classList.toggle('no-ambient', mode === 'off');
    updateLine(data);
    lastPhase = phase;
  }

  function start(phaseHandler) {
    onPhaseChange = phaseHandler || null;
    if (global.__wujiBgTimer) clearInterval(global.__wujiBgTimer);
    global.__wujiBgTimer = setInterval(function () {
      var current = Weather.timePhase(new Date(), null);
      if (current !== lastPhase) {
        lastPhase = current;
        if (onPhaseChange) onPhaseChange(current);
      }
    }, 60 * 1000);
  }

  global.Background = { apply: apply, start: start, updateLine: updateLine };
})(window);
