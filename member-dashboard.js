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
    document.querySelectorAll('.rail-item').forEach(t => t.classList.toggle('active', t.dataset.page === name));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
    if (name === 'home') renderHome();
    if (name === 'carnet') renderCarnet();
    if (name === 'recommend') renderRecommend();
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
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function formatShortDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  /* ============================================================
     HOME PAGE (stats + availability + map + connections)
     ============================================================ */
  async function renderHome() {
    const container = document.getElementById('homePage');
    try {
      // Fetch dashboard data and availability in parallel
      const [dashRes, availRes] = await Promise.all([
        db.member.dashboard(),
        db.member.getAvailability().catch(() => ({ ok: false }))
      ]);

      if (!dashRes.ok) { db.memberSession.clear(); window.location.href = 'Sign In.html'; return; }
      dashData = dashRes;

      const m = dashRes.member;
      const s = dashRes.stats;
      const remaining = Math.max(0, s.monthLimit - s.monthLunches);
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

      // Update sidebar name
      const railWho = document.getElementById('railWho');
      if (railWho) railWho.textContent = m.firstName;

      // Build next 7 days
      const days = [];
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        days.push(d);
      }
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      let selectedDates = [];
      let monthCount = 0;
      if (availRes.ok) {
        selectedDates = (availRes.dates || []).map(d => d);
        const thisMonth = today.toISOString().slice(0, 7);
        monthCount = selectedDates.filter(d => d.startsWith(thisMonth)).length;
      }

      container.innerHTML = `
        <div class="greeting fade-in">
          <div class="eyebrow">Member space</div>
          <h1>${greeting}, <span class="italic">${esc(m.firstName)}</span>.</h1>
        </div>

        <div class="stat-cards fade-in" style="animation-delay:80ms">
          <div class="stat-card">
            <div class="number">${s.peopleMet}</div>
            <div class="label">People met</div>
          </div>
          <div class="stat-card">
            <div class="number">${remaining}<span class="small">/${s.monthLimit}</span></div>
            <div class="label">Credits this month</div>
          </div>
        </div>

        <div class="section fade-in" style="animation-delay:160ms">
          <div class="section-head">
            <div class="eyebrow">Your week</div>
          </div>
          <p class="help" style="margin-top:-8px;margin-bottom:8px;">Pick your days. We'll arrange a one-on-one lunch for you.</p>
          <div class="week-grid" id="weekGrid">
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
          <div class="month-counter" id="monthCounter">
            <span id="monthCount">${monthCount}</span> / 4 lunches this month
          </div>
        </div>

        <div class="section fade-in" style="animation-delay:240ms">
          <div class="section-head">
            <div class="eyebrow">Where to lunch?</div>
          </div>
          <div class="map-wrap" id="mapWrap"></div>
          <div class="radius-selector" id="radiusSelector">
            <button class="radius-btn" data-r="1">1 km</button>
            <button class="radius-btn" data-r="3">3 km<span class="rec-label">Recommended</span></button>
            <button class="radius-btn" data-r="5">5 km<span class="rec-label">Recommended</span></button>
          </div>
        </div>

        <div class="section fade-in" style="animation-delay:320ms">
          <div class="section-head">
            <div class="eyebrow">Next lunch</div>
          </div>
          <div class="empty-card">
            <p>No lunch scheduled yet.</p>
            <p class="muted">Set your availability above and we'll take care of the rest.</p>
          </div>
        </div>

        ${s.peopleMet > 0 ? `
        <div class="section fade-in" style="animation-delay:400ms">
          <div class="section-head">
            <div class="eyebrow">Recent connections</div>
          </div>
          <div id="homeConnections"></div>
        </div>` : ''}
      `;

      // Wire availability and map
      wireWeek(selectedDates, monthCount);
      initMap();

      // Load recent connections
      if (s.peopleMet > 0) {
        const conRes = await db.member.connections();
        if (conRes.ok && conRes.connections?.length) {
          const recent = conRes.connections.slice(0, 3);
          document.getElementById('homeConnections').innerHTML = recent.map(c => connectionCard(c)).join('');
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
      container.innerHTML = `<div class="empty-card"><p>Something went wrong. Please try again.</p></div>`;
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
     WEEK AVAILABILITY — wiring
     ============================================================ */
  function wireWeek(selectedDates, monthCount) {
    const grid = document.getElementById('weekGrid');
    if (!grid) return;
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

  /* ============================================================
     MAP — initialization
     ============================================================ */
  async function initMap() {
    const wrap = document.getElementById('mapWrap');
    if (!wrap || typeof L === 'undefined') return;

    // Cleanup previous instance
    if (map) { map.remove(); map = null; radiusCircle = null; }

    let lat = 48.8566, lng = 2.3522, radius = 3;

    try {
      const prefs = await db.member.getPreferences();
      if (prefs.ok) {
        lat = prefs.prefs.lat || lat;
        lng = prefs.prefs.lng || lng;
        radius = prefs.prefs.radius || radius;
      }
    } catch {}

    // Snap old radius=2 to 3 (button no longer exists)
    const validRadii = [1, 3, 5];
    if (!validRadii.includes(radius)) {
      radius = 3;
      try { await db.member.setPreferences(radius, lat, lng); } catch {}
    }

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
     CONTACTS PAGE (People met)
     ============================================================ */
  async function renderCarnet() {
    const container = document.getElementById('carnetPage');
    container.innerHTML = `
      <div class="greeting fade-in">
        <div class="eyebrow">Contacts</div>
        <h1>Your <span class="italic">connections</span>.</h1>
      </div>
      <div id="carnetList" class="fade-in" style="animation-delay:80ms">
        <div class="loading">Loading...</div>
      </div>
    `;

    try {
      const res = await db.member.connections();
      const list = document.getElementById('carnetList');
      if (!res.ok || !res.connections?.length) {
        list.innerHTML = `
          <div class="empty-card">
            <p>Your contact book is empty for now.</p>
            <p class="muted">After your first lunch, the people you've met will appear here.</p>
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
        <div class="empty-card"><p>Something went wrong. Please try again.</p></div>
      `;
    }
  }

  /* ============================================================
     RECOMMEND PAGE (invitations)
     ============================================================ */
  async function renderRecommend() {
    const container = document.getElementById('recommendPage');
    container.innerHTML = `<div class="loading">Loading...</div>`;

    try {
      const res = await db.memberInvites.getMyInvites();
      if (!res.ok) {
        container.innerHTML = `<div class="empty-card"><p>Something went wrong. Please try again.</p></div>`;
        return;
      }

      const { quota, sent, remaining, invites } = res;

      if (quota === 0) {
        container.innerHTML = `
          <div class="greeting fade-in">
            <div class="eyebrow">Recommend</div>
            <h1>Invite someone to the <span class="italic">table</span>.</h1>
          </div>
          <div class="empty-card fade-in" style="animation-delay:80ms; margin-top:24px;">
            <p>You don't have any invitations yet.</p>
            <p class="muted">When we open invite slots for you, they'll appear here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="greeting fade-in">
          <div class="eyebrow">Recommend</div>
          <h1>Invite someone to the <span class="italic">table</span>.</h1>
        </div>

        <div class="stat-cards fade-in" style="animation-delay:80ms">
          <div class="stat-card">
            <div class="number">${remaining}<span class="small">/${quota}</span></div>
            <div class="label">Invitations remaining</div>
          </div>
          <div class="stat-card">
            <div class="number">${sent}</div>
            <div class="label">Sent</div>
          </div>
        </div>

        ${remaining > 0 ? `
        <div class="section fade-in" style="animation-delay:160ms">
          <div class="section-head">
            <div class="eyebrow">New invitation</div>
          </div>
          <p class="help" style="margin-top:-8px;margin-bottom:4px;">Enter your friend's details. We'll generate a personal link you can share.</p>
          <form class="invite-form" id="inviteForm">
            <div class="invite-field">
              <label>First name</label>
              <input type="text" id="invFirst" placeholder="Sophie" required autocomplete="off" />
            </div>
            <div class="invite-field">
              <label>Last name</label>
              <input type="text" id="invLast" placeholder="Dupont" required autocomplete="off" />
            </div>
            <div class="invite-field full">
              <label>Email</label>
              <input type="email" id="invEmail" placeholder="sophie@example.com" required autocomplete="off" />
            </div>
            <button type="submit" class="btn-generate" id="invSubmit">Generate invite link</button>
          </form>
          <div class="invite-error" id="invError"></div>
          <div class="invite-link-box" id="invLinkBox">
            <div class="label">Invite link ready</div>
            <div class="link-row">
              <div class="link-url" id="invLinkUrl"></div>
              <button class="btn-copy" id="invCopy">Copy</button>
            </div>
          </div>
        </div>
        ` : ''}

        ${invites.length > 0 ? `
        <div class="invite-list fade-in" style="animation-delay:${remaining > 0 ? 240 : 160}ms">
          <div class="section-head">
            <div class="eyebrow">Your invitations</div>
          </div>
          ${invites.map(inv => inviteCard(inv)).join('')}
        </div>
        ` : ''}
      `;

      // Wire form
      wireInviteForm();
    } catch (err) {
      console.error('Recommend load error:', err);
      container.innerHTML = `<div class="empty-card"><p>Something went wrong. Please try again.</p></div>`;
    }
  }

  function inviteCard(inv) {
    const statusLabels = {
      pending: 'Link sent',
      submitted: 'Applied',
      accepted: 'Accepted',
      onboarded: 'Onboarded',
      expired: 'Expired'
    };
    return `
      <div class="connection-card">
        <div class="avatar">${esc(initials(inv.firstName, inv.lastName))}</div>
        <div class="info">
          <div class="name">${esc(inv.firstName)} ${esc(inv.lastName)}</div>
          <div class="meta">${esc(inv.email)}</div>
        </div>
        <span class="status-pill ${inv.status}">${statusLabels[inv.status] || inv.status}</span>
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
      const last = document.getElementById('invLast').value.trim();
      const email = document.getElementById('invEmail').value.trim();
      if (!first || !last || !email) return;

      const btn = document.getElementById('invSubmit');
      btn.disabled = true;
      btn.textContent = 'Generating...';

      try {
        const res = await db.memberInvites.createInvite(first, last, email);
        if (res.ok) {
          const baseUrl = window.location.origin + window.location.pathname.replace('Member.html', 'Apply.html');
          const inviteUrl = `${baseUrl}?mode=invite&token=${res.token}`;
          document.getElementById('invLinkUrl').textContent = inviteUrl;
          linkBox.classList.add('visible');

          // Wire copy
          document.getElementById('invCopy').addEventListener('click', () => {
            navigator.clipboard.writeText(inviteUrl).then(() => {
              const copyBtn = document.getElementById('invCopy');
              copyBtn.textContent = 'Copied';
              setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1400);
            });
          });

          // Clear form
          form.reset();
          // Refresh the full page after a brief delay to update counts
          setTimeout(() => renderRecommend(), 800);
        } else {
          const msgs = {
            quota_exhausted: 'All your invitations have been used.',
            email_exists: 'This person already has an application.',
            already_invited: 'You have already invited this email.',
            invalid: 'Session expired. Please sign in again.'
          };
          errorEl.textContent = msgs[res.error] || 'Something went wrong.';
        }
      } catch (err) {
        console.error('Invite create error:', err);
        errorEl.textContent = 'Something went wrong. Please try again.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate invite link';
      }
    });
  }

  /* ============================================================
     PROFILE PAGE
     ============================================================ */
  async function renderProfil() {
    const container = document.getElementById('profilPage');
    const data = dashData || (await (async () => {
      const r = await db.member.dashboard();
      if (r.ok) { dashData = r; return r; }
      return null;
    })());

    if (!data || !data.ok) {
      container.innerHTML = `<div class="empty-card"><p>Something went wrong.</p></div>`;
      return;
    }

    const m = data.member;
    const planLabel = m.plan === 'patron' ? 'Patron' : 'Standard';
    const planPrice = m.plan === 'patron' ? '180' : '80';
    const dob = (m.dobDay && m.dobMonth && m.dobYear) ? `${m.dobDay}/${m.dobMonth}/${m.dobYear}` : '';

    container.innerHTML = `
      <div class="greeting fade-in">
        <div class="eyebrow">Profile</div>
        <h1>${esc(m.firstName)} <span class="italic">${esc(m.lastName)}</span>.</h1>
      </div>

      <div class="profile-section fade-in" style="animation-delay:80ms">
        <div class="section-head"><div class="eyebrow">Membership</div></div>
        ${profilRow('Plan', `${planLabel} · ${planPrice} EUR/month`)}
        ${profilRow('Member since', formatDate(m.joinedAt))}
        ${profilRow('Member code', m.refCode)}
      </div>

      <div class="profile-section fade-in" style="animation-delay:160ms">
        <div class="section-head"><div class="eyebrow">Personal details</div></div>
        ${profilRow('Email', m.email)}
        ${profilRow('Phone', (m.countryCode || '') + ' ' + (m.phone || ''))}
        ${dob ? profilRow('Date of birth', dob) : ''}
        ${profilRow('City', m.city || 'Paris')}
        ${profilRow('Profession', (m.profession || '') + (m.employer ? ' · ' + m.employer : ''))}
        ${m.linkedin ? profilRow('LinkedIn', m.linkedin) : ''}
        ${m.instagram ? profilRow('Instagram', m.instagram) : ''}
      </div>

      <div class="profile-section fade-in" style="animation-delay:240ms">
        <button class="btn-logout" id="logoutBtn">Sign out</button>
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

    // Sidebar navigation
    document.querySelectorAll('.rail-item').forEach(t => {
      t.addEventListener('click', () => setPage(t.dataset.page));
    });

    // Sidebar logout
    const sidebarLogout = document.getElementById('sidebarLogout');
    if (sidebarLogout) {
      sidebarLogout.addEventListener('click', () => {
        db.memberSession.clear();
        window.location.href = 'Sign In.html';
      });
    }

    setPage('home');
  })();
})();
