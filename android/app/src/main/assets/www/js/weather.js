/* ============================================================
   雾记 · 天气模块  —  weather.js
   Open-Meteo 免密钥天气 + 浏览器定位 / IP 定位回退 + 本地缓存
   ============================================================ */
(function (global) {
  'use strict';

  var CACHE_KEY = 'wuji_weather_cache';
  var CITY_KEY = 'wuji_city';
  var MODE_KEY = 'wuji_bg_mode';
  var CACHE_TTL = 45 * 60 * 1000; // 45 分钟

  var CODE_DESC = {
    0: '晴', 1: '大部晴朗', 2: '局部多云', 3: '阴',
    45: '雾', 48: '雾凇',
    51: '小毛毛雨', 53: '毛毛雨', 55: '强毛毛雨', 56: '冻毛毛雨', 57: '强冻毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '阵雨', 81: '中阵雨', 82: '强阵雨', 85: '阵雪', 86: '强阵雪',
    95: '雷阵雨', 96: '雷暴伴冰雹', 99: '强雷暴伴冰雹'
  };

  function codeInfo(code) {
    var key = 'cloudy';
    if (code === 0 || code === 1) key = 'clear';
    else if (code === 2) key = 'partly';
    else if (code === 3) key = 'overcast';
    else if (code === 45 || code === 48) key = 'fog';
    else if (code >= 51 && code <= 57) key = 'drizzle';
    else if (code >= 61 && code <= 67 || code >= 80 && code <= 82) key = 'rain';
    else if (code >= 71 && code <= 77 || code >= 85 && code <= 86) key = 'snow';
    else if (code >= 95) key = 'storm';
    return { key: key, desc: CODE_DESC[code] || '天气多变' };
  }

  function getCity() { return (localStorage.getItem(CITY_KEY) || '').trim(); }
  function setCity(v) {
    v = (v || '').trim();
    if (v) localStorage.setItem(CITY_KEY, v); else localStorage.removeItem(CITY_KEY);
  }
  function getMode() { return localStorage.getItem(MODE_KEY) || 'auto'; }
  function setMode(m) {
    if (['auto', 'time', 'off'].indexOf(m) === -1) m = 'auto';
    localStorage.setItem(MODE_KEY, m);
  }

  function timePhase(date, isDay) {
    var h = (date || new Date()).getHours();
    if (isDay === 0) return 'night';
    if (h >= 5 && h < 8) return 'dawn';
    if (h >= 8 && h < 17) return 'day';
    if (h >= 17 && h < 20) return 'dusk';
    return 'night';
  }

  function deriveMood(wxKey, phase) {
    if (wxKey === 'clear' || wxKey === 'partly') return 'clear-' + phase;
    if (wxKey === 'overcast' || wxKey === 'cloudy') return phase === 'night' ? 'clear-night' : (wxKey === 'overcast' ? 'overcast' : 'cloudy');
    if (wxKey === 'fog') return 'fog';
    if (wxKey === 'drizzle' || wxKey === 'rain') return 'rain';
    if (wxKey === 'snow') return 'snow';
    if (wxKey === 'storm') return phase === 'night' ? 'storm' : 'storm';
    return phase === 'night' ? 'clear-night' : 'cloudy';
  }

  function fetchJSON(url, timeout) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctrl) ctrl.abort();
        reject(new Error('请求超时'));
      }, timeout || 9000);
      var opt = ctrl ? { signal: ctrl.signal } : {};
      fetch(url, opt).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (json) {
        if (done) return;
        done = true; clearTimeout(timer); resolve(json);
      }).catch(function (e) {
        if (done) return;
        done = true; clearTimeout(timer); reject(e);
      });
    });
  }

  function byCity(name) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(name) + '&count=1&language=zh&format=json';
    return fetchJSON(url, 9000).then(function (json) {
      var r = json && json.results && json.results[0];
      if (!r) throw new Error('未找到该城市');
      return { lat: r.latitude, lon: r.longitude, city: r.name };
    });
  }

  function byGeolocation() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('不支持定位'));
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('定位超时')); }
      }, 9000);
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: '' });
      }, function () {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(new Error('定位被拒绝'));
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 });
    });
  }

  function byIP() {
    return fetchJSON('https://ipwho.is/?lang=zh-CN', 9000).then(function (j) {
      if (!j || j.success === false || typeof j.latitude !== 'number') throw new Error('IP 定位失败');
      return { lat: j.latitude, lon: j.longitude, city: j.city || '' };
    });
  }

  function forecast(loc) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat +
      '&longitude=' + loc.lon +
      '&current=temperature_2m,weather_code,is_day&timezone=auto';
    return fetchJSON(url, 9000).then(function (j) {
      var cur = j && j.current;
      if (!cur || typeof cur.weather_code !== 'number') throw new Error('天气数据异常');
      return { code: cur.weather_code, temp: cur.temperature_2m, isDay: cur.is_day };
    });
  }

  function compose(loc, w, source) {
    var info = codeInfo(w.code);
    var now = new Date();
    var phase = timePhase(now, w.isDay);
    var mood = deriveMood(info.key, phase);
    var result = {
      city: loc.city || '当前位置',
      temp: Math.round(w.temp),
      code: w.code,
      desc: info.desc,
      wxKey: info.key,
      phase: phase,
      mood: mood,
      isDay: w.isDay,
      source: source,
      fetchedAt: Date.now()
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch (e) {}
    return result;
  }

  function timeOnly() {
    var phase = timePhase(new Date(), null);
    return {
      city: '离线模式', temp: null, code: null, desc: '按时间变化',
      wxKey: 'clear', phase: phase, mood: 'clear-' + phase,
      isDay: phase === 'night' ? 0 : 1, source: 'offline', fetchedAt: Date.now()
    };
  }

  function getCached() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.fetchedAt || Date.now() - data.fetchedAt > CACHE_TTL) return null;
      return data;
    } catch (e) { return null; }
  }

  function fetchWeather() {
    var city = getCity();
    var chain = city ? byCity(city) : byGeolocation().catch(function () { return byIP(); });

    return chain.catch(function (err) {
      // 手填城市失败时回退到定位，再回退到 IP
      if (city) return byGeolocation().catch(function () { return byIP(); });
      throw err;
    }).then(function (loc) {
      return forecast(loc).then(function (w) {
        return compose(loc, w, city ? 'city' : 'geo');
      });
    }).catch(function (err) {
      var cached = getCached();
      if (cached) return cached;
      throw err;
    });
  }

  global.Weather = {
    getCity: getCity, setCity: setCity,
    getMode: getMode, setMode: setMode,
    fetch: fetchWeather,
    getCached: getCached,
    timeOnly: timeOnly,
    codeInfo: codeInfo,
    deriveMood: deriveMood,
    timePhase: timePhase
  };
})(window);
