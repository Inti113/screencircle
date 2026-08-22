const dotEl = document.getElementById('dot');
const statusTextEl = document.getElementById('status-text');
const timerEl = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const cameraBtn = document.getElementById('camera-btn');

let currentLang = 'en';
let isPaused = false;
let cameraVisible = true;

pauseBtn.addEventListener('click', () => window.widgetApi.togglePause());
stopBtn.addEventListener('click', () => window.widgetApi.stop());
cameraBtn.addEventListener('click', () => window.widgetApi.toggleCamera());

function applyLabels() {
  stopBtn.textContent = window.i18n.t('widget_stop', currentLang);
  statusTextEl.textContent = window.i18n.t(isPaused ? 'widget_paused' : 'widget_recording', currentLang);
  pauseBtn.textContent = window.i18n.t(isPaused ? 'widget_resume' : 'widget_pause', currentLang);
  cameraBtn.textContent = window.i18n.t(cameraVisible ? 'widget_camera_on' : 'widget_camera_off', currentLang);
}

window.widgetApi.onLanguageChanged((lang) => {
  currentLang = lang;
  window.i18n.applyTranslations(lang);
  applyLabels();
});

window.widgetApi.onCameraAvailable((available) => {
  cameraBtn.classList.toggle('hidden', !available);
});

window.widgetApi.onCameraVisibility((visible) => {
  cameraVisible = visible;
  cameraBtn.classList.toggle('off', !visible);
  applyLabels();
});

function formatTime(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

window.widgetApi.onState((state) => {
  timerEl.textContent = formatTime(state.elapsedSeconds);
  isPaused = !!state.paused;
  dotEl.classList.toggle('recording', !isPaused);
  dotEl.classList.toggle('paused', isPaused);
  applyLabels();
});
