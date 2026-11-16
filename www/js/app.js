/* ============================================================
   雾记 · 应用主控  —  app.js
   ============================================================ */
(function (global) {
  'use strict';

  var groupsCache = [];
  var notesCache = [];
  var activeGroupId = '';
  var keyword = '';
  var editingGroupId = null;
  var searchTimer = null;

  function byId(id) { return document.getElementById(id); }

  /* ---------------- 数据刷新 ---------------- */
  function refreshGroups() {
    return Promise.all([DB.getGroups(), DB.groupCounts()]).then(function (r) {
      groupsCache = r[0];
      var counts = r[1];
      UI.renderGroupGrid(groupsCache, counts);
      UI.renderDrawer(groupsCache, counts, activeGroupId);
      if (byId('cityInput') && !byId('cityInput').value) byId('cityInput').value = Weather.getCity();
    });
  }

  function refreshNotes() {
    var opts = { keyword: keyword };
    var title = '全部灵感';
    var sub = '按时间排序';

    if (activeGroupId === '__none__') {
      title = '未分组';
    } else if (activeGroupId) {
      var g = UI.groupOf(groupsCache, activeGroupId);
      title = g ? g.name : '灵感';
      opts.groupId = activeGroupId;
    }
    if (keyword) { title = '搜索：' + keyword; sub = '共找到以下灵感'; }

    return DB.getNotes(opts).then(function (list) {
      if (activeGroupId === '__none__') {
        list = list.filter(function (n) { return !n.groupId; });
      }
      notesCache = list;
      UI.setListHead(title, sub);
      UI.renderNotes(list, groupsCache);
    });
  }

  function refreshSummary() {
    if (UI.getCurrentPage() === 'summary') Summary.render();
  }

  function refreshAll() {
    return refreshGroups().then(refreshNotes).then(refreshSummary);
  }

  /* ---------------- 天气 ---------------- */
  function loadWeather(force) {
    var mode = Weather.getMode();
    var status = byId('weatherStatus');

    if (mode === 'off') {
      Background.apply(null);
      if (status) status.textContent = '背景动画已关闭。';
      return;
    }
    if (mode === 'time') {
      Background.apply(Weather.timeOnly());
      if (status) status.textContent = '离线模式：仅根据早中晚变化背景。';
      return;
    }

    var cached = Weather.getCached();
    Background.apply(cached || Weather.timeOnly());
    if (status && cached) status.textContent = '已加载缓存天气，正在更新…';

    return Weather.fetch().then(function (w) {
      Background.apply(w);
      if (status) status.textContent = '天气来源：' + (w.source === 'city' ? '手动城市' : '定位') + ' · ' + w.city + ' · ' + w.desc;
    }).catch(function (err) {
      Background.apply(cached || Weather.timeOnly());
      if (status) status.textContent = '联网获取失败：' + (err.message || '未知错误') + '。已使用离线背景。';
      if (force) UI.toast('天气获取失败，已用离线背景');
    });
  }

  /* ---------------- 记录操作 ---------------- */
  function saveEditor() {
    if (Recorder.isRecording()) {
      UI.toast('请先停止录音');
      return;
    }
    var d = UI.getEditorData();
    if (!d.text && !d.images.length && !d.audios.length && !d.videos.length) { UI.toast('写点什么，或添加图片/视频/录音吧'); return; }
    var task = d.id
      ? DB.updateNote(d.id, { text: d.text, images: d.images, audios: d.audios, videos: d.videos, groupId: d.groupId })
      : DB.addNote(d);
    task.then(function () {
      UI.closeEditor();
      return refreshAll();
    }).then(function () {
      UI.toast(d.id ? '已更新' : '灵感已记下');
    }).catch(function (e) { UI.toast('保存失败：' + e.message); });
  }

  function deleteNote(id) {
    UI.openConfirm('删除这条灵感？', '删除后无法恢复。', function () {
      DB.deleteNote(id).then(function () {
        return refreshAll();
      }).then(function () { UI.toast('已删除'); });
    });
  }

  /* ---------------- 分组操作 ---------------- */
  function openGroupEditor(group) {
    editingGroupId = group ? group.id : null;
    UI.openGroupDialog(group ? '编辑分组' : '新建分组', group ? group.name : '');
    var del = byId('btnGroupDelete');
    if (del) del.classList.toggle('is-hidden', !group);
  }

  function confirmGroup() {
    var name = UI.getGroupName();
    if (!name) { UI.toast('请输入分组名'); return; }
    var task = editingGroupId
      ? DB.updateGroup(editingGroupId, { name: name })
      : DB.addGroup(name);
    task.then(function () {
      UI.closeGroupDialog();
      editingGroupId = null;
      return refreshAll();
    }).then(function () { UI.toast('分组已保存'); })
      .catch(function (e) { UI.toast(e.message || '操作失败'); });
  }

  function removeGroup(id) {
    UI.closeGroupDialog();
    UI.openConfirm('删除分组？', '该分组下的灵感会移到「未分组」，灵感本身不会删除。', function () {
      DB.deleteGroup(id).then(function () {
        if (activeGroupId === id) activeGroupId = '';
        return refreshAll();
      }).then(function () { UI.toast('分组已删除'); });
    });
  }

  /* ---------------- 数据备份 ---------------- */
  function exportData() {
    DB.exportAll().then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '雾记备份-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      UI.toast('备份已导出');
    });
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); }
      catch (e) { UI.toast('不是有效的 JSON 文件'); return; }
      UI.openConfirm('导入数据？', '备份内容会合并到现有数据中。', function () {
        DB.importAll(data).then(function () {
          return refreshAll();
        }).then(function () { UI.toast('导入完成'); })
          .catch(function (e) { UI.toast('导入失败：' + e.message); });
      });
    };
    reader.readAsText(file);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 底部导航
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var page = this.dataset.page;
        UI.switchPage(page);
        if (page === 'summary') Summary.render();
      });
    }

    // 新建
    byId('fabAdd').addEventListener('click', function () { UI.openEditor(null, groupsCache); });

    // 编辑器
    function safeCloseEditor() {
      if (Recorder.isRecording()) Recorder.cancel();
      UI.closeEditor();
    }
    byId('btnEditorCancel').addEventListener('click', safeCloseEditor);
    byId('editorMask').addEventListener('click', safeCloseEditor);
    byId('btnEditorSave').addEventListener('click', saveEditor);
    byId('btnAddImage').addEventListener('click', function () { byId('imageInput').click(); });
    byId('btnAddVideo').addEventListener('click', function () { byId('videoInput').click(); });
    byId('btnCamera').addEventListener('click', function () { byId('cameraInput').click(); });
    byId('btnCamcorder').addEventListener('click', function () { byId('camcorderInput').click(); });

    // 统一处理媒体文件选择（相册视频 / 相机录像 / 相机拍照）
    var MAX_VIDEO = 40 * 1024 * 1024; // 视频上限 40MB（转为 dataURL 存本地）
    function handleVideos(e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      var queue = files.filter(function (f) {
        return /^video\//.test(f.type) && f.size <= MAX_VIDEO;
      });
      if (!queue.length) { UI.toast('请选择视频文件（≤40MB）'); return; }
      UI.toast('正在添加 ' + queue.length + ' 个视频…');
      var chain = Promise.resolve(), added = 0, failed = 0;
      queue.forEach(function (f) {
        chain = chain.then(function () {
          return DB.readAsDataURL(f, MAX_VIDEO).then(function (src) {
            UI.addEditorVideo({ src: src, mime: f.type || 'video/mp4', name: f.name || '', createdAt: Date.now() });
            added++;
          }).catch(function () { failed++; });
        });
      });
      chain.then(function () {
        var msg = added ? ('已添加 ' + added + ' 个视频') : '视频处理失败';
        if (failed) msg += '（' + failed + ' 个失败）';
        UI.toast(msg);
      });
    }
    function handleCameraPhoto(e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      var f = files[0];
      DB.compressImage(f).then(function (src) {
        UI.addEditorImage(src); UI.toast('照片已添加');
      }).catch(function () { UI.toast('照片处理失败'); });
    }
    byId('videoInput').addEventListener('change', handleVideos);
    byId('camcorderInput').addEventListener('change', handleVideos);
    byId('cameraInput').addEventListener('change', handleCameraPhoto);
    byId('imageInput').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      // 逐张处理：单张失败不影响其余图片；跳过非图片与超大文件
      var added = 0, failed = 0;
      var queue = files.filter(function (f) {
        if (!/^image\//.test(f.type)) return false;
        if (f.size > 30 * 1024 * 1024) { failed++; return false; }
        return true;
      });
      if (!queue.length) { UI.toast(failed ? '图片过大或格式不支持' : '未选择图片'); return; }
      UI.toast('正在处理 ' + queue.length + ' 张图片…');
      var chain = Promise.resolve();
      queue.forEach(function (f) {
        chain = chain.then(function () {
          return DB.compressImage(f).then(function (src) {
            UI.addEditorImage(src);
            added++;
          }).catch(function () { failed++; });
        });
      });
      chain.then(function () {
        var msg = added ? ('已添加 ' + added + ' 张图片') : '图片处理失败';
        if (failed) msg += '（' + failed + ' 张失败）';
        UI.toast(msg);
      });
    });
    byId('editorImages').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-idx]');
      if (btn) UI.removeEditorImage(parseInt(btn.dataset.idx, 10));
    });

    // 录音
    byId('btnRecord').addEventListener('click', function () {
      if (!Recorder.supported()) { UI.toast('当前环境不支持录音'); return; }
      UI.toast('正在请求麦克风权限…');
      Recorder.start(function (state, payload) {
        if (state === 'recording' || state === 'tick') {
          UI.setRecordState(state, payload);
        } else if (state === 'done') {
          UI.setRecordState('idle');
          UI.addEditorAudio(payload);
          UI.toast('录音已添加（' + Recorder.fmt(payload.duration) + '）');
        } else if (state === 'error') {
          UI.setRecordState('idle');
          UI.toast(payload || '录音失败');
        } else if (state === 'idle') {
          UI.setRecordState('idle');
        }
      }).catch(function (err) {
        UI.setRecordState('idle');
        var name = err && err.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') UI.toast('麦克风权限被拒绝，请在设置中允许');
        else if (name === 'NotFoundError') UI.toast('未找到麦克风设备');
        else UI.toast('无法开始录音：' + (err.message || '未知错误'));
      });
    });
    byId('btnStopRecord').addEventListener('click', function () {
      if (Recorder.isRecording()) { UI.toast('正在处理录音…'); Recorder.stop(); }
    });
    byId('editorAudios').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-idx]');
      if (btn) UI.removeEditorAudio(parseInt(btn.dataset.idx, 10));
    });
    byId('editorVideos').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-idx]');
      if (btn) UI.removeEditorVideo(parseInt(btn.dataset.idx, 10));
    });

    // 灵感列表（事件委托）
    byId('notesList').addEventListener('click', function (e) {
      var img = e.target.closest('img.note__img');
      if (img) {
        var card = img.closest('.note');
        var note = null;
        notesCache.forEach(function (n) { if (n.id === card.dataset.id) note = n; });
        if (note && note.images[parseInt(img.dataset.idx, 10)]) UI.openLightbox(note.images[parseInt(img.dataset.idx, 10)]);
        return;
      }
      var op = e.target.closest('button[data-op]');
      if (op) {
        var id = op.closest('.note').dataset.id;
        if (op.dataset.op === 'delete') { deleteNote(id); }
        else {
          var target = null;
          notesCache.forEach(function (n) { if (n.id === id) target = n; });
          if (target) UI.openEditor(target, groupsCache);
        }
        return;
      }
      if (e.target.classList.contains('note__text')) e.target.classList.toggle('clamp');
    });

    // 抽屉
    byId('btnDrawer').addEventListener('click', UI.openDrawer);
    byId('btnCloseDrawer').addEventListener('click', UI.closeDrawer);
    byId('drawerMask').addEventListener('click', UI.closeDrawer);
    byId('drawerGroups').addEventListener('click', function (e) {
      var item = e.target.closest('.drawer-item');
      if (!item) return;
      activeGroupId = item.dataset.group;
      UI.closeDrawer();
      UI.switchPage('notes');
      refreshNotes();
    });
    byId('btnNewGroupDrawer').addEventListener('click', function () { UI.closeDrawer(); openGroupEditor(null); });

    // 分组页
    byId('groupGrid').addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-edit]');
      if (editBtn) {
        var g = UI.groupOf(groupsCache, editBtn.dataset.edit);
        if (g) openGroupEditor(g);
        return;
      }
      var card = e.target.closest('.group-card');
      if (card) {
        activeGroupId = card.dataset.id;
        UI.switchPage('notes');
        refreshNotes();
      }
    });
    byId('btnNewGroupPage').addEventListener('click', function () { openGroupEditor(null); });

    // 分组弹窗
    byId('btnGroupCancel').addEventListener('click', function () { UI.closeGroupDialog(); editingGroupId = null; });
    byId('dialogMask').addEventListener('click', function () { UI.closeGroupDialog(); editingGroupId = null; });
    byId('btnGroupConfirm').addEventListener('click', confirmGroup);
    byId('btnGroupDelete').addEventListener('click', function () { if (editingGroupId) removeGroup(editingGroupId); });
    byId('groupNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmGroup(); });

    // 确认弹窗
    byId('btnConfirmCancel').addEventListener('click', UI.closeConfirm);
    byId('confirmMask').addEventListener('click', UI.closeConfirm);
    byId('btnConfirmOk').addEventListener('click', function () {
      var cb = UI.takeConfirmCallback();
      UI.closeConfirm();
      if (cb) cb();
    });

    // 图片查看
    byId('btnCloseLightbox').addEventListener('click', UI.closeLightbox);
    byId('lightbox').addEventListener('click', function (e) { if (e.target === this) UI.closeLightbox(); });

    // 搜索
    byId('btnSearch').addEventListener('click', function () {
      var wrap = byId('searchWrap');
      var showing = !wrap.classList.contains('is-hidden');
      UI.setSearchVisible(!showing);
      if (showing) { keyword = ''; byId('searchInput').value = ''; refreshNotes(); }
    });
    byId('searchInput').addEventListener('input', function (e) {
      var v = e.target.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { keyword = v; refreshNotes(); }, 220);
    });
    byId('btnClearSearch').addEventListener('click', function () {
      byId('searchInput').value = ''; keyword = ''; refreshNotes();
    });

    // 月度总结
    byId('prevMonth').addEventListener('click', function () { Summary.changeMonth(-1); });
    byId('nextMonth').addEventListener('click', function () { Summary.changeMonth(1); });

    // 设置：背景模式
    var segs = document.querySelectorAll('#bgModeSeg .seg-btn');
    for (var j = 0; j < segs.length; j++) {
      segs[j].addEventListener('click', function () {
        var mode = this.dataset.mode;
        Weather.setMode(mode);
        for (var k = 0; k < segs.length; k++) segs[k].classList.toggle('is-on', segs[k] === this);
        loadWeather(true);
      });
    }
    var seg = document.querySelector('#bgModeSeg .seg-btn[data-mode="' + Weather.getMode() + '"]');
    if (seg) {
      for (var m = 0; m < segs.length; m++) segs[m].classList.remove('is-on');
      seg.classList.add('is-on');
    }

    // 设置：城市
    byId('cityInput').value = Weather.getCity();
    byId('btnSaveCity').addEventListener('click', function () {
      Weather.setCity(byId('cityInput').value);
      loadWeather(true);
      UI.toast('城市已保存');
    });

    // 设置：备份
    byId('btnExport').addEventListener('click', exportData);
    byId('btnImport').addEventListener('click', function () { byId('importFile').click(); });
    byId('importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });

    // 回到前台时更新时间相位与天气
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        Background.apply(Weather.getCached() || Weather.timeOnly());
        loadWeather(false);
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    bind();
    refreshAll().catch(function (e) { UI.toast('数据加载失败：' + e.message); });
    loadWeather(false);
    Background.start(function () { loadWeather(false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
