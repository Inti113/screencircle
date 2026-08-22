const setupView = document.getElementById('setup-view');
const recordingView = document.getElementById('recording-view');
const savingView = document.getElementById('saving-view');
const doneView = document.getElementById('done-view');

const windowListField = document.getElementById('window-list');
const windowGrid = document.getElementById('window-grid');
const regionPickerField = document.getElementById('region-picker');
const pickRegionBtn = document.getElementById('pick-region-btn');
const regionStatus = document.getElementById('region-status');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const newRecordingBtn = document.getElementById('new-recording-btn');
const setupError = document.getElementById('setup-error');
const timerEl = document.getElementById('timer');
const donePathEl = document.getElementById('done-path');
const cameraToggle = document.getElementById('camera-toggle');
const cameraOptionsRow = document.getElementById('camera-options-row');
const cameraIncludeToggle = document.getElementById('camera-include-toggle');
const micToggleBtn = document.getElementById('mic-toggle-btn');
const systemAudioToggleBtn = document.getElementById('system-audio-toggle-btn');
const qualityAutoBtn = document.getElementById('quality-auto-btn');
const resolutionSelect = document.getElementById('resolution-select');
const fpsSelect = document.getElementById('fps-select');
const durationBtns = document.querySelectorAll('.duration-btn');
const formatBtns = document.querySelectorAll('.format-btn');
const afterBtns = document.querySelectorAll('.after-btn');
const donePreview = document.getElementById('done-preview');
const doneIconWrap = document.getElementById('done-icon-wrap');
const overlayInfoBtn = document.getElementById('overlay-info-btn');
const overlayVisibleBtn = document.getElementById('overlay-visible-btn');
let overlayInfoIncluded = false;
let overlayVisible = true;

overlayInfoBtn.addEventListener('click', () => {
  overlayInfoIncluded = !overlayInfoIncluded;
  overlayInfoBtn.classList.toggle('active', overlayInfoIncluded);
});

overlayVisibleBtn.addEventListener('click', () => {
  overlayVisible = !overlayVisible;
  overlayVisibleBtn.classList.toggle('active', overlayVisible);
});

let selectedWindowId = null;
let selectedRegion = null; // { sourceId, x, y, width, height }
let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;
let extraAudioStreams = [];
let audioContext = null;
let timerInterval = null;
let recordStartTime = 0;
let pausedAccumulatedMs = 0;
let pauseStartedAt = 0;
let isPaused = false;
let micEnabled = false;
let systemAudioEnabled = false;
let qualityAuto = true;
let screenInfo = { width: 1920, height: 1080 };
let durationMinutes = 0;
let durationTimeout = null;
let recordStartDate = null;

durationBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    durationBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    durationMinutes = Number(btn.dataset.minutes);
  });
});

let selectedFormat = 'mp4';
formatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    formatBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedFormat = btn.dataset.format;
  });
});

let afterAction = 'preview';
afterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    afterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    afterAction = btn.dataset.after;
  });
});

window.api.getScreenInfo().then(info => {
  screenInfo = info;
  const presets = [
    { value: '1280x720', height: 720 },
    { value: '1920x1080', height: 1080 },
    { value: '2560x1440', height: 1440 },
    { value: '3840x2160', height: 2160 }
  ];
  Array.from(resolutionSelect.options).forEach(opt => {
    const preset = presets.find(p => p.value === opt.value);
    opt.disabled = preset.height > screenInfo.height;
  });
  const bestFit = [...presets].reverse().find(p => p.height <= screenInfo.height) || presets[0];
  resolutionSelect.value = bestFit.value;
});

qualityAutoBtn.addEventListener('click', () => {
  qualityAuto = !qualityAuto;
  qualityAutoBtn.classList.toggle('active', qualityAuto);
  resolutionSelect.disabled = qualityAuto;
  fpsSelect.disabled = qualityAuto;
});

function getQualitySettings() {
  if (qualityAuto) {
    const height = Math.min(screenInfo.height, 1080);
    const width = Math.round(height * (screenInfo.width / screenInfo.height));
    return { width, height, fps: 30 };
  }
  const [width, height] = resolutionSelect.value.split('x').map(Number);
  return { width, height, fps: Number(fpsSelect.value) };
}

micToggleBtn.addEventListener('click', () => {
  micEnabled = !micEnabled;
  micToggleBtn.classList.toggle('active', micEnabled);
});

systemAudioToggleBtn.addEventListener('click', () => {
  systemAudioEnabled = !systemAudioEnabled;
  systemAudioToggleBtn.classList.toggle('active', systemAudioEnabled);
});

function showView(view) {
  [setupView, recordingView, savingView, doneView].forEach(v => v.classList.add('hidden'));
  view.classList.remove('hidden');
}

function setError(msg) {
  setupError.textContent = msg || '';
}

document.querySelectorAll('input[name="source-type"]').forEach(radio => {
  radio.addEventListener('change', onSourceTypeChange);
});

function onSourceTypeChange() {
  setError('');
  const type = document.querySelector('input[name="source-type"]:checked').value;
  windowListField.classList.toggle('hidden', type !== 'window');
  regionPickerField.classList.toggle('hidden', type !== 'region');
  if (type === 'window') loadWindowList();
}

async function loadWindowList() {
  windowGrid.innerHTML = '<div class="hint">Загрузка…</div>';
  const sources = await window.api.getSources(['window']);
  windowGrid.innerHTML = '';
  selectedWindowId = null;
  sources.forEach(src => {
    const item = document.createElement('div');
    item.className = 'window-item';
    item.innerHTML = `<img src="${src.thumbnail}"><div class="name">${src.name}</div>`;
    item.addEventListener('click', () => {
      document.querySelectorAll('.window-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedWindowId = src.id;
    });
    windowGrid.appendChild(item);
  });
  if (sources.length === 0) {
    windowGrid.innerHTML = '<div class="hint">Открытые окна не найдены</div>';
  }
}

cameraToggle.addEventListener('change', () => {
  const enabled = cameraToggle.checked;
  cameraOptionsRow.classList.toggle('chip-row-disabled', !enabled);
  cameraOptionsRow.querySelectorAll('input').forEach(el => { el.disabled = !enabled; });
  if (enabled) {
    window.api.cameraShow();
    window.api.cameraSetIncluded(cameraIncludeToggle.checked);
    const shape = document.querySelector('input[name="camera-shape"]:checked').value;
    window.api.cameraSetShape(shape);
  } else {
    window.api.cameraHide();
  }
});

cameraIncludeToggle.addEventListener('change', () => {
  window.api.cameraSetIncluded(cameraIncludeToggle.checked);
});

document.querySelectorAll('input[name="camera-shape"]').forEach(radio => {
  radio.addEventListener('change', () => {
    window.api.cameraSetShape(radio.value);
  });
});

pickRegionBtn.addEventListener('click', async () => {
  regionStatus.textContent = 'Выделите область на экране…';
  const region = await window.api.selectRegion();
  if (!region || !region.sourceId) {
    regionStatus.textContent = 'Область не выбрана';
    selectedRegion = null;
    return;
  }
  selectedRegion = region;
  regionStatus.textContent = `Выбрано: ${region.width}×${region.height}`;
});

startBtn.addEventListener('click', async () => {
  setError('');
  const type = document.querySelector('input[name="source-type"]:checked').value;

  let sourceId = null;
  let crop = null;
  let nativeDims = null;

  if (type === 'screen') {
    const screenSource = await window.api.getPrimaryScreenSource();
    if (!screenSource) { setError('Не удалось получить доступ к экрану'); return; }
    sourceId = screenSource.id;
    nativeDims = { width: screenInfo.width, height: screenInfo.height };
  } else if (type === 'window') {
    if (!selectedWindowId) { setError('Выберите окно из списка'); return; }
    sourceId = selectedWindowId;
  } else if (type === 'region') {
    if (!selectedRegion) { setError('Сначала выделите область'); return; }
    sourceId = selectedRegion.sourceId;
    crop = {
      x: selectedRegion.x,
      y: selectedRegion.y,
      width: selectedRegion.width - (selectedRegion.width % 2),
      height: selectedRegion.height - (selectedRegion.height % 2)
    };
    nativeDims = { width: selectedRegion.nativeWidth, height: selectedRegion.nativeHeight };
  }

  const outputPath = await window.api.chooseSavePath(selectedFormat);
  if (!outputPath) return;

  const quality = getQualitySettings();

  extraAudioStreams = [];
  audioContext = null;
  let desktopStream;

  try {
    desktopStream = await navigator.mediaDevices.getUserMedia({
      audio: systemAudioEnabled ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: quality.width,
          maxHeight: quality.height,
          maxFrameRate: quality.fps
        }
      }
    });
  } catch (err) {
    setError('Не удалось начать захват: ' + err.message);
    return;
  }
  extraAudioStreams.push(desktopStream);

  if (crop && nativeDims && nativeDims.width) {
    const actualSettings = desktopStream.getVideoTracks()[0].getSettings();
    if (actualSettings.width && actualSettings.height) {
      const scaleX = actualSettings.width / nativeDims.width;
      const scaleY = actualSettings.height / nativeDims.height;
      crop = {
        x: Math.round(crop.x * scaleX),
        y: Math.round(crop.y * scaleY),
        width: Math.round(crop.width * scaleX / 2) * 2,
        height: Math.round(crop.height * scaleY / 2) * 2
      };
    }
  }

  let micStream = null;
  if (micEnabled) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      extraAudioStreams.push(micStream);
    } catch (err) {
      setError('Не удалось получить доступ к микрофону: ' + err.message);
    }
  }

  const videoTrack = desktopStream.getVideoTracks()[0];
  const desktopAudioTrack = desktopStream.getAudioTracks()[0] || null;
  const micAudioTrack = micStream ? micStream.getAudioTracks()[0] : null;

  let finalAudioTrack = null;
  if (desktopAudioTrack && micAudioTrack) {
    audioContext = new AudioContext();
    const dest = audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(new MediaStream([desktopAudioTrack])).connect(dest);
    audioContext.createMediaStreamSource(new MediaStream([micAudioTrack])).connect(dest);
    finalAudioTrack = dest.stream.getAudioTracks()[0];
  } else {
    finalAudioTrack = desktopAudioTrack || micAudioTrack || null;
  }

  const tracks = [videoTrack];
  if (finalAudioTrack) tracks.push(finalAudioTrack);
  mediaStream = new MediaStream(tracks);

  recordedChunks = [];
  const mimeType = finalAudioTrack ? 'video/webm; codecs=vp9,opus' : 'video/webm; codecs=vp9';
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => finishRecording(outputPath, crop, selectedFormat);
  mediaRecorder.start();

  recordStartTime = Date.now();
  recordStartDate = new Date();
  pausedAccumulatedMs = 0;
  pauseStartedAt = 0;
  isPaused = false;
  timerInterval = setInterval(updateTimer, 1000);
  showView(recordingView);
  window.api.recordingStarted({ overlayInfoIncluded, overlayVisible });
  updateTimer();

  if (durationMinutes > 0) {
    durationTimeout = setTimeout(() => {
      stopRecording();
    }, durationMinutes * 60 * 1000);
  }
});

function currentElapsedSeconds() {
  const pausedMs = pausedAccumulatedMs + (isPaused ? Date.now() - pauseStartedAt : 0);
  return Math.max(0, Math.floor((Date.now() - recordStartTime - pausedMs) / 1000));
}

function updateTimer() {
  const elapsed = currentElapsedSeconds();
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
  window.api.sendRecordingState({
    elapsedSeconds: elapsed,
    paused: isPaused,
    startText: recordStartDate ? formatStartDate(recordStartDate) : ''
  });
}

function formatStartDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function togglePause() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  if (isPaused) {
    mediaRecorder.resume();
    pausedAccumulatedMs += Date.now() - pauseStartedAt;
    isPaused = false;
  } else {
    mediaRecorder.pause();
    pauseStartedAt = Date.now();
    isPaused = true;
  }
  updateTimer();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }
  extraAudioStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
  extraAudioStreams = [];
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  clearInterval(timerInterval);
  if (durationTimeout) {
    clearTimeout(durationTimeout);
    durationTimeout = null;
  }
  window.api.recordingStopped();
}

stopBtn.addEventListener('click', stopRecording);
window.api.onTogglePause(togglePause);
window.api.onRequestStop(stopRecording);
window.api.onHotkeyPause(togglePause);
window.api.onHotkeyStop(stopRecording);
window.api.onHotkeyStart(() => {
  if (!setupView.classList.contains('hidden')) startBtn.click();
});

async function finishRecording(outputPath, crop, format) {
  showView(savingView);
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const arrayBuffer = await blob.arrayBuffer();

  const result = await window.api.saveRecording(arrayBuffer, outputPath, crop, format);

  if (result.success) {
    if (afterAction === 'folder') {
      window.api.showItemInFolder(result.outputPath);
      resetToSetup();
    } else if (afterAction === 'silent') {
      resetToSetup();
    } else {
      donePathEl.textContent = result.outputPath;
      doneIconWrap.classList.add('hidden');
      donePreview.classList.remove('hidden');
      donePreview.src = 'file://' + result.outputPath.replace(/\\/g, '/');
      showView(doneView);
    }
  } else {
    setError('Ошибка сохранения: ' + result.error);
    showView(setupView);
  }
}

function resetToSetup() {
  selectedWindowId = null;
  selectedRegion = null;
  regionStatus.textContent = '';
  timerEl.textContent = '00:00';
  showView(setupView);
}

newRecordingBtn.addEventListener('click', () => {
  donePreview.pause();
  donePreview.removeAttribute('src');
  donePreview.classList.add('hidden');
  doneIconWrap.classList.remove('hidden');
  resetToSetup();
});
