/* ============================================================
   雾记 · 数据层  —  db.js
   IndexedDB 持久化：灵感记录 / 分组 / 图片（压缩后 dataURL）
   ============================================================ */
(function (global) {
  'use strict';

  var DB_NAME = 'wuji_db';
  var DB_VER = 1;
  var db = null;

  var GROUP_COLORS = ['#6b9aa8', '#c08f7e', '#8fa87c', '#a68fb8', '#c2a25e', '#7e93b5', '#b87f8f', '#6fa69a'];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function open() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      if (!global.indexedDB) return reject(new Error('当前环境不支持本地存储'));
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('notes')) {
          var notes = d.createObjectStore('notes', { keyPath: 'id' });
          notes.createIndex('createdAt', 'createdAt');
          notes.createIndex('groupId', 'groupId');
        }
        if (!d.objectStoreNames.contains('groups')) {
          var groups = d.createObjectStore('groups', { keyPath: 'id' });
          groups.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error || new Error('打开数据库失败')); };
      req.onblocked = function () { reject(new Error('数据库被其他页面占用，请关闭后重试')); };
    });
  }

  function run(storeName, mode, action) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(storeName, mode);
        var store = t.objectStore(storeName);
        var req = null;
        var plain = null;
        try {
          var out = action(store);
          if (out && 'onsuccess' in out && 'result' in out) req = out;
          else plain = out;
        } catch (err) { reject(err); return; }
        t.oncomplete = function () { resolve(req ? req.result : plain); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('事务被中止')); };
      });
    });
  }

  function getAll(storeName) {
    return run(storeName, 'readonly', function (s) { return s.getAll(); });
  }

  function byTimeDesc(a, b) { return b.createdAt - a.createdAt; }

  /* ---------------- 灵感记录 ---------------- */

  function addNote(data) {
    var note = {
      id: uid(),
      text: (data.text || '').trim(),
      images: data.images || [],
      audios: data.audios || [],
      groupId: data.groupId || '',
      createdAt: data.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    return run('notes', 'readwrite', function (s) { return s.put(note); }).then(function () { return note; });
  }

  function updateNote(id, data) {
    return getNote(id).then(function (note) {
      if (!note) throw new Error('记录不存在');
      var next = Object.assign({}, note, data, { id: id, updatedAt: Date.now() });
      return run('notes', 'readwrite', function (s) { return s.put(next); }).then(function () { return next; });
    });
  }

  function getNote(id) {
    return run('notes', 'readonly', function (s) { return s.get(id); });
  }

  function deleteNote(id) {
    return run('notes', 'readwrite', function (s) { return s.delete(id); });
  }

  /* 查询：groupId 为空表示全部，keyword 匹配文字，默认时间倒序 */
  function getNotes(opts) {
    opts = opts || {};
    return getAll('notes').then(function (list) {
      var out = list;
      if (opts.groupId) {
        out = out.filter(function (n) { return n.groupId === opts.groupId; });
      }
      if (opts.keyword) {
        var kw = String(opts.keyword).toLowerCase();
        out = out.filter(function (n) { return (n.text || '').toLowerCase().indexOf(kw) !== -1; });
      }
      out.sort(byTimeDesc);
      if (opts.limit) out = out.slice(0, opts.limit);
      return out;
    });
  }

  function getNotesByMonth(year, month) {
    var from = new Date(year, month, 1).getTime();
    var to = new Date(year, month + 1, 1).getTime();
    return getAll('notes').then(function (list) {
      return list.filter(function (n) { return n.createdAt >= from && n.createdAt < to; }).sort(byTimeDesc);
    });
  }

  /* ---------------- 分组 ---------------- */

  function pickColor(groups) {
    var used = groups.map(function (g) { return g.color; });
    for (var i = 0; i < GROUP_COLORS.length; i++) {
      if (used.indexOf(GROUP_COLORS[i]) === -1) return GROUP_COLORS[i];
    }
    return GROUP_COLORS[groups.length % GROUP_COLORS.length];
  }

  function getGroups() {
    return getAll('groups').then(function (list) { return list.sort(function (a, b) { return a.createdAt - b.createdAt; }); });
  }

  function addGroup(name) {
    var clean = String(name || '').trim();
    if (!clean) return Promise.reject(new Error('分组名不能为空'));
    return getGroups().then(function (list) {
      if (list.some(function (g) { return g.name === clean; })) return Promise.reject(new Error('已有同名分组'));
      var group = { id: uid(), name: clean, color: pickColor(list), createdAt: Date.now() };
      return run('groups', 'readwrite', function (s) { return s.put(group); }).then(function () { return group; });
    });
  }

  function updateGroup(id, patch) {
    return run('groups', 'readwrite', function (s) {
      var req = s.get(id);
      req.onsuccess = function () {
        var g = req.result;
        if (!g) return;
        s.put(Object.assign({}, g, patch, { id: id }));
      };
    }).then(function () { return getGroups(); });
  }

  function deleteGroup(id) {
    return run('groups', 'readwrite', function (s) { return s.delete(id); }).then(function () {
      return getAll('notes').then(function (notes) {
        var affected = notes.filter(function (n) { return n.groupId === id; });
        if (!affected.length) return;
        return run('notes', 'readwrite', function (s) {
          affected.forEach(function (n) { s.put(Object.assign({}, n, { groupId: '', updatedAt: Date.now() })); });
        });
      });
    });
  }

  function groupCounts() {
    return getAll('notes').then(function (notes) {
      var map = {};
      notes.forEach(function (n) { var k = n.groupId || '__none__'; map[k] = (map[k] || 0) + 1; });
      return map;
    });
  }

  /* ---------------- 备份 / 恢复 ---------------- */

  function exportAll() {
    return Promise.all([getAll('notes'), getAll('groups')]).then(function (r) {
      return { app: 'wuji', version: 1, exportedAt: Date.now(), notes: r[0], groups: r[1] };
    });
  }

  function importAll(data) {
    if (!data || !Array.isArray(data.notes) || !Array.isArray(data.groups)) {
      return Promise.reject(new Error('文件格式不正确'));
    }
    return Promise.all([
      run('notes', 'readwrite', function (s) {
        data.notes.forEach(function (n) { if (n && n.id) s.put(n); });
      }),
      run('groups', 'readwrite', function (s) {
        data.groups.forEach(function (g) { if (g && g.id) s.put(g); });
      })
    ]);
  }

  function clearAll() {
    return Promise.all([
      run('notes', 'readwrite', function (s) { return s.clear(); }),
      run('groups', 'readwrite', function (s) { return s.clear(); })
    ]);
  }

  /* ---------------- 图片压缩 ---------------- */
  function compressImage(file, maxSize, quality) {
    maxSize = maxSize || 1280;
    quality = quality || 0.72;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解码失败')); };
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxSize / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try { resolve(canvas.toDataURL('image/jpeg', quality)); }
          catch (e) { reject(e); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  global.DB = {
    uid: uid,
    GROUP_COLORS: GROUP_COLORS,
    addNote: addNote,
    updateNote: updateNote,
    getNote: getNote,
    deleteNote: deleteNote,
    getNotes: getNotes,
    getNotesByMonth: getNotesByMonth,
    getGroups: getGroups,
    addGroup: addGroup,
    updateGroup: updateGroup,
    deleteGroup: deleteGroup,
    groupCounts: groupCounts,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    compressImage: compressImage
  };
})(window);
