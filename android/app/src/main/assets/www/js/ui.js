/* ============================================================
   雾记 · 界面渲染  —  ui.js
   纯 DOM 渲染与面板状态，业务逻辑在 app.js
   ============================================================ */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var el = {};
  [
    'notesList', 'notesEmpty', 'listTitle', 'listMeta', 'listCount',
    'groupGrid', 'drawerGroups', 'editorGroup', 'editorText', 'editorTitle', 'editorImages',
    'editor', 'editorMask', 'drawer', 'drawerMask', 'groupDialog', 'dialogMask',
    'groupNameInput', 'groupDialogTitle', 'lightbox', 'lightboxImg',
    'confirmDialog', 'confirmMask', 'confirmTitle', 'confirmText', 'toast',
    'weatherLine', 'weatherStatus', 'cityInput', 'searchInput', 'searchWrap',
    'editorAudios', 'btnRecord', 'recordStatus', 'recordTime', 'btnStopRecord'
  ].forEach(function (id) { el[id] = $(id); });

  var editorImages = [];
  var editorAudios = [];
  var editingNoteId = null;
  var confirmCallback = null;
  var currentPage = 'notes';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return '今天 ' + hm;
    var yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return '昨天 ' + hm;
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('is-hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.add('is-hidden'); }, 2200);
  }

  function groupOf(groups, id) {
    for (var i = 0; i < groups.length; i++) if (groups[i].id === id) return groups[i];
    return null;
  }

  /* ---------------- 灵感列表 ---------------- */
  function renderNotes(notes, groups) {
    el.notesList.innerHTML = '';
    el.notesEmpty.classList.toggle('is-hidden', notes.length > 0);
    el.listCount.textContent = notes.length + ' 条';

    notes.forEach(function (n, idx) {
      var g = groupOf(groups, n.groupId);
      var card = document.createElement('article');
      card.className = 'note';
      card.style.animationDelay = Math.min(idx * 28, 240) + 'ms';
      card.dataset.id = n.id;

      var html = '';
      if (g) html += '<span class="note__group"><i></i>' + esc(g.name) + '</span>';
      var text = esc(n.text || '');
      if (!text && (!n.images || !n.images.length)) text = '<span style="opacity:.5">（无文字）</span>';
      html += '<p class="note__text clamp">' + text + '</p>';

      if (n.images && n.images.length) {
        html += '<div class="note__images">';
        n.images.forEach(function (src, i) {
          html += '<img class="note__img" data-idx="' + i + '" src="' + src + '" alt="配图 ' + (i + 1) + '">';
        });
        html += '</div>';
      }

      if (n.audios && n.audios.length) {
        html += '<div class="note__audios">';
        n.audios.forEach(function (a, i) {
          var secs = Math.round((a.duration || 0) / 1000);
          html += '<div class="note__audio"><span class="note__audio-ico">♪</span>' +
            '<audio controls preload="none" src="' + a.src + '"></audio>' +
            '<span class="note__audio-dur">' + (a.duration ? Recorder.fmt(a.duration) : secs + 's') + '</span></div>';
        });
        html += '</div>';
      }

      html += '<div class="note__foot">' +
        '<span class="note__time">' + fmtTime(n.createdAt) + '</span>' +
        '<span class="note__ops">' +
        '<button data-op="edit" title="编辑">✎</button>' +
        '<button data-op="delete" title="删除">✕</button>' +
        '</span></div>';

      card.innerHTML = html;
      el.notesList.appendChild(card);
    });
  }

  function setListHead(title, sub) {
    el.listTitle.textContent = title;
    if (sub) el.listMeta.textContent = sub;
  }

  /* ---------------- 分组 ---------------- */
  function renderGroupGrid(groups, counts) {
    el.groupGrid.innerHTML = '';
    if (!groups.length) {
      el.groupGrid.innerHTML = '<p class="no-data" style="grid-column:1/-1">还没有分组，点下方按钮创建一个。</p>';
      return;
    }
    groups.forEach(function (g) {
      var card = document.createElement('button');
      card.className = 'group-card';
      card.dataset.id = g.id;
      card.innerHTML =
        '<span class="group-card__dot" style="background:' + esc(g.color || '#6b9aa8') + '"></span>' +
        '<div class="group-card__name">' + esc(g.name) + '</div>' +
        '<div class="group-card__count">' + (counts[g.id] || 0) + ' 条灵感</div>' +
        '<span class="group-card__edit" data-edit="' + g.id + '">⋯</span>';
      el.groupGrid.appendChild(card);
    });
  }

  function renderDrawer(groups, counts, activeId) {
    el.drawerGroups.innerHTML = '';

    var all = document.createElement('button');
    all.className = 'drawer-item' + (!activeId ? ' is-on' : '');
    all.dataset.group = '';
    all.innerHTML = '<span class="drawer-item__dot" style="background:var(--accent)"></span>全部灵感' +
      '<span class="drawer-item__count">' + Object.keys(counts || {}).reduce(function (a, k) { return a + counts[k]; }, 0) + '</span>';
    el.drawerGroups.appendChild(all);

    groups.forEach(function (g) {
      var item = document.createElement('button');
      item.className = 'drawer-item' + (activeId === g.id ? ' is-on' : '');
      item.dataset.group = g.id;
      item.innerHTML = '<span class="drawer-item__dot" style="background:' + esc(g.color || '#6b9aa8') + '"></span>' +
        esc(g.name) + '<span class="drawer-item__count">' + (counts[g.id] || 0) + '</span>';
      el.drawerGroups.appendChild(item);
    });

    var noneCount = counts.__none__ || 0;
    if (noneCount) {
      var none = document.createElement('button');
      none.className = 'drawer-item' + (activeId === '__none__' ? ' is-on' : '');
      none.dataset.group = '__none__';
      none.innerHTML = '<span class="drawer-item__dot" style="background:var(--ink-faint)"></span>未分组' +
        '<span class="drawer-item__count">' + noneCount + '</span>';
      el.drawerGroups.appendChild(none);
    }
  }

  function renderGroupOptions(groups, selectedId) {
    el.editorGroup.innerHTML = '';
    var none = document.createElement('option');
    none.value = ''; none.textContent = '未分组';
    el.editorGroup.appendChild(none);
    groups.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id; o.textContent = g.name;
      el.editorGroup.appendChild(o);
    });
    el.editorGroup.value = selectedId || '';
  }

  /* ---------------- 编辑器 ---------------- */
  function renderEditorImages() {
    el.editorImages.innerHTML = '';
    editorImages.forEach(function (src, i) {
      var box = document.createElement('div');
      box.className = 'editor-img';
      box.innerHTML = '<img src="' + src + '" alt="配图 ' + (i + 1) + '"><button data-audio="0" data-idx="' + i + '">×</button>';
      el.editorImages.appendChild(box);
    });
  }

  function renderEditorAudios() {
    if (!el.editorAudios) return;
    el.editorAudios.innerHTML = '';
    editorAudios.forEach(function (a, i) {
      var row = document.createElement('div');
      row.className = 'editor-audio';
      row.innerHTML = '<span class="editor-audio__ico">♪</span>' +
        '<audio controls preload="metadata" src="' + a.src + '"></audio>' +
        '<button data-audio="1" data-idx="' + i + '" aria-label="删除录音">×</button>';
      el.editorAudios.appendChild(row);
    });
  }

  /** 录音状态 UI：state ∈ idle/recording/tick */
  function setRecordState(state, ms) {
    if (!el.recordStatus) return;
    if (state === 'recording' || state === 'tick') {
      el.recordStatus.classList.remove('is-hidden');
      if (el.btnRecord) el.btnRecord.classList.add('is-hidden');
      if (el.recordTime) el.recordTime.textContent = Recorder.fmt(ms || 0);
      if (el.btnStopRecord) el.btnStopRecord.classList.toggle('is-warn', state === 'tick' && (ms || 0) >= Recorder.MAX_MS - 15000);
    } else {
      el.recordStatus.classList.add('is-hidden');
      if (el.btnRecord) el.btnRecord.classList.remove('is-hidden');
      if (el.btnStopRecord) el.btnStopRecord.classList.remove('is-warn');
    }
  }

  function openEditor(note, groups) {
    editingNoteId = note ? note.id : null;
    editorImages = note && note.images ? note.images.slice() : [];
    editorAudios = note && note.audios ? note.audios.slice() : [];
    el.editorTitle.textContent = note ? '编辑灵感' : '记下灵感';
    el.editorText.value = note ? (note.text || '') : '';
    renderEditorImages();
    renderEditorAudios();
    setRecordState('idle');
    renderGroupOptions(groups, note ? note.groupId : '');
    el.editorMask.classList.remove('is-hidden');
    el.editor.classList.add('is-open');
    setTimeout(function () { el.editorText.focus(); }, 320);
  }

  function closeEditor() {
    el.editor.classList.remove('is-open');
    el.editorMask.classList.add('is-hidden');
    editingNoteId = null;
    editorImages = [];
    editorAudios = [];
    setRecordState('idle');
  }

  function getEditorData() {
    return {
      id: editingNoteId,
      text: el.editorText.value.trim(),
      images: editorImages.slice(),
      audios: editorAudios.slice(),
      groupId: el.editorGroup.value
    };
  }

  function addEditorImage(src) { editorImages.push(src); renderEditorImages(); }
  function removeEditorImage(i) { editorImages.splice(i, 1); renderEditorImages(); }
  function addEditorAudio(a) { editorAudios.push(a); renderEditorAudios(); }
  function removeEditorAudio(i) { editorAudios.splice(i, 1); renderEditorAudios(); }

  /* ---------------- 面板开关 ---------------- */
  function openDrawer() { el.drawer.classList.add('is-open'); el.drawerMask.classList.remove('is-hidden'); }
  function closeDrawer() { el.drawer.classList.remove('is-open'); el.drawerMask.classList.add('is-hidden'); }

  function openGroupDialog(title, value) {
    el.groupDialogTitle.textContent = title || '新建分组';
    el.groupNameInput.value = value || '';
    el.dialogMask.classList.remove('is-hidden');
    el.groupDialog.classList.remove('is-hidden');
    setTimeout(function () { el.groupNameInput.focus(); }, 60);
  }
  function closeGroupDialog() {
    el.dialogMask.classList.add('is-hidden');
    el.groupDialog.classList.add('is-hidden');
  }
  function getGroupName() { return el.groupNameInput.value.trim(); }

  function openConfirm(title, text, cb) {
    el.confirmTitle.textContent = title || '确认';
    el.confirmText.textContent = text || '';
    confirmCallback = cb || null;
    el.confirmMask.classList.remove('is-hidden');
    el.confirmDialog.classList.remove('is-hidden');
  }
  function closeConfirm() {
    el.confirmMask.classList.add('is-hidden');
    el.confirmDialog.classList.add('is-hidden');
    confirmCallback = null;
  }
  function takeConfirmCallback() { var cb = confirmCallback; confirmCallback = null; return cb; }

  function openLightbox(src) { el.lightboxImg.src = src; el.lightbox.classList.remove('is-hidden'); }
  function closeLightbox() { el.lightbox.classList.add('is-hidden'); el.lightboxImg.src = ''; }

  /* ---------------- 页面切换 ---------------- */
  function switchPage(name) {
    currentPage = name;
    ['notes', 'groups', 'summary', 'settings'].forEach(function (p) {
      var page = $('page-' + p);
      if (page) page.classList.toggle('is-active', p === name);
    });
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-active', tabs[i].dataset.page === name);
    }
    document.querySelector('.main').scrollTop = 0;
  }
  function getCurrentPage() { return currentPage; }
  function setSearchVisible(v) { el.searchWrap.classList.toggle('is-hidden', !v); if (v) setTimeout(function(){ el.searchInput.focus(); }, 60); }

  global.UI = {
    el: el, esc: esc, fmtTime: fmtTime, toast: toast,
    renderNotes: renderNotes, setListHead: setListHead,
    renderGroupGrid: renderGroupGrid, renderDrawer: renderDrawer, renderGroupOptions: renderGroupOptions,
    groupOf: groupOf,
    openEditor: openEditor, closeEditor: closeEditor, getEditorData: getEditorData,
    addEditorImage: addEditorImage, removeEditorImage: removeEditorImage,
    addEditorAudio: addEditorAudio, removeEditorAudio: removeEditorAudio, setRecordState: setRecordState,
    openDrawer: openDrawer, closeDrawer: closeDrawer,
    openGroupDialog: openGroupDialog, closeGroupDialog: closeGroupDialog, getGroupName: getGroupName,
    openConfirm: openConfirm, closeConfirm: closeConfirm, takeConfirmCallback: takeConfirmCallback,
    openLightbox: openLightbox, closeLightbox: closeLightbox,
    switchPage: switchPage, getCurrentPage: getCurrentPage, setSearchVisible: setSearchVisible
  };
})(window);
