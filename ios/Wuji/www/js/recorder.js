/* ============================================================
   雾记 · 录音模块  —  recorder.js
   基于 MediaRecorder + getUserMedia，录音转 dataURL 存入灵感
   ============================================================ */
(function (global) {
  'use strict';

  var recorder = null;
  var stream = null;
  var chunks = [];
  var startedAt = 0;
  var timer = null;
  var stateHandler = null;
  var MAX_MS = 3 * 60 * 1000; // 单条录音最长 3 分钟

  function supported() {
    return !!(global.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function pickMime() {
    var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    if (!MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < list.length; i++) {
      if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    }
    return '';
  }

  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function emit(state, payload) {
    if (stateHandler) stateHandler(state, payload);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function cleanup() {
    if (stream) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      stream = null;
    }
    recorder = null;
    chunks = [];
  }

  /** 开始录音。handler(state, payload)：state ∈ recording/tick/done/error/idle */
  function start(handler) {
    if (!supported()) return Promise.reject(new Error('当前环境不支持录音'));
    if (recorder && recorder.state === 'recording') return Promise.reject(new Error('已在录音中'));
    stateHandler = handler || null;

    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      chunks = [];
      var mime = pickMime();
      try {
        recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
      } catch (e) {
        recorder = new MediaRecorder(s);
        mime = '';
      }
      var finalMime = recorder.mimeType || mime || 'audio/webm';

      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = function () { stopTimer(); cleanup(); emit('error', '录音过程出错'); };
      recorder.onstop = function () {
        stopTimer();
        var elapsed = Date.now() - startedAt;
        cleanup();
        if (!chunks.length) { emit('idle'); return; }
        var blob = new Blob(chunks, { type: finalMime });
        var reader = new FileReader();
        reader.onload = function () {
          emit('done', { src: reader.result, mime: finalMime, duration: elapsed });
        };
        reader.onerror = function () { emit('error', '读取录音失败'); };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      startedAt = Date.now();
      emit('recording');
      timer = setInterval(function () {
        var e = Date.now() - startedAt;
        emit('tick', e);
        if (e >= MAX_MS) stop();
      }, 300);
      return true;
    });
  }

  /** 停止录音，触发 onstop → done */
  function stop() {
    stopTimer();
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (e) { emit('error', '停止录音失败'); }
    }
  }

  /** 取消录音，不产出音频 */
  function cancel() {
    stopTimer();
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch (e) {} }
    }
    cleanup();
    emit('idle');
  }

  function isRecording() { return !!(recorder && recorder.state === 'recording'); }

  global.Recorder = {
    supported: supported, start: start, stop: stop, cancel: cancel,
    isRecording: isRecording, fmt: fmt, MAX_MS: MAX_MS
  };
})(window);
