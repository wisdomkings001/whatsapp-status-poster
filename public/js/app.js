async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

async function checkAuth() {
  const me = await api('/api/auth/me');
  if (!me.loggedIn) {
    window.location.href = '/login.html';
    return false;
  }
  document.getElementById('app').hidden = false;
  return true;
}

async function loadWaStatus() {
  const el = document.getElementById('waStatus');
  const banner = document.getElementById('qrBanner');
  const img = document.getElementById('qrImage');
  try {
    const s = await api('/api/whatsapp/status');
    if (s.isReady) {
      el.textContent = 'WhatsApp: connected';
      el.className = 'pill pill-ok';
      banner.hidden = true;
    } else if (s.hasQr && s.qrDataUrl) {
      el.textContent = 'WhatsApp: scan the QR code below';
      el.className = 'pill pill-warn';
      img.src = s.qrDataUrl;
      banner.hidden = false;
    } else {
      el.textContent = 'WhatsApp: starting…';
      el.className = 'pill pill-muted';
      banner.hidden = true;
    }
  } catch {
    el.textContent = 'WhatsApp: unknown';
  }
}

async function loadSchedule() {
  const list = document.getElementById('scheduleList');
  const plan = await api('/api/schedule/today');
  if (!plan.length) {
    list.innerHTML = '<p class="muted">Nothing scheduled yet. Add products and a daily opener, then rebuild the plan.</p>';
    return;
  }
  list.innerHTML = plan.map((p) => `
    <div class="schedule-row">
      <img src="${p.imagePath}" alt="">
      <span class="schedule-time">${fmtTime(p.time)}</span>
      <span class="schedule-tag">${p.type}</span>
      <span class="muted">${p.caption || ''}</span>
    </div>
  `).join('');
}

async function loadLog() {
  const list = document.getElementById('logList');
  const rows = await api('/api/settings/log');
  if (!rows.length) {
    list.innerHTML = '<p class="muted">No posts yet.</p>';
    return;
  }
  list.innerHTML = rows.slice(0, 30).map((r) => `
    <div class="schedule-row">
      ${r.image_path ? `<img src="${r.image_path}" alt="">` : ''}
      <span class="schedule-time">${fmtTime(r.posted_at)}</span>
      <span class="schedule-tag">${r.was_opener ? 'opener' : 'regular'}</span>
      <span class="muted">${r.caption_used || ''}</span>
    </div>
  `).join('');
}

async function loadProducts() {
  const grid = document.getElementById('productGrid');
  const countEl = document.getElementById('productCount');
  const products = await api('/api/products');
  countEl.textContent = `${products.length} total`;

  if (!products.length) {
    grid.innerHTML = '<p class="muted">No products yet — add one on the left.</p>';
    return;
  }

  grid.innerHTML = products.map((p) => `
    <div class="product-card" data-id="${p.id}">
      <img src="${p.image_path}" alt="">
      <div class="product-body">
        <div class="product-caption">${p.caption || '<span class="muted">No caption</span>'}</div>
        <div class="product-meta">
          <span>${p.active ? 'active' : 'inactive'}</span>
          ${p.is_daily_opener ? '<span class="opener-badge">opener</span>' : ''}
        </div>
        <div class="product-actions">
          <button class="btn-secondary" data-action="opener">${p.is_daily_opener ? 'Unset opener' : 'Make opener'}</button>
          <button class="btn-secondary" data-action="toggle">${p.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn-secondary" data-action="delete">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.product-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-action="opener"]').addEventListener('click', async () => {
      const isOpener = card.querySelector('.opener-badge');
      const fd = new FormData();
      fd.append('is_daily_opener', isOpener ? 'false' : 'true');
      await api(`/api/products/${id}`, { method: 'PUT', body: fd });
      await loadProducts();
      await loadSchedule();
    });
    card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
      const activeNow = card.querySelector('.product-meta span').textContent === 'active';
      const fd = new FormData();
      fd.append('active', activeNow ? 'false' : 'true');
      await api(`/api/products/${id}`, { method: 'PUT', body: fd });
      await loadProducts();
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('Delete this product?')) return;
      await api(`/api/products/${id}`, { method: 'DELETE' });
      await loadProducts();
      await loadSchedule();
    });
  });
}

async function loadCaptions() {
  const list = document.getElementById('captionList');
  const rows = await api('/api/products/captions/pool');
  if (!rows.length) {
    list.innerHTML = '<li class="muted">No generic captions yet.</li>';
    return;
  }
  list.innerHTML = rows.map((c) => `
    <li data-id="${c.id}">
      <span>${c.text}</span>
      <button data-action="delete">✕</button>
    </li>
  `).join('');
  list.querySelectorAll('li').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('button').addEventListener('click', async () => {
      await api(`/api/products/captions/pool/${id}`, { method: 'DELETE' });
      await loadCaptions();
    });
  });
}

async function loadSettings() {
  const settings = await api('/api/settings');
  const form = document.getElementById('settingsForm');
  for (const [key, value] of Object.entries(settings)) {
    if (form[key]) form[key].value = value;
  }
}

function wireForms() {
  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/api/products', { method: 'POST', body: fd });
    e.target.reset();
    await loadProducts();
    await loadSchedule();
  });

  document.getElementById('captionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/api/products/captions/pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fd.get('text') })
    });
    e.target.reset();
    await loadCaptions();
  });

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const saved = document.getElementById('settingsSaved');
    saved.hidden = false;
    setTimeout(() => { saved.hidden = true; }, 2000);
  });

  document.getElementById('overrideForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const today = new Date().toISOString().slice(0, 10);
    await api('/api/settings/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, quota: fd.get('quota') })
    });
    e.target.reset();
    alert('Quota override set for today. Rebuild the plan to apply it.');
  });

  document.getElementById('rebuildBtn').addEventListener('click', async () => {
    await api('/api/schedule/rebuild', { method: 'POST' });
    await loadSchedule();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

(async function main() {
  const ok = await checkAuth();
  if (!ok) return;
  wireForms();
  await Promise.all([
    loadWaStatus(),
    loadSchedule(),
    loadProducts(),
    loadCaptions(),
    loadSettings(),
    loadLog()
  ]);
  setInterval(loadWaStatus, 5000);
})();
