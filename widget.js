const dotEl = document.getElementById('dot');
const statusTextEl = document.getElementById('status-text');
const timerEl = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const cameraBtn = document.getElementById('camera-btn');

pauseBtn.addEventListener('click', () => window.widgetApi.togglePause());
stopBtn.addEventListener('click', () => window.widgetApi.stop());
cameraBtn.addEventListener('click', () => window.widgetApi.toggleCamera());

window.widgetApi.onCameraAvailable((available) => {
  cameraBtn.classList.toggle('hidden', !available);
});

window.widgetApi.onCameraVisibility((visible) => {
  cameraBtn.textContent = visible ? 'Камера вкл' : 'Камера выкл';
  cameraBtn.classList.toggle('off', !visible);
});

function formatTime(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

window.widgetApi.onState((state) => {
  timerEl.textContent = formatTime(state.elapsedSeconds);
  if (state.paused) {
    dotEl.classList.remove('recording');
    dotEl.classList.add('paused');
    statusTextEl.textContent = 'Пауза';
    pauseBtn.textContent = 'Продолжить';
  } else {
    dotEl.classList.add('recording');
    dotEl.classList.remove('paused');
    statusTextEl.textContent = 'Идёт запись';
    pauseBtn.textContent = 'Пауза';
  }
});
