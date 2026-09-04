(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const categoryInfo = {
    mushroom: { label: "Mushroom", icon: "🍄" },
    tree: { label: "Tree / place", icon: "🌳" },
    tracks: { label: "Tracks / path", icon: "🐾" },
    animal: { label: "Animal", icon: "🦌" },
    other: { label: "Other", icon: "📍" }
  };

  const DB_NAME = "forestLogDB";
  const DB_VERSION = 1;
  const STORE = "observations";
  const MAP_KEY_STORAGE = "forestLogMapTilerKey";
  const LAST_VIEW_STORAGE = "forestLogLastView";

  let db;
  let map;
  let baseLayer;
  let userMarker;
  let userAccuracyCircle;
  let markerLayer;
  let observations = [];
  let formPhotos = [];
  let formLocation = null;
  let selectedObservationId = null;
  let toastTimer;

  function showToast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  function showMapMessage(message, persistent = false) {
    const el = $("mapMessage");
    el.textContent = message;
    el.classList.remove("hidden");
    if (!persistent) setTimeout(() => el.classList.add("hidden"), 4200);
  }

  function hideMapMessage() {
    $("mapMessage").classList.add("hidden");
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txStore(mode = "readonly") {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function idbGetAll() {
    return new Promise((resolve, reject) => {
      const req = txStore().getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(value) {
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function idbDelete(id) {
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function makeMarkerIcon(category) {
    const info = categoryInfo[category] || categoryInfo.other;
    return L.divIcon({
      className: "",
      html: `<div class="marker-pin"><span>${info.icon}</span></div>`,
      iconSize: [38, 44],
      iconAnchor: [19, 40]
    });
  }

  function makeUserIcon() {
    return L.divIcon({
      className: "",
      html: '<div class="user-dot"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  function getSavedView() {
    try {
      const raw = localStorage.getItem(LAST_VIEW_STORAGE);
      const v = raw ? JSON.parse(raw) : null;
      if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)) return v;
    } catch {}
    return { lat: 60.1282, lng: 18.6435, zoom: 5 };
  }

  function saveView() {
    if (!map) return;
    const center = map.getCenter();
    localStorage.setItem(LAST_VIEW_STORAGE, JSON.stringify({
      lat: center.lat, lng: center.lng, zoom: map.getZoom()
    }));
  }

  function setBaseLayer() {
    if (!map) return;
    if (baseLayer) map.removeLayer(baseLayer);

    const key = localStorage.getItem(MAP_KEY_STORAGE)?.trim();
    if (key) {
      const url = `https://api.maptiler.com/tiles/satellite-v4/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key)}`;
      baseLayer = L.tileLayer(url, {
        minZoom: 1,
        maxZoom: 20,
        maxNativeZoom: 20,
        crossOrigin: true,
        attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a>'
      });
      $("mapKeyStatus").textContent = "Satellite mode is enabled on this device.";
      hideMapMessage();
    } else {
      baseLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        crossOrigin: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
      });
      $("mapKeyStatus").textContent = "Street-map fallback is active. Add a MapTiler key for satellite imagery.";
      showMapMessage("Street map active — add a free MapTiler key in ⚙︎ Settings for satellite imagery.", true);
    }
    baseLayer.addTo(map);
    baseLayer.bringToBack();
  }

  function initMap() {
    const v = getSavedView();
    map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    }).setView([v.lat, v.lng], v.zoom);

    L.control.zoom({ position: "bottomleft" }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    setBaseLayer();
    map.on("moveend zoomend", saveView);
  }

  function refreshMarkers() {
    markerLayer.clearLayers();
    observations.forEach((obs) => {
      if (!Number.isFinite(obs.lat) || !Number.isFinite(obs.lng)) return;
      const marker = L.marker([obs.lat, obs.lng], { icon: makeMarkerIcon(obs.category) });
      marker.on("click", () => openDetails(obs.id));
      marker.addTo(markerLayer);
    });
    $("observationCount").textContent = String(observations.length);
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      }).format(new Date(iso));
    } catch {
      return iso || "";
    }
  }

  function updateUserLocation(position, recenter = false) {
    const { latitude, longitude, accuracy } = position.coords;
    if (!userMarker) {
      userMarker = L.marker([latitude, longitude], { icon: makeUserIcon(), interactive: false }).addTo(map);
    } else {
      userMarker.setLatLng([latitude, longitude]);
    }
    if (userAccuracyCircle) userAccuracyCircle.remove();
    userAccuracyCircle = L.circle([latitude, longitude], {
      radius: Math.min(Math.max(accuracy || 0, 3), 200),
      interactive: false,
      weight: 1,
      opacity: 0.5,
      fillOpacity: 0.08
    }).addTo(map);

    if (recenter) map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
    return { lat: latitude, lng: longitude, accuracy: accuracy || null };
  }

  function requestLocation({ recenter = false, setForm = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = new Error("Location is not supported by this browser.");
        reject(err);
        return;
      }
      if (setForm) {
        $("locationStatus").textContent = "Getting GPS position…";
        $("coordinatesText").textContent = "This can take a few seconds outdoors.";
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = updateUserLocation(position, recenter);
          if (setForm) setFormLocation(loc);
          resolve(loc);
        },
        (error) => {
          if (setForm) {
            $("locationStatus").textContent = "GPS unavailable";
            $("coordinatesText").textContent = "You can use the map center instead.";
          }
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
      );
    });
  }

  function setFormLocation(loc) {
    formLocation = {
      lat: Number(loc.lat),
      lng: Number(loc.lng),
      accuracy: Number.isFinite(loc.accuracy) ? Number(loc.accuracy) : null
    };
    $("locationStatus").textContent = loc.accuracy ? `GPS set (±${Math.round(loc.accuracy)} m)` : "Location set";
    $("coordinatesText").textContent = `${formLocation.lat.toFixed(6)}, ${formLocation.lng.toFixed(6)}`;
  }

  function openBackdrop() {
    $("sheetBackdrop").classList.remove("hidden");
  }

  function closeAllSheets() {
    ["observationSheet", "settingsSheet", "detailsSheet"].forEach(id => $(id).classList.add("hidden"));
    $("sheetBackdrop").classList.add("hidden");
  }

  function resetObservationForm() {
    $("observationForm").reset();
    $("obsId").value = "";
    $("deleteBtn").classList.add("hidden");
    $("obsHeading").textContent = "New observation";
    $("formError").classList.add("hidden");
    $("formError").textContent = "";
    formPhotos = [];
    formLocation = null;
    renderPhotoPreviews();
    $("locationStatus").textContent = "Getting GPS position…";
    $("coordinatesText").textContent = "This can take a few seconds outdoors.";
  }

  async function openNewObservation() {
    resetObservationForm();
    closeAllSheets();
    openBackdrop();
    $("observationSheet").classList.remove("hidden");
    try {
      await requestLocation({ setForm: true, recenter: false });
    } catch {
      showToast("GPS was not available. You can use the map center.");
    }
  }

  function obsById(id) {
    return observations.find(o => o.id === id);
  }

  async function openEditObservation(id) {
    const obs = obsById(id);
    if (!obs) return;
    closeAllSheets();
    openBackdrop();
    $("observationSheet").classList.remove("hidden");
    $("obsHeading").textContent = "Edit observation";
    $("obsId").value = obs.id;
    $("titleInput").value = obs.title || "";
    $("notesInput").value = obs.notes || "";
    const radio = document.querySelector(`input[name="category"][value="${CSS.escape(obs.category || "other")}"]`);
    if (radio) radio.checked = true;
    formLocation = { lat: obs.lat, lng: obs.lng, accuracy: obs.accuracy ?? null };
    setFormLocation(formLocation);
    formPhotos = Array.isArray(obs.photos) ? obs.photos.slice() : [];
    renderPhotoPreviews();
    $("deleteBtn").classList.remove("hidden");
  }

  function openDetails(id) {
    const obs = obsById(id);
    if (!obs) return;
    selectedObservationId = id;
    const info = categoryInfo[obs.category] || categoryInfo.other;
    const photos = (obs.photos || []).map((p) => `<img src="${p.dataUrl}" alt="Observation photo">`).join("");
    $("detailsContent").innerHTML = `
      <div class="details-meta">${info.icon} ${escapeHtml(info.label)} · ${escapeHtml(formatDate(obs.createdAt))}</div>
      <h2 class="details-title">${escapeHtml(obs.title || info.label)}</h2>
      ${obs.notes ? `<div class="details-notes">${escapeHtml(obs.notes)}</div>` : ""}
      <div class="details-meta" style="margin-top:12px">${obs.lat.toFixed(6)}, ${obs.lng.toFixed(6)}${obs.accuracy ? ` · ±${Math.round(obs.accuracy)} m` : ""}</div>
      ${photos ? `<div class="details-photos">${photos}</div>` : ""}
    `;
    closeAllSheets();
    openBackdrop();
    $("detailsSheet").classList.remove("hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  async function fileToCompressedDataUrl(file) {
    if (!file.type.startsWith("image/")) throw new Error("Only image files are supported.");
    const sourceUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = sourceUrl;
      });

      const MAX = 1600;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const scale = Math.min(1, MAX / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function renderPhotoPreviews() {
    const wrap = $("photoPreview");
    wrap.innerHTML = "";
    formPhotos.forEach((photo, index) => {
      const item = document.createElement("div");
      item.className = "photo-item";
      item.innerHTML = `<img src="${photo.dataUrl}" alt="Selected photo ${index + 1}"><button type="button" aria-label="Remove photo ${index + 1}">×</button>`;
      item.querySelector("button").addEventListener("click", () => {
        formPhotos.splice(index, 1);
        renderPhotoPreviews();
      });
      wrap.appendChild(item);
    });
  }

  async function handlePhotos(files) {
    const remaining = Math.max(0, 3 - formPhotos.length);
    const selected = Array.from(files).slice(0, remaining);
    if (!selected.length) {
      if (formPhotos.length >= 3) showToast("Maximum 3 photos per observation.");
      return;
    }
    showToast("Preparing photo…");
    for (const file of selected) {
      try {
        const dataUrl = await fileToCompressedDataUrl(file);
        formPhotos.push({ dataUrl, name: file.name || "photo.jpg" });
      } catch (e) {
        console.error(e);
        showToast("One photo could not be processed.");
      }
    }
    renderPhotoPreviews();
    $("photoInput").value = "";
  }

  async function saveObservation(event) {
    event.preventDefault();
    const errorEl = $("formError");
    errorEl.classList.add("hidden");
    errorEl.textContent = "";

    if (!formLocation || !Number.isFinite(formLocation.lat) || !Number.isFinite(formLocation.lng)) {
      errorEl.textContent = "Please set a location using GPS or the map center.";
      errorEl.classList.remove("hidden");
      return;
    }

    const id = $("obsId").value || (crypto.randomUUID ? crypto.randomUUID() : `obs-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const existing = obsById(id);
    const category = document.querySelector('input[name="category"]:checked')?.value || "other";
    const now = new Date().toISOString();
    const obs = {
      id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      category,
      title: $("titleInput").value.trim(),
      notes: $("notesInput").value.trim(),
      lat: formLocation.lat,
      lng: formLocation.lng,
      accuracy: formLocation.accuracy,
      photos: formPhotos.slice()
    };

    try {
      $("saveBtn").disabled = true;
      await idbPut(obs);
      await loadObservations();
      closeAllSheets();
      map.setView([obs.lat, obs.lng], Math.max(map.getZoom(), 16));
      showToast(existing ? "Observation updated." : "Observation saved.");
    } catch (e) {
      console.error(e);
      errorEl.textContent = "Could not save the observation. Device storage may be full.";
      errorEl.classList.remove("hidden");
    } finally {
      $("saveBtn").disabled = false;
    }
  }

  async function deleteCurrentObservation() {
    const id = $("obsId").value;
    if (!id) return;
    if (!confirm("Delete this observation? This cannot be undone unless you have a backup.")) return;
    await idbDelete(id);
    await loadObservations();
    closeAllSheets();
    showToast("Observation deleted.");
  }

  async function loadObservations() {
    observations = await idbGetAll();
    observations.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    refreshMarkers();
  }

  function openSettings() {
    closeAllSheets();
    openBackdrop();
    $("settingsSheet").classList.remove("hidden");
    $("maptilerKeyInput").value = localStorage.getItem(MAP_KEY_STORAGE) || "";
    $("observationCount").textContent = String(observations.length);
  }

  function saveMapKey() {
    const key = $("maptilerKeyInput").value.trim();
    if (!key) {
      showToast("Paste a MapTiler API key first.");
      return;
    }
    localStorage.setItem(MAP_KEY_STORAGE, key);
    setBaseLayer();
    showToast("Satellite map enabled.");
  }

  function clearMapKey() {
    localStorage.removeItem(MAP_KEY_STORAGE);
    $("maptilerKeyInput").value = "";
    setBaseLayer();
    showToast("Street-map fallback enabled.");
  }

  async function exportBackup() {
    const payload = {
      format: "forest-log-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      observations
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const name = `forest-log-backup-${new Date().toISOString().slice(0,10)}.json`;
    const file = new File([blob], name, { type: "application/json" });

    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "Forest Log backup" });
        $("backupStatus").textContent = "Backup shared/exported.";
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.warn("Share failed; falling back to download.", e);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("backupStatus").textContent = "Backup downloaded.";
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload?.format !== "forest-log-backup" || !Array.isArray(payload.observations)) {
        throw new Error("Not a Forest Log backup.");
      }
      if (!confirm(`Import ${payload.observations.length} observations? Existing observations with the same ID will be replaced.`)) return;

      for (const obs of payload.observations) {
        if (!obs || !obs.id || !Number.isFinite(Number(obs.lat)) || !Number.isFinite(Number(obs.lng))) continue;
        obs.lat = Number(obs.lat);
        obs.lng = Number(obs.lng);
        await idbPut(obs);
      }
      await loadObservations();
      $("backupStatus").textContent = `Imported backup with ${payload.observations.length} observations.`;
      showToast("Backup imported.");
    } catch (e) {
      console.error(e);
      $("backupStatus").textContent = "Could not import this file.";
      showToast("Backup import failed.");
    } finally {
      $("importInput").value = "";
    }
  }

  function bindEvents() {
    $("locateBtn").addEventListener("click", async () => {
      try {
        await requestLocation({ recenter: true });
        showToast("Location updated.");
      } catch (e) {
        showToast("Could not get your location. Check iPhone location permission.");
      }
    });

    $("addBtn").addEventListener("click", openNewObservation);
    $("settingsBtn").addEventListener("click", openSettings);
    $("observationForm").addEventListener("submit", saveObservation);
    $("deleteBtn").addEventListener("click", deleteCurrentObservation);
    $("photoInput").addEventListener("change", (e) => handlePhotos(e.target.files));

    $("useMapCenterBtn").addEventListener("click", () => {
      const c = map.getCenter();
      setFormLocation({ lat: c.lat, lng: c.lng, accuracy: null });
      showToast("Using map center.");
    });

    document.querySelectorAll(".close-sheet").forEach(btn => btn.addEventListener("click", closeAllSheets));
    document.querySelectorAll(".close-settings").forEach(btn => btn.addEventListener("click", closeAllSheets));
    document.querySelectorAll(".close-details").forEach(btn => btn.addEventListener("click", closeAllSheets));
    $("sheetBackdrop").addEventListener("click", closeAllSheets);

    $("saveMapKeyBtn").addEventListener("click", saveMapKey);
    $("clearMapKeyBtn").addEventListener("click", clearMapKey);
    $("toggleKeyBtn").addEventListener("click", () => {
      const input = $("maptilerKeyInput");
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      $("toggleKeyBtn").textContent = showing ? "Show" : "Hide";
    });

    $("exportBtn").addEventListener("click", exportBackup);
    $("importInput").addEventListener("change", (e) => importBackup(e.target.files?.[0]));

    $("editDetailsBtn").addEventListener("click", () => {
      if (selectedObservationId) openEditObservation(selectedObservationId);
    });

    window.addEventListener("online", () => showToast("Back online."));
    window.addEventListener("offline", () => showToast("Offline: saved observations still work; map imagery may not."));
  }

  async function init() {
    try {
      db = await openDb();
      initMap();
      bindEvents();
      await loadObservations();

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(console.warn);
      }

      // Ask only when the user presses Locate/Add. This avoids an intrusive prompt on first launch.
    } catch (e) {
      console.error(e);
      alert("Forest Log could not start. Please reload the page.");
    }
  }

  init();
})();
