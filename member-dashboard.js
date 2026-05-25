/* ============================================================
   Member Dashboard — controller
   ============================================================ */

(function () {
  const db = window.TPLC;
  let dashData = null;
  let map = null;
  let radiusCircle = null;

  /* ---------- Auth gate ---------- */
  async function checkAuth() {
    const sess = db.memberSession.get();
    if (!sess) { window.location.href = 'Sign In.html'; return false; }
    try {
      const res = await db.onboarding.verify(sess.refCode, sess.password);
      if (!res.ok || !res.onboarded) {
        db.memberSession.clear();
        window.location.href = 'Sign In.html';
        return false;
      }
      return true;
    } catch {
      db.memberSession.clear();
      window.location.href = 'Sign In.html';
      return false;
    }
  }

  /* ---------- Routing ---------- */
  const state = { page: 'home' };

  function setPage(name) {
    state.page = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === name));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
    if (name === 'home') renderHome();
    if (name === 'week') renderWeek();
    if (name === 'carnet') renderCarnet();
    if (name === 'profil') renderProfil();
  }

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function initials(first, last) {
    return ((first || '')[0] || '') + ((last || '')[0] || '');
  }
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function formatShortDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  /* ============================================================
     HOME PAGE
     ============================================================ */
  async function renderHome() {
    const container = document.getElementById('homePage');
    try {
      const res = await db.member.dashboard();
      if (!res.ok) { db.memberSession.clear(); window.location.href = 'Sign In.html'; return; }
      dashData = res;

      const m = res.member;
      const s = res.stats;
      const remaining = Math.max(0, s.monthLimit - s.monthLunches);
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon apres-midi' : 'Bonsoir';

      container.innerHTML = `
        <div class="greeting fade-in">
          <div class="eyebrow">Espace membre</div>
          <h1>${greeting}, <span class="italic">${esc(m.firstName)}</span>.</h1>
        </div>

        <div class="stat-cards fade-in" style="animation-delay:80ms">
          <div class="stat-card">
            <div class="number">${s.peopleMet}</div>
            <div class="label">Rencontres</div>
          </div>
          <div class="stat-card">
            <div class="number">${remaining}<span class="small">/${s.monthLimit}</span></div>
            <div class="label">Credits ce mois</div>
          </div>
        </div>

        <div class="stat-cards fade-in" style="animation-delay:120ms">
          <div class="stat-card subtle">
            <div class="number">${s.lunchesAttended}</div>
            <div class="label">Dejeuners au total</div>
          </div>
          <div class="stat-card subtle">
            <div class="number">${s.monthLunches}</div>
            <div class="label">Ce mois-ci</div>
          </div>
        </div>

        <div class="section fade-in" style="animation-delay:200ms">
          <div class="section-head">
            <div class="eyebrow">Prochain dejeuner</div>
          </div>
          <div class="empty-card">
            <p>Pas encore de dejeuner prevu.</p>
            <p class="muted">Indique tes disponibilites, on s'occupe du reste.</p>
            <button class="btn-action" id="goWeekBtn">Ma semaine <span class="arrow">&rarr;</span></button>
          </div>
        </div>

        ${s.peopleMet > 0 ? `
        <div class="section fade-in" style="animation-delay:280ms">
          <div class="section-head">
            <div class="eyebrow">Dernieres rencontres</div>
          </div>
          <div id="homeConnections"></div>
        </div>` : ''}
      `;

      document.getElementById('goWeekBtn')?.addEventListener('click', () => setPage('week'));

      // Load recent connections for home page
      if (s.peopleMet > 0) {
        const conRes = await db.member.connections();
        if (conRes.ok && conRes.connections?.length) {
          const recent = conRes.connections.slice(0, 3);
          document.getElementById('homeConnections').innerHTML = recent.map(c => connectionCard(c)).join('');
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
      container.innerHTML = `<div class="empty-card"><p>Erreur de chargement. Reessaie.</p></div>`;
    }
  }

  function connectionCard(c) {
    return `
      <div class="connection-card">
        <div class="avatar">${esc(initials(c.firstName, c.lastName))}</div>
        <div class="info">
          <div class="name">${esc(c.firstName)} ${esc(c.lastName)}</div>
          <div class="meta">${esc(c.profession || '')}${c.employer ? ' · ' + esc(c.employer) : ''}</div>
        </div>
        <div class="date">${c.lunchDate ? formatShortDate(c.lunchDate) : ''}</div>
      </div>
    `;
  }

  /* ============================================================
     WEEK PAGE (Availability + Map)
     ============================================================ */
  async function renderWeek() {
    const container = document.getElementById('weekPage');

    // Build next 7 days
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    // Get current availability
    let selectedDates = [];
    let monthCount = 0;
    try {
      const avail = await db.member.getAvailability();
      if (avail.ok) {
        selectedDates = (avail.dates || []).map(d => d);
        // Count this month's selections
        const thisMonth = today.toISOString().slice(0, 7);
        monthCount = selectedDates.filter(d => d.startsWith(thisMonth)).length;
      }
    } catch (err) { console.error('Availability load error:', err); }

    container.innerHTML = `
      <div class="greeting fade-in">
        <div class="eyebrow">Disponibilites</div>
        <h1>Quand es-tu <span class="italic">libre</span> ?</h1>
        <p class="help">Choisis tes jours, on t'organise un dejeuner en tete-a-tete.</p>
      </div>

      <div class="week-grid fade-in" style="animation-delay:80ms" id="weekGrid">
        ${days.map(d => {
          const iso = d.toISOString().slice(0, 10);
          const isSelected = selectedDates.includes(iso);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return `
            <button class="day-card${isSelected ? ' selected' : ''}${isWeekend ? ' weekend' : ''}"
                    data-date="${iso}" ${isWeekend ? 'disabled' : ''}>
              <span class="day-name">${dayNames[d.getDay()]}</span>
              <span class="day-num">${d.getDate()}</span>
              <span class="day-check">${isSelected ? '&#10003;' : ''}</span>
            </button>
          `;
        }).join('')}
      </div>

      <div class="month-counter fade-in" style="animation-delay:120ms" id="monthCounter">
        <span id="monthCount">${monthCount}</span> / 4 dejeuners ce mois
      </div>

      <div class="section fade-in" style="animation-delay:200ms">
        <div class="section-head">
          <div class="eyebrow">Ou dejeuner ?</div>
        </div>
        <div class="map-wrap" id="mapWrap"></div>
        <div class="radius-selector" id="radiusSelector">
          <button class="radius-btn" data-r="1">1 km</button>
          <button class="radius-btn active" data-r="2">2 km</button>
          <button class="radius-btn" data-r="5">5 km</button>
        </div>
      </div>
    `;

    wireWeek(selectedDates, monthCount);
    initMap();
  }

  function wireWeek(selectedDates, monthCount) {
    const grid = document.getElementById('weekGrid');
    const counterEl = document.getElementById('monthCount');

    grid.querySelectorAll('.day-card:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const date = btn.dataset.date;
        const isSelected = btn.classList.contains('selected');

        // Check month limit before adding
        if (!isSelected && monthCount >= 4) {
          btn.classList.add('shake');
          setTimeout(() => btn.classList.remove('shake'), 400);
          return;
        }

        btn.classList.toggle('selected');
        const check = btn.querySelector('.day-check');

        try {
          const res = await db.member.toggleAvailability(date);
          if (res.ok) {
            if (res.action === 'added') {
              check.innerHTML = '&#10003;';
              monthCount++;
            } else {
              check.innerHTML = '';
              monthCount--;
            }
            counterEl.textContent = monthCount;
          } else if (res.error === 'month_limit') {
            btn.classList.remove('selected');
            check.innerHTML = '';
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 400);
          }
        } catch (err) {
          console.error('Toggle error:', err);
          btn.classList.toggle('selected');
        }
      });
    });
  }

  async function initMap() {
    const wrap = document.getElementById('mapWrap');
    if (!wrap || typeof L === 'undefined') return;

    let lat = 48.8566, lng = 2.3522, radius = 2;

    try {
      const prefs = await db.member.getPreferences();
      if (prefs.ok) {
        lat = prefs.prefs.lat || lat;
        lng = prefs.prefs.lng || lng;
        radius = prefs.prefs.radius || radius;
      }
    } catch {}

    // Set active radius button
    document.querySelectorAll('.radius-btn').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.r) === radius);
    });

    map = L.map(wrap, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    radiusCircle = L.circle([lat, lng], {
      radius: radius * 1000,
      color: '#C9A37A',
      fillColor: '#C9A37A',
      fillOpacity: 0.12,
      weight: 1.5
    }).addTo(map);

    // Fit map to circle
    map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });

    // Draggable center
    const marker = L.circleMarker([lat, lng], {
      radius: 6,
      color: '#F4F1EA',
      fillColor: '#F4F1EA',
      fillOpacity: 1,
      weight: 2
    }).addTo(map);

    // Map click to move center
    map.on('click', async (e) => {
      const newLat = e.latlng.lat;
      const newLng = e.latlng.lng;
      marker.setLatLng([newLat, newLng]);
      radiusCircle.setLatLng([newLat, newLng]);
      map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
      try {
        await db.member.setPreferences(radius, newLat, newLng);
      } catch {}
    });

    // Radius buttons
    document.querySelectorAll('.radius-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.radius-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        radius = parseFloat(btn.dataset.r);
        radiusCircle.setRadius(radius * 1000);
        map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
        const center = radiusCircle.getLatLng();
        try {
          await db.member.setPreferences(radius, center.lat, center.lng);
        } catch {}
      });
    });
  }

  /* ============================================================
     CARNET PAGE (People met)
     ============================================================ */
  async function renderCarnet() {
    const container = document.getElementById('carnetPage');
    container.innerHTML = `
      <div class="greeting fade-in">
        <div class="eyebrow">Carnet</div>
        <h1>Tes <span class="italic">rencontres</span>.</h1>
      </div>
      <div id="carnetList" class="fade-in" style="animation-delay:80ms">
        <div class="loading">Chargement...</div>
      </div>
    `;

    try {
      const res = await db.member.connections();
      const list = document.getElementById('carnetList');
      if (!res.ok || !res.connections?.length) {
        list.innerHTML = `
          <div class="empty-card">
            <p>Ton carnet est vide pour l'instant.</p>
            <p class="muted">Apres ton premier dejeuner, les personnes rencontrees apparaitront ici.</p>
          </div>
        `;
        return;
      }
      list.innerHTML = res.connections.map(c => `
        <div class="connection-card">
          <div class="avatar">${esc(initials(c.firstName, c.lastName))}</div>
          <div class="info">
            <div class="name">${esc(c.firstName)} ${esc(c.lastName)}</div>
            <div class="meta">${esc(c.profession || '')}${c.employer ? ' · ' + esc(c.employer) : ''}</div>
            <div class="meta">${c.restaurant ? esc(c.restaurant) : ''}${c.neighborhood ? ' · ' + esc(c.neighborhood) : ''}</div>
          </div>
          <div class="date">${c.lunchDate ? formatShortDate(c.lunchDate) : ''}</div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Connections load error:', err);
      document.getElementById('carnetList').innerHTML = `
        <div class="empty-card"><p>Erreur de chargement.</p></div>
      `;
    }
  }

  /* ============================================================
     PROFIL PAGE
     ============================================================ */
  async function renderProfil() {
    const container = document.getElementById('profilPage');
    const data = dashData || (await (async () => {
      const r = await db.member.dashboard();
      if (r.ok) { dashData = r; return r; }
      return null;
    })());

    if (!data || !data.ok) {
      container.innerHTML = `<div class="empty-card"><p>Erreur de chargement.</p></div>`;
      return;
    }

    const m = data.member;
    const planLabel = m.plan === 'patron' ? 'Patron' : 'Standard';
    const planPrice = m.plan === 'patron' ? '180' : '80';
    const dob = (m.dobDay && m.dobMonth && m.dobYear) ? `${m.dobDay}/${m.dobMonth}/${m.dobYear}` : '';

    container.innerHTML = `
      <div class="greeting fade-in">
        <div class="eyebrow">Profil</div>
        <h1>${esc(m.firstName)} <span class="italic">${esc(m.lastName)}</span>.</h1>
      </div>

      <div class="profile-section fade-in" style="animation-delay:80ms">
        <div class="section-head"><div class="eyebrow">Abonnement</div></div>
        ${profilRow('Plan', `${planLabel} · ${planPrice} EUR/mois`)}
        ${profilRow('Membre depuis', formatDate(m.joinedAt))}
        ${profilRow('Code membre', m.refCode)}
      </div>

      <div class="profile-section fade-in" style="animation-delay:160ms">
        <div class="section-head"><div class="eyebrow">Mes informations</div></div>
        ${profilRow('Email', m.email)}
        ${profilRow('Telephone', (m.countryCode || '') + ' ' + (m.phone || ''))}
        ${dob ? profilRow('Date de naissance', dob) : ''}
        ${profilRow('Ville', m.city || 'Paris')}
        ${profilRow('Metier', (m.profession || '') + (m.employer ? ' · ' + m.employer : ''))}
        ${m.linkedin ? profilRow('LinkedIn', m.linkedin) : ''}
        ${m.instagram ? profilRow('Instagram', m.instagram) : ''}
      </div>

      <div class="profile-section fade-in" style="animation-delay:240ms">
        <button class="btn-logout" id="logoutBtn">Se deconnecter</button>
      </div>
    `;

    document.getElementById('logoutBtn').addEventListener('click', () => {
      db.memberSession.clear();
      window.location.href = 'Sign In.html';
    });
  }

  function profilRow(label, value) {
    return `
      <div class="profil-row">
        <div class="k">${label}</div>
        <div class="v">${esc(value || '')}</div>
      </div>
    `;
  }

  /* ============================================================
     Boot
     ============================================================ */
  (async function boot() {
    const ok = await checkAuth();
    if (!ok) return;

    // Tab bar navigation
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => setPage(t.dataset.page));
    });

    setPage('home');
  })();
})();
