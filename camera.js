const video = document.getElementById('video');
const errorEl = document.getElementById('error');
const resizeHandle = document.getElementById('resize-handle');
const circleEl = document.getElementById('circle');

let currentLang = 'en';
let cameraError = null;

window.cameraApi.onSetShape((shape) => {
  circleEl.classList.toggle('square', shape === 'square');
});

window.cameraApi.onLanguageChanged((lang) => {
  currentLang = lang;
  if (cameraError) errorEl.textContent = window.i18n.t('camera_unavailable', currentLang) + cameraError;
});

navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    cameraError = err.message;
    video.style.display = 'none';
    errorEl.style.display = 'flex';
    errorEl.textContent = window.i18n.t('camera_unavailable', currentLang) + err.message;
  });

document.getElementById('circle').addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 10 : -10;
  window.cameraApi.resize(delta);
}, { passive: false });

let resizing = false;
let startX = 0;
let startY = 0;

resizeHandle.addEventListener('mousedown', (e) => {
  resizing = true;
  startX = e.screenX;
  startY = e.screenY;
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  const dx = e.screenX - startX;
  const dy = e.screenY - startY;
  const delta = (dx + dy) / 2;
  if (Math.abs(delta) >= 2) {
    window.cameraApi.resize(delta);
    startX = e.screenX;
    startY = e.screenY;
  }
});

window.addEventListener('mouseup', () => {
  resizing = false;
});
