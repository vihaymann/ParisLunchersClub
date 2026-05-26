/* ============================================================
   Member Dashboard — Le Carnet (controller)
   Three pages: Today / Room / Carnet
   ============================================================ */

(function () {
  const db = window.TPLC;
  let dashData = null;
  let map = null;

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
  const state = { page: 'today' };

  function setPage(name) {
    state.page = name;
    document.querySelectorAll('.rail-item').forEach(t => t.classList.toggle('active', t.dataset.page === name));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
    if (name === 'today')  renderToday();
    if (name === 'room')   renderRoom();
    if (name === 'carnet') renderCarnet();
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
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function formatMonthYear(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  function formatShortDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function formatTodayDate() {
    const d = new Date();
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function avatarClass(first, last) {
    const hash = ((first || 'A').charCodeAt(0) + (last || 'A').charCodeAt(0)) % 5;
    return 'av-' + hash;
  }
  function formatExpiry(createdAt, days = 7) {
    if (!createdAt) return null;
    const created = new Date(createdAt).getTime();
    if (isNaN(created)) return null;
    const expiresAt = created + days * 24 * 60 * 60 * 1000;
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const d = Math.floor(diff / (24 * 60 * 60 * 1000));
    const h = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (d === 0) {
      const m = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    return `${d}d ${h}h`;
  }

  /* ---------- Editorial fixture data ---------- */
  const TODAY_TAGLINES = [
    'Marais is quiet tonight. Three lunches happening in Saint-Germain.',
    'The Membership Committee meets on Thursday. Until then, the room is open.',
    'A patron is hosting in the 8th this week.',
    'Le Passage is fully booked. Try Pigalle.',
    'Two new patrons joined this season.',
    'Tonight, four lunches across the right bank.',
    'Saint-Germain has the most demand this week.',
    'The room is fuller than usual for a Tuesday.',
    'A new chef joined last week. He’s looking for editors.',
    'Brussels members are visiting Paris through Sunday.'
  ];
  function dailyTagline() {
    return TODAY_TAGLINES[Math.floor(Math.random() * TODAY_TAGLINES.length)];
  }

  const RECENTLY_JOINED = [
    'a museum curator',
    'a venture partner',
    'an editor at Vogue',
    'a composer',
    'a gallery director',
    'an art dealer',
    'a chef from Lyon',
    'a restaurant critic',
    'a fund partner',
    'an architect',
    'a screenwriter',
    'a perfumer',
    'an anonymous donor',
    'a film producer',
    'a sommelier'
  ];
  function pickRecentlyJoined(n = 5) {
    const a = RECENTLY_JOINED.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n).join(' · ');
  }

  /* ---------- Next lunch block ---------- */
  function renderNextLunchBlock(nextRes) {
    if (!nextRes || !nextRes.ok || !nextRes.lunch) {
      return `<p class="next-lunch-empty">No lunch this week. Set your days below.</p>`;
    }
    const ln = nextRes.lunch;
    const d = new Date(ln.date);
    const when = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    const neighborhood = ln.neighborhood ? ln.neighborhood : '';
    const whenLine = [when, time, neighborhood].filter(Boolean).join(' · ');
    const initials = ((ln.partnerFirstName || '')[0] || '') + ((ln.partnerLastName || '')[0] || '');
    const partnerName = ln.reveal ? `${ln.partnerFirstName} ${ln.partnerLastName}` : ln.partnerFirstName;
    const editorial = ln.reveal
      ? `Reveal: ${esc(ln.partnerFirstName)} has been waiting for the right table.`
      : `One member, hand-paired. Their name appears 24 hours before you sit down.`;

    return `
      <div class="next-lunch">
        <div class="restaurant">${esc(ln.restaurant || '—')}</div>
        <div class="when">${esc(whenLine)}</div>
        <div class="with">
          <div class="avatar ${avatarClass(ln.partnerFirstName, ln.partnerLastName)}"
               style="${ln.reveal ? '' : 'filter: blur(7px);'}">
            ${esc(initials)}
          </div>
          <div>
            <div class="name">${ln.reveal ? esc(partnerName) : esc(partnerName)}</div>
            <div class="reveal">${ln.reveal ? 'Revealed' : 'Revealed 24 hours before'}</div>
          </div>
        </div>
        <p class="editorial">${editorial}</p>
      </div>
    `;
  }

  /* ============================================================
     TODAY — next lunch / your week / where you eat
     ============================================================ */
  async function renderToday() {
    const container = document.getElementById('todayPage');
    try {
      const [dashRes, availRes, nextRes] = await Promise.all([
        db.member.dashboard(),
        db.member.getAvailability().catch(() => ({ ok: false })),
        db.member.nextLunch().catch(() => ({ ok: false }))
      ]);

      if (!dashRes.ok) { db.memberSession.clear(); window.location.href = 'Sign In.html'; return; }
      dashData = dashRes;

      const m = dashRes.member;
      const railWho = document.getElementById('railWho');
      if (railWho) railWho.textContent = m.firstName;
      const brandDate = document.getElementById('brandDate');
      if (brandDate) brandDate.textContent = formatTodayDate();

      // 5 weekdays
      const days = [];
      let cursor = new Date();
      while (days.length < 5) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

      let selectedDates = [];
      let monthCount = 0;
      if (availRes.ok) {
        selectedDates = (availRes.dates || []).map(d => d);
        const today = new Date();
        const thisMonth = today.toISOString().slice(0, 7);
        monthCount = selectedDates.filter(d => d.startsWith(thisMonth)).length;
      }

      container.innerHTML = `
        <div class="slide-up">
          <div class="eyebrow">Today · ${esc(formatTodayDate())}</div>
          <h1 class="page-title">${esc(m.firstName)}.</h1>
          <p class="page-tagline">${esc(dailyTagline())}</p>
        </div>

        <div class="section slide-up" style="--delay:120ms">
          <div class="section-head">
            <div class="section-title">Your next lunch</div>
          </div>
          ${renderNextLunchBlock(nextRes)}
        </div>

        <div class="section slide-up" style="--delay:220ms">
          <div class="section-head">
            <div class="section-title">This week's availabilities</div>
            <div class="section-aside"><span id="monthCount">${monthCount}</span> / 4 this month</div>
          </div>
          <div class="week-grid" id="weekGrid">
            ${days.map(d => {
              const iso = d.toISOString().slice(0, 10);
              const isSelected = selectedDates.includes(iso);
              return `
                <button class="day-card${isSelected ? ' selected' : ''}" data-date="${iso}">
                  <span class="day-name">${dayNames[d.getDay()]}</span>
                  <span class="day-num">${d.getDate()}</span>
                  <span class="day-status">${isSelected ? 'Available' : '—'}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="section slide-up" style="--delay:320ms">
          <div class="section-head">
            <div class="section-title">Where you'll lunch</div>
            <div class="section-aside" id="arrCountAside">— selected</div>
          </div>
          <div class="map-wrap" id="mapWrap"></div>
          <div class="arr-chips" id="arrChips"></div>
        </div>
      `;

      wireWeek(selectedDates, monthCount);
      initMap();
    } catch (err) {
      console.error('Today load error:', err);
      container.innerHTML = `<p class="next-lunch-empty">Something went wrong. Please try again.</p>`;
    }
  }

  /* ============ Week wiring ============ */
  function wireWeek(selectedDates, monthCount) {
    const grid = document.getElementById('weekGrid');
    if (!grid) return;
    const counterEl = document.getElementById('monthCount');

    grid.querySelectorAll('.day-card').forEach(btn => {
      const statusEl = btn.querySelector('.day-status');
      btn.addEventListener('click', async () => {
        const date = btn.dataset.date;
        const isSelected = btn.classList.contains('selected');

        if (!isSelected && monthCount >= 4) {
          btn.classList.add('shake');
          setTimeout(() => btn.classList.remove('shake'), 400);
          return;
        }
        btn.classList.toggle('selected');
        if (statusEl) statusEl.textContent = btn.classList.contains('selected') ? 'Available' : '—';
        try {
          const res = await db.member.toggleAvailability(date);
          if (res.ok) {
            if (res.action === 'added') monthCount++;
            else monthCount--;
            counterEl.textContent = monthCount;
          } else if (res.error === 'month_limit') {
            btn.classList.remove('selected');
            if (statusEl) statusEl.textContent = '—';
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 400);
          }
        } catch (err) {
          console.error('Toggle error:', err);
          btn.classList.toggle('selected');
          if (statusEl) statusEl.textContent = btn.classList.contains('selected') ? 'Available' : '—';
        }
      });
    });
  }

  /* ============ Arrondissement map ============ */
  // Density score (office + creative blend) — 0..10. Drives heatmap opacity.
  const ARR_DENSITY = {
    1: 9, 2: 8, 3: 7, 4: 8, 5: 5, 6: 9, 7: 6, 8: 10,
    9: 9, 10: 6, 11: 7, 12: 4, 13: 4, 14: 4, 15: 5,
    16: 7, 17: 7, 18: 5, 19: 3, 20: 3
  };
  const ARR_ORDINAL = ['', '1ᵉʳ', '2ᵉ', '3ᵉ', '4ᵉ', '5ᵉ', '6ᵉ', '7ᵉ', '8ᵉ', '9ᵉ',
                       '10ᵉ', '11ᵉ', '12ᵉ', '13ᵉ', '14ᵉ', '15ᵉ', '16ᵉ', '17ᵉ', '18ᵉ',
                       '19ᵉ', '20ᵉ'];
  let arrGeojson = null;
  let arrLayer = null;
  let arrLabels = [];
  let selectedArrs = new Set();

  async function loadArrGeojson() {
    if (arrGeojson) return arrGeojson;
    const res = await fetch('assets/paris-arrondissements.geojson');
    arrGeojson = await res.json();
    return arrGeojson;
  }

  function styleArr(featureArr, isSelected, isHover) {
    const density = ARR_DENSITY[featureArr] || 0;
    const heat = 0.015 + (density / 10) * 0.055;        // 0.015..0.07 — truly subtle
    if (isSelected) {
      return {
        color: '#4F9B65', weight: 1.6,
        fillColor: '#4F9B65', fillOpacity: 0.20
      };
    }
    return {
      color: '#3a3935', weight: 1,
      fillColor: '#F4F1EA',
      fillOpacity: isHover ? heat + 0.05 : heat
    };
  }

  function arrFromFeature(f) {
    return f.properties?.c_ar ?? f.properties?.arrondissement ?? null;
  }

  function updateChips() {
    const chipsEl = document.getElementById('arrChips');
    const aside = document.getElementById('arrCountAside');
    if (!chipsEl) return;
    const arr = Array.from(selectedArrs).sort((a, b) => a - b);
    aside.textContent = arr.length
      ? `${arr.length} selected`
      : '— select on the map';
    if (!arr.length) {
      chipsEl.innerHTML = `<span class="arr-chip-empty">Click an arrondissement to add it.</span>`;
      return;
    }
    chipsEl.innerHTML = arr.map(n => `
      <button type="button" class="arr-chip" data-arr="${n}">
        ${ARR_ORDINAL[n]}<span class="x">×</span>
      </button>
    `).join('');
    chipsEl.querySelectorAll('.arr-chip').forEach(btn => {
      btn.addEventListener('click', () => toggleArr(parseInt(btn.dataset.arr, 10)));
    });
  }

  async function toggleArr(n) {
    if (selectedArrs.has(n)) selectedArrs.delete(n);
    else selectedArrs.add(n);
    // Re-style this polygon
    if (arrLayer) {
      arrLayer.eachLayer(l => {
        const an = arrFromFeature(l.feature);
        if (an === n) l.setStyle(styleArr(n, selectedArrs.has(n), false));
      });
    }
    updateChips();
    try {
      await db.member.setPreferences(Array.from(selectedArrs).sort((a, b) => a - b));
    } catch (e) { console.error('setPreferences failed', e); }
  }

  async function initMap() {
    const wrap = document.getElementById('mapWrap');
    if (!wrap || typeof L === 'undefined') return;

    if (map) { map.remove(); map = null; arrLayer = null; arrLabels = []; }

    // Load saved selection
    selectedArrs = new Set();
    try {
      const prefs = await db.member.getPreferences();
      if (prefs.ok && Array.isArray(prefs.prefs.arrondissements)) {
        prefs.prefs.arrondissements.forEach(n => selectedArrs.add(n));
      }
    } catch {}

    map = L.map(wrap, {
      center: [48.8566, 2.3522],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      zoomSnap: 0.25,
      zoomDelta: 0.25
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

    const data = await loadArrGeojson();

    arrLayer = L.geoJSON(data, {
      style: (f) => styleArr(arrFromFeature(f), selectedArrs.has(arrFromFeature(f)), false),
      onEachFeature: (feature, layer) => {
        const n = arrFromFeature(feature);
        layer.on('mouseover', () => {
          if (!selectedArrs.has(n)) layer.setStyle(styleArr(n, false, true));
        });
        layer.on('mouseout', () => {
          if (!selectedArrs.has(n)) layer.setStyle(styleArr(n, false, false));
        });
        layer.on('click', () => toggleArr(n));
      }
    }).addTo(map);

    // Ensure Leaflet knows the container size now that polygons are loaded
    map.invalidateSize();
    map.fitBounds(arrLayer.getBounds(), { padding: [0, 0] });
    // Zoom in ~10% past the natural fit so Paris fills more of the frame
    map.setZoom(map.getZoom() + 0.5);

    // Number labels at centroids
    arrLabels.forEach(m => map.removeLayer(m));
    arrLabels = [];
    data.features.forEach(f => {
      const n = arrFromFeature(f);
      const c = f.properties?.geom_x_y;
      if (n && c && c.lat && c.lon) {
        const lbl = L.marker([c.lat, c.lon], {
          interactive: false,
          icon: L.divIcon({
            className: 'arr-label',
            html: ARR_ORDINAL[n],
            iconSize: [24, 16]
          })
        }).addTo(map);
        arrLabels.push(lbl);
      }
    });

    updateChips();
  }

  /* ============================================================
     ROOM — your people + recently joined
     ============================================================ */
  let _connections = [];

  async function renderRoom() {
    const container = document.getElementById('roomPage');
    container.innerHTML = `
      <div class="slide-up">
        <div class="eyebrow">The Room</div>
        <h1 class="page-title">Your <span class="italic">people</span>.</h1>
        <p class="page-tagline">Everyone you've sat with. Click a name for the small print.</p>
      </div>
      <div id="roomList" class="section slide-up" style="--delay:120ms">
        <div class="loading">Loading…</div>
      </div>
    `;

    try {
      const res = await db.member.connections();
      _connections = (res.ok && res.connections) ? res.connections : [];
      const list = document.getElementById('roomList');

      if (!_connections.length) {
        list.innerHTML = `
          <p class="next-lunch-empty">
            The book is empty for now. After your first lunch, the people you've met will appear here.
          </p>
          ${renderRecentlyJoined()}
        `;
        return;
      }

      list.innerHTML = `
        ${_connections.map((c, i) => connectionCard(c, i)).join('')}
        ${renderRecentlyJoined()}
      `;

      list.querySelectorAll('.connection-card').forEach(card => {
        card.addEventListener('click', () => {
          const idx = parseInt(card.dataset.idx, 10);
          openSpread(_connections[idx]);
        });
      });
    } catch (err) {
      console.error('Room load error:', err);
      document.getElementById('roomList').innerHTML = `
        <p class="next-lunch-empty">Something went wrong. Please try again.</p>
      `;
    }
  }

  function connectionCard(c, idx) {
    const profession = [c.profession, c.employer].filter(Boolean).join(' · ');
    const venue = [c.restaurant, c.neighborhood].filter(Boolean).join(' · ');
    return `
      <div class="connection-card" data-idx="${idx}">
        <div class="avatar ${avatarClass(c.firstName, c.lastName)}">${esc(initials(c.firstName, c.lastName))}</div>
        <div class="info">
          <div class="name">${esc(c.firstName)} ${esc(c.lastName)}</div>
          <div class="meta">${esc(profession || '—')}</div>
          ${venue ? `<div class="from">${esc(venue)}</div>` : ''}
        </div>
        <div class="date">${c.lunchDate ? formatShortDate(c.lunchDate) : ''}</div>
      </div>
    `;
  }

  function renderRecentlyJoined() {
    return `
      <div class="recently-joined">
        <span class="label">Recently joined</span>
        <div class="body">${esc(pickRecentlyJoined(5))}.</div>
      </div>
    `;
  }

  /* ============ Right-rail spread ============ */
  function openSpread(c) {
    const spread = document.getElementById('railSpread');
    const backdrop = document.getElementById('spreadBackdrop');
    const body = document.getElementById('spreadBody');
    const profession = [c.profession, c.employer].filter(Boolean).join(' · ');
    const venue = [c.restaurant, c.neighborhood].filter(Boolean).join(' · ');
    const when = c.lunchDate ? formatDate(c.lunchDate) : '';

    body.innerHTML = `
      <div class="spread-eyebrow">From your book</div>
      <div class="spread-name">${esc(c.firstName)} ${esc(c.lastName)}</div>
      <div class="spread-meta">${esc(profession || '')}</div>

      <div class="spread-block">
        <div class="k">Where you met</div>
        <div class="v">${esc(venue || '—')}</div>
        ${when ? `<div class="v italic" style="margin-top:6px">${esc(when)}</div>` : ''}
      </div>

      <div class="spread-block">
        <div class="k">Common ground</div>
        <div class="v italic">You both said yes to <em>art</em> and <em>quiet rooms</em>.</div>
      </div>

      <div class="spread-note">Send a note (soon)</div>
    `;
    backdrop.classList.add('visible');
    spread.classList.add('open');
    spread.setAttribute('aria-hidden', 'false');
  }
  function closeSpread() {
    const spread = document.getElementById('railSpread');
    const backdrop = document.getElementById('spreadBackdrop');
    backdrop.classList.remove('visible');
    spread.classList.remove('open');
    spread.setAttribute('aria-hidden', 'true');
  }

  /* ============================================================
     CARNET — membership card + details + invitations + fine print
     ============================================================ */
  async function renderCarnet() {
    const container = document.getElementById('carnetPage');
    container.innerHTML = `<div class="loading">Loading…</div>`;

    try {
      const data = dashData || await (async () => {
        const r = await db.member.dashboard();
        if (r.ok) dashData = r;
        return r;
      })();
      if (!data || !data.ok) {
        container.innerHTML = `<p class="next-lunch-empty">Something went wrong.</p>`;
        return;
      }

      const m = data.member;
      const s = data.stats;
      const remaining = Math.max(0, (s.monthLimit || 4) - (s.monthLunches || 0));
      const planChip = m.plan === 'patron' ? 'patron' : 'standard';
      const planLabel = m.plan === 'patron' ? 'Patron' : 'Standard';
      const since = m.joinedAt ? `Member since ${formatMonthYear(m.joinedAt)}` : 'A recent arrival';

      // Invites
      let invitesRes = { ok: false };
      try { invitesRes = await db.memberInvites.getMyInvites(); } catch {}
      const inv = invitesRes.ok ? invitesRes : { quota: 0, remaining: 0, sent: 0, invites: [] };

      const dob = (m.dobDay && m.dobMonth && m.dobYear)
        ? `${m.dobDay}/${m.dobMonth}/${m.dobYear}` : '';
      const phoneLine = (m.countryCode || m.phone) ? `${m.countryCode || ''} ${m.phone || ''}`.trim() : '';
      const workLine = [m.profession, m.employer].filter(Boolean).join(' · ');

      container.innerHTML = `
        <div class="slide-up">
          <div class="eyebrow">Le Carnet</div>
          <h1 class="page-title">Your <span class="italic">record</span>.</h1>
        </div>

        <div class="section slide-up" style="--delay:80ms">
          <div class="member-card">
            <span class="watermark">L</span>
            <span class="card-chip ${planChip}">${esc(planLabel)}</span>
            <div class="card-eyebrow">Lunchers Club</div>
            <div class="card-name">${esc(m.firstName)} ${esc(m.lastName)}</div>
            <div class="card-since">${esc(since)}</div>
            <div class="card-code">${esc(m.refCode || '')}</div>
          </div>
          <p class="credits-line">You have ${remaining} ${remaining === 1 ? 'lunch' : 'lunches'} remaining this month.</p>
        </div>

        <div class="section slide-up" style="--delay:200ms">
          <div class="section-head">
            <div class="section-title">Your details</div>
          </div>
          <div class="detail-block">
            ${detailLine('Your email,',    m.email)}
            ${detailLine('Your phone,',    phoneLine)}
            ${dob ? detailLine('Your birthday,', dob) : ''}
            ${detailLine('You live in',    m.city || 'Paris')}
            ${workLine ? detailLine('You work as', workLine) : ''}
            ${m.linkedin  ? detailLine('On LinkedIn,',  m.linkedin)  : ''}
            ${m.instagram ? detailLine('On Instagram,', m.instagram) : ''}
          </div>
        </div>

        <div class="section slide-up" style="--delay:320ms">
          <div class="section-head">
            <div class="section-title">Your invitations</div>
          </div>
          ${inv.quota === 0 ? `
            <p class="next-lunch-empty">
              No invitations yet. When the club opens an invitation slot for you, it appears here.
            </p>
          ` : `
            <div class="invite-headline">${inv.quota === 1 ? 'One key to the door' : `${inv.quota} keys to the door`}.</div>
            <p class="invite-quota-line">
              You have ${inv.remaining} ${inv.remaining === 1 ? 'invitation' : 'invitations'} to give.
            </p>
            ${inv.remaining > 0 ? `
              <form class="invite-form-compact" id="inviteForm">
                <input type="text"  id="invFirst" placeholder="First name"   required autocomplete="off" />
                <input type="text"  id="invLast"  placeholder="Last name"    required autocomplete="off" />
                <input type="email" id="invEmail" placeholder="Email address" required autocomplete="off" />
                <button type="submit" class="submit-link" id="invSubmit">Generate link →</button>
              </form>
              <div class="invite-error" id="invError"></div>
              <div class="invite-link-box" id="invLinkBox">
                <div class="label">Invite link ready</div>
                <div class="link-row">
                  <div class="link-url" id="invLinkUrl"></div>
                  <button class="btn-copy" id="invCopy">Copy</button>
                </div>
              </div>
            ` : ''}
            ${inv.invites && inv.invites.length ? `
              <div class="invite-list">
                <div class="section-head">
                  <div class="section-title" style="font-size:14px;color:var(--muted-2)">Sent</div>
                </div>
                ${inv.invites.map(i => inviteCard(i)).join('')}
              </div>
            ` : ''}
          `}
        </div>

        <div class="fine-print">
          <span>${esc(planLabel)} membership</span>
          <a href="#billing">Billing</a>
          <a href="#legal">Legal</a>
          <button type="button" id="signoutLink">Sign out</button>
        </div>
      `;

      // Wire invite form (if present)
      if (inv.quota > 0 && inv.remaining > 0) wireInviteForm();
      // Wire sign out
      document.getElementById('signoutLink').addEventListener('click', () => {
        db.memberSession.clear();
        window.location.href = 'Sign In.html';
      });
    } catch (err) {
      console.error('Carnet load error:', err);
      container.innerHTML = `<p class="next-lunch-empty">Something went wrong.</p>`;
    }
  }

  function detailLine(k, v) {
    return `
      <div class="detail-line">
        <span class="k">${esc(k)}</span>
        <span class="v">${esc(v || '—')}</span>
        <span class="pencil" title="Edit (soon)">✎</span>
      </div>
    `;
  }

  function inviteCard(inv) {
    const statusLabels = {
      pending: 'Link sent',
      submitted: 'Applied',
      accepted: 'Accepted',
      onboarded: 'Onboarded',
      expired: 'Expired'
    };
    let expiryNote = '';
    let renderStatus = inv.status;
    if (inv.status === 'pending') {
      const expiry = formatExpiry(inv.createdAt, 7);
      if (expiry === 'Expired') {
        renderStatus = 'expired';
      } else if (expiry) {
        expiryNote = `<div class="invite-expiry">Expires in ${expiry}</div>`;
      }
    }
    return `
      <div class="connection-card" style="cursor:default">
        <div class="avatar ${avatarClass(inv.firstName, inv.lastName)}">${esc(initials(inv.firstName, inv.lastName))}</div>
        <div class="info">
          <div class="name">${esc(inv.firstName)} ${esc(inv.lastName)}</div>
          <div class="meta">${esc(inv.email)}</div>
          ${expiryNote}
        </div>
        <span class="status-pill ${renderStatus}">${statusLabels[renderStatus] || renderStatus}</span>
      </div>
    `;
  }

  function wireInviteForm() {
    const form = document.getElementById('inviteForm');
    if (!form) return;
    const errorEl = document.getElementById('invError');
    const linkBox = document.getElementById('invLinkBox');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      linkBox.classList.remove('visible');

      const first = document.getElementById('invFirst').value.trim();
      const last  = document.getElementById('invLast').value.trim();
      const email = document.getElementById('invEmail').value.trim();
      if (!first || !last || !email) return;

      const btn = document.getElementById('invSubmit');
      btn.disabled = true;
      btn.textContent = 'Generating…';

      try {
        const res = await db.memberInvites.createInvite(first, last, email);
        if (res.ok) {
          const baseUrl = window.location.origin + window.location.pathname.replace('Member.html', 'Apply.html');
          const inviteUrl = `${baseUrl}?mode=invite&token=${res.token}`;
          document.getElementById('invLinkUrl').textContent = inviteUrl;
          linkBox.classList.add('visible');

          document.getElementById('invCopy').addEventListener('click', () => {
            navigator.clipboard.writeText(inviteUrl).then(() => {
              const copyBtn = document.getElementById('invCopy');
              copyBtn.textContent = 'Copied';
              setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1400);
            });
          });

          form.reset();
          setTimeout(() => renderCarnet(), 900);
        } else {
          const msgs = {
            quota_exhausted: 'All your invitations have been used.',
            email_exists:    'This person already has an application.',
            already_invited: 'You have already invited this email.',
            invalid:         'Session expired. Please sign in again.'
          };
          errorEl.textContent = msgs[res.error] || 'Something went wrong.';
        }
      } catch (err) {
        console.error('Invite create error:', err);
        errorEl.textContent = 'Something went wrong. Please try again.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate link →';
      }
    });
  }

  /* ============================================================
     Boot
     ============================================================ */
  (async function boot() {
    const ok = await checkAuth();
    if (!ok) return;

    document.querySelectorAll('.rail-item').forEach(t => {
      t.addEventListener('click', () => setPage(t.dataset.page));
    });

    const sidebarLogout = document.getElementById('sidebarLogout');
    if (sidebarLogout) {
      sidebarLogout.addEventListener('click', () => {
        db.memberSession.clear();
        window.location.href = 'Sign In.html';
      });
    }

    // Spread close handlers
    document.getElementById('spreadClose').addEventListener('click', closeSpread);
    document.getElementById('spreadBackdrop').addEventListener('click', closeSpread);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSpread();
    });

    setPage('today');
  })();
})();
