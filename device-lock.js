const DL_API_URL = "https://screencircle-license.intigamhasanov835.workers.dev";
const DL_STORAGE_KEY = "screenCircle.activation";

function dlGetDeviceId() {
  let id = localStorage.getItem("screenCircle.deviceId");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : "dev-" + Date.now() + "-" + Math.random().toString(16).slice(2));
    localStorage.setItem("screenCircle.deviceId", id);
  }
  return id;
}

function dlGetActivation() {
  try {
    const raw = localStorage.getItem(DL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function dlIsActivated() {
  return !!dlGetActivation();
}

async function dlActivate(code) {
  const trimmed = (code || "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const deviceId = dlGetDeviceId();
  let data;
  try {
    const res = await fetch(DL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed, deviceId }),
    });
    data = await res.json();
  } catch (e) {
    return { ok: false, reason: "network" };
  }

  if (!data || !data.ok) {
    return { ok: false, reason: (data && data.reason) || "invalid" };
  }

  const record = { code: trimmed, deviceId, activatedAt: new Date().toISOString() };
  localStorage.setItem(DL_STORAGE_KEY, JSON.stringify(record));
  return { ok: true };
}

function dlDeactivate() {
  localStorage.removeItem(DL_STORAGE_KEY);
}
