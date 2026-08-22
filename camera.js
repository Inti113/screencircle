const video = document.getElementById('video');
const errorEl = document.getElementById('error');
const resizeHandle = document.getElementById('resize-handle');
const circleEl = document.getElementById('circle');
const sourceCameraBtn = document.getElementById('source-camera-btn');
const sourcePhoneBtn = document.getElementById('source-phone-btn');

let currentLang = 'en';
let platform = 'win32';
let source = 'camera'; // 'camera' | 'phone'
let cameraStream = null;
let iphoneStream = null;
let phonePollTimer = null;
let mirroringActive = false;
let cameraError = null;

window.cameraApi.getPlatform().then(p => { platform = p; });

window.cameraApi.onSetShape((shape) => {
  circleEl.classList.toggle('square', shape === 'square');
});

window.cameraApi.onLanguageChanged((lang) => {
  currentLang = lang;
  refreshStatusText();
});

function showStatus(text) {
  video.style.display = 'none';
  errorEl.style.display = 'flex';
  errorEl.textContent = text;
}

function hideStatus() {
  errorEl.style.display = 'none';
  video.style.display = 'block';
}

let lastStatusKind = null; // 'checking' | 'unauthorized' | 'instructions' | 'error'
let lastStatusExtra = '';

function setStatus(kind, extra) {
  lastStatusKind = kind;
  lastStatusExtra = extra || '';
  refreshStatusText();
}

function refreshStatusText() {
  const t = (k) => window.i18n.t(k, currentLang);
  if (lastStatusKind === 'checking') {
    showStatus(t('phone_checking'));
  } else if (lastStatusKind === 'unauthorized') {
    showStatus(t('phone_unauthorized'));
  } else if (lastStatusKind === 'instructions') {
    const parts = [t('phone_instructions_android')];
    parts.push(platform === 'darwin' ? t('phone_instructions_iphone_mac') : t('phone_instructions_iphone_windows'));
    showStatus(parts.join(' '));
  } else if (lastStatusKind === 'error') {
    showStatus(t('camera_unavailable') + lastStatusExtra);
  } else if (lastStatusKind === 'mirroring') {
    showStatus(t('phone_mirroring').replace('{name}', lastStatusExtra));
  }
}

// ---------- Camera source ----------

function startCameraSource() {
  video.classList.remove('no-flip');
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(stream => {
      cameraStream = stream;
      video.srcObject = stream;
      hideStatus();
    })
    .catch(err => {
      setStatus('error', err.message);
    });
}

function stopCameraSource() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

// ---------- Phone source ----------

async function tryIphoneOnMac() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const iphone = devices.find(d => d.kind === 'videoinput' && /iphone/i.test(d.label));
    if (!iphone) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: iphone.deviceId } }, audio: false });
    iphoneStream = stream;
    video.classList.add('no-flip');
    video.srcObject = stream;
    hideStatus();
    return true;
  } catch (e) {
    return false;
  }
}

async function pollPhone() {
  if (source !== 'phone') return;

  if (mirroringActive) {
    const status = await window.cameraApi.phoneCheckAndroid();
    if (source !== 'phone') return;
    if (!status.connected) {
      await window.cameraApi.phoneMirrorStop();
      if (source !== 'phone') return;
      mirroringActive = false;
      setStatus('instructions');
    }
    return;
  }

  if (iphoneStream) return;

  const status = await window.cameraApi.phoneCheckAndroid();
  if (source !== 'phone') return;
  if (status.connected) {
    setStatus('checking');
    const started = await window.cameraApi.phoneMirrorStart();
    if (source !== 'phone') {
      if (started) window.cameraApi.phoneMirrorStop();
      return;
    }
    if (started) {
      mirroringActive = true;
      setStatus('mirroring', status.name || '');
    } else {
      setStatus('instructions');
    }
    return;
  }
  if (status.unauthorized) {
    setStatus('unauthorized');
    return;
  }

  if (platform === 'darwin') {
    const ok = await tryIphoneOnMac();
    if (source !== 'phone') return;
    if (ok) return;
  }

  setStatus('instructions');
}

function startPhoneSource() {
  setStatus('checking');
  pollPhone();
  phonePollTimer = setInterval(pollPhone, 3000);
}

async function stopPhoneSource() {
  if (phonePollTimer) {
    clearInterval(phonePollTimer);
    phonePollTimer = null;
  }
  if (mirroringActive) {
    await window.cameraApi.phoneMirrorStop();
    mirroringActive = false;
  }
  if (iphoneStream) {
    iphoneStream.getTracks().forEach(t => t.stop());
    iphoneStream = null;
  }
  video.classList.remove('no-flip');
}

// ---------- Source switching ----------

sourceCameraBtn.addEventListener('click', () => {
  if (source === 'camera') return;
  source = 'camera';
  sourceCameraBtn.classList.add('active');
  sourcePhoneBtn.classList.remove('active');
  stopPhoneSource().then(startCameraSource);
});

sourcePhoneBtn.addEventListener('click', () => {
  if (source === 'phone') return;
  source = 'phone';
  sourcePhoneBtn.classList.add('active');
  sourceCameraBtn.classList.remove('active');
  stopCameraSource();
  startPhoneSource();
});

startCameraSource();

// ---------- Resize / drag handle ----------

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
