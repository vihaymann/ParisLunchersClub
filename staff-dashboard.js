/* ============================================================
   Staff Dashboard — controller
   ============================================================ */

(function () {
  const db = window.TPLC;

  /* ---------- Auth view routing ---------- */
  const loginView = document.getElementById('loginView');
  const dashView  = document.getElementById('dashView');

  function showLogin() {
    loginView.classList.add('active');
    dashView.classList.remove('active');
    document.title = 'Staff sign in | Lunchers Club';
    setTimeout(() => document.getElementById('email')?.focus(), 100);
  }
  async function showDash() {
    loginView.classList.remove('active');
    dashView.classList.add('active');
    document.title = 'Staff | Lunchers Club';
    await boot();
  }

  /* ---------- Login form ---------- */
  const loginForm = document.getElementById('loginForm');
  const loginBtn  = document.getElementById('loginBtn');

  ['email','pass'].forEach(id => {
    const inp = document.getElementById(id);
    const f = inp.parentElement;
    inp.addEventListener('focus', () => f.classList.add('focused'));
    inp.addEventListener('blur',  () => f.classList.remove('focused'));
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pass  = document.getElementById('pass').value;
    if (await db.session.login(email, pass)) {
      loginBtn.querySelector('.label').textContent = 'Welcome';
      loginBtn.querySelector('.arrow').textContent = '✓';
      setTimeout(showDash, 380);
    } else {
      loginBtn.dataset.state = 'denied';
      loginBtn.querySelector('.label').textContent = 'Not recognised';
      setTimeout(() => {
        loginBtn.dataset.state = 'idle';
        loginBtn.querySelector('.label').textContent = 'Sign in';
      }, 1600);
    }
  });

  /* ---------- Sign out ---------- */
  document.addEventListener('click', async (e) => {
    if (e.target?.id === 'logoutBtn') {
      await db.session.logout();
      document.getElementById('pass').value = '';
      showLogin();
    }
    if (e.target?.id === 'resetData') {
      e.preventDefault();
      if (confirm('Reset all demo data? This regenerates seed members, applications, lunches.')) {
        await boot();
      }
    }
  });

  /* ============================================================
     App state + routing
     ============================================================ */
  const state = {
    page: 'overview',
    appTab: 'all',
    appQuery: '',
    memQuery: '',
    lunQuery: ''
  };

  async function setPage(name) {
    state.page = name;
    document.querySelectorAll('.rail-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
    const label = {
      overview: 'Overview', applications: 'Applications',
      members: 'Members', lunches: 'Lunches', data: 'Data'
    }[name];
    document.getElementById('crumbNow').textContent = label;
    if (name === 'overview') await renderOverview();
    if (name === 'data') await renderData();
  }

  /* ============================================================
     Boot: render everything once on login
     ============================================================ */
  async function boot() {
    document.getElementById('railWho').textContent = db.session.get()?.email || '';
    await Promise.all([
      renderRailPills(),
      renderOverview(),
      renderApplications(),
      renderMembers(),
      renderLunches()
    ]);
    await setPage(state.page);

    document.querySelectorAll('.rail-item').forEach(b => {
      b.addEventListener('click', () => setPage(b.dataset.page));
    });
    document.querySelectorAll('[data-jump]').forEach(a => {
      a.addEventListener('click', (e) => { e.preventDefault(); setPage(a.dataset.jump); });
    });
  }

  async function renderRailPills() {
    const c = await db.applications.counts();
    document.getElementById('pillApps').textContent = c.pending;
    document.getElementById('pillMems').textContent = c.accepted;
    const recentLun = await db.lunches.inLastDays(30);
    document.getElementById('pillLun').textContent  = recentLun.length;
  }

  /* ============================================================
     OVERVIEW
     ============================================================ */
  function formatToday() {
    return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  async function renderOverview() {
    document.getElementById('todayMeta').textContent = formatToday();
    const allApps = await db.applications.all();
    const counts = await db.applications.counts(allApps);
    const recent7 = await db.applications.recent(7, allApps);
    const recent30 = await db.applications.recent(30, allApps);
    const newApps7 = recent7.filter(a => a.status === 'pending').length;
    const accepted30 = recent30.filter(a => a.status === 'accepted').length;

    document.getElementById('heroes').innerHTML = `
      <div class="hero-card fade-in">
        <div class="label"><span class="pip ok"></span>Members</div>
        <div class="number">${counts.accepted}<span class="small"> / ${counts.total}</span></div>
        <div class="delta">Accepted to date · <strong>${accepted30}</strong> in the last 30 days</div>
      </div>
      <div class="hero-card fade-in" style="animation-delay: 80ms">
        <div class="label"><span class="pip warn"></span>Waiting list</div>
        <div class="number">${counts.waitlist}</div>
        <div class="delta"><strong>${counts.pending}</strong> pending review · <strong>${newApps7}</strong> arrived this week</div>
      </div>
    `;

    const recent = allApps.slice(0, 6);
    const html = recent.length === 0
      ? `<div class="empty">No applications yet.</div>`
      : `
        <table class="tbl">
          <thead><tr>
            <th>Applied</th><th>Name</th><th>City</th><th>Work</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${recent.map(a => `
              <tr data-id="${a.id}">
                <td class="date">${formatDate(a.appliedAt)}</td>
                <td class="name">${escape(a.data.firstName)} ${escape(a.data.lastName)}</td>
                <td class="muted">${escape(a.data.city || '—')}</td>
                <td class="muted">${escape(a.data.profession || '')}${a.data.employer ? ' · ' + escape(a.data.employer) : ''}</td>
                <td>${statusPill(a.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    document.getElementById('overviewRecent').innerHTML = html;
    document.querySelectorAll('#overviewRecent tbody tr').forEach(tr => {
      tr.addEventListener('click', () => openDrawer(tr.dataset.id));
    });
  }

  /* ============================================================
     APPLICATIONS
     ============================================================ */
  document.querySelectorAll('#appTabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#appTabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.appTab = b.dataset.tab;
      renderApplications();
    });
  });
  document.getElementById('appSearch').addEventListener('input', (e) => {
    state.appQuery = e.target.value.trim().toLowerCase();
    renderApplications();
  });

  async function renderApplications() {
    const allApps = await db.applications.all();
    let rows = allApps;
    if (state.appTab !== 'all') rows = rows.filter(a => a.status === state.appTab);
    if (state.appQuery) {
      const q = state.appQuery;
      rows = rows.filter(a => {
        const d = a.data;
        return [d.firstName, d.lastName, d.email, d.city, d.profession, d.employer, d.linkedin,
                d.refName, d.refName2, d.refName3, d.why]
          .join(' ').toLowerCase().includes(q);
      });
    }
    document.getElementById('appsCount').textContent = rows.length;
    document.getElementById('appsMeta').textContent = `${rows.length} of ${allApps.length}`;

    const tbl = document.getElementById('appsTable');
    if (rows.length === 0) {
      tbl.innerHTML = `<div class="empty">No applications match.</div>`;
      return;
    }

    // Build inviter name lookup for referred applications
    const inviterNames = {};
    rows.forEach(a => {
      if (a.invitedBy) {
        const inviter = allApps.find(x => x.id === a.invitedBy);
        inviterNames[a.id] = inviter ? `${inviter.data.firstName} ${inviter.data.lastName}` : 'a member';
      }
    });

    const now = Date.now();
    tbl.innerHTML = `
      <table class="tbl">
        <thead><tr>
          <th>Applied</th><th>Name</th><th>City</th><th>Work</th><th>Referral</th><th>Why</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${rows.map(a => {
            const isNew = (now - new Date(a.appliedAt).getTime()) < 7 * 86400000;
            const d = a.data;
            const refCount = [d.refName, d.refName2, d.refName3].filter(n => (n || '').trim()).length;
            const refCell = inviterNames[a.id]
              ? `<span style="color:var(--ok)">Referred by ${escape(inviterNames[a.id])}</span>`
              : (refCount > 0
                  ? `${escape(d.refName)}${refCount > 1 ? ` <span style="opacity:0.55">+${refCount - 1}</span>` : ''}`
                  : '<span style="opacity:0.45">none</span>');
            return `
              <tr data-id="${a.id}" class="${isNew ? 'is-new' : ''}">
                <td class="date">${formatDate(a.appliedAt)}</td>
                <td class="name">${escape(d.firstName)} ${escape(d.lastName)}</td>
                <td class="muted">${escape(d.city || '—')}</td>
                <td class="muted">${escape(d.profession || '')}${d.employer ? ' · ' + escape(d.employer) : ''}</td>
                <td class="muted">${refCell}</td>
                <td class="why-cell">${d.why ? '"' + escape(d.why) + '"' : ''}</td>
                <td>${statusPill(a.status)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>`;
    tbl.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => openDrawer(tr.dataset.id)));
  }

  /* ============================================================
     MEMBERS
     ============================================================ */
  document.getElementById('memSearch').addEventListener('input', (e) => {
    state.memQuery = e.target.value.trim().toLowerCase();
    renderMembers();
  });

  async function renderMembers() {
    let rows = await db.applications.byStatus('accepted');
    const planMap = await db.plans.all();
    if (state.memQuery) {
      const q = state.memQuery;
      rows = rows.filter(a => {
        const d = a.data;
        return [d.firstName, d.lastName, d.city, d.profession, d.employer].join(' ').toLowerCase().includes(q);
      });
    }
    rows.sort((a, b) => new Date(b.decidedAt || b.appliedAt) - new Date(a.decidedAt || a.appliedAt));
    document.getElementById('memsCount').textContent = rows.length;
    document.getElementById('memsMeta').textContent = `${rows.length} active`;

    const tbl = document.getElementById('memsTable');
    if (rows.length === 0) {
      tbl.innerHTML = `<div class="empty">No members yet.</div>`;
      return;
    }
    tbl.innerHTML = `
      <table class="tbl">
        <thead><tr>
          <th>Joined</th><th>Name</th><th>City</th><th>Work</th><th>Plan</th><th>Email</th>
        </tr></thead>
        <tbody>
          ${rows.map(a => {
            const d = a.data;
            const plan = planMap[a.id] || 'standard';
            const planLabel = db.PLANS[plan].label;
            return `
              <tr data-id="${a.id}">
                <td class="date">${formatDate(a.decidedAt || a.appliedAt)}</td>
                <td class="name">${escape(d.firstName)} ${escape(d.lastName)}</td>
                <td class="muted">${escape(d.city || '—')}</td>
                <td class="muted">${escape(d.profession || '')}${d.employer ? ' · ' + escape(d.employer) : ''}</td>
                <td class="muted">${planLabel} · €${db.PLANS[plan].monthly}/mo</td>
                <td class="muted">${escape(d.email || '')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>`;
    tbl.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => openDrawer(tr.dataset.id)));
  }

  /* ============================================================
     LUNCHES
     ============================================================ */
  document.getElementById('lunSearch').addEventListener('input', (e) => {
    state.lunQuery = e.target.value.trim().toLowerCase();
    renderLunches();
  });

  async function renderLunches() {
    let rows = await db.lunches.all();
    if (state.lunQuery) {
      const q = state.lunQuery;
      rows = rows.filter(l => (l.restaurant + ' ' + l.neighborhood).toLowerCase().includes(q));
    }
    document.getElementById('lunCount').textContent = rows.length;
    document.getElementById('lunMeta').textContent = `${rows.length} lunches`;
    const tbl = document.getElementById('lunTable');
    if (rows.length === 0) {
      tbl.innerHTML = `<div class="empty">No lunches.</div>`;
      return;
    }
    const memById = await mapMembers();
    tbl.innerHTML = `
      <table class="tbl">
        <thead><tr>
          <th>Date</th><th>Restaurant</th><th>Quartier</th><th>Host</th><th>Attendees</th><th class="r">Fill</th>
        </tr></thead>
        <tbody>
          ${rows.map(l => {
            const host = memById[l.host];
            const fill = Math.round((l.attendees.length / l.capacity) * 100);
            return `
              <tr>
                <td class="date">${formatLunchDate(l.date)}</td>
                <td class="name">${escape(l.restaurant)}</td>
                <td class="muted">${escape(l.neighborhood)}</td>
                <td class="muted">${host ? escape(host.data.firstName + ' ' + host.data.lastName) : '—'}</td>
                <td class="num">${l.attendees.length} / ${l.capacity}</td>
                <td class="num r">${fill}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>`;
  }

  async function mapMembers() {
    const out = {};
    (await db.applications.all()).forEach(a => out[a.id] = a);
    return out;
  }

  /* ============================================================
     DATA PAGE
     ============================================================ */
  async function renderData() {
    document.getElementById('dataMeta').textContent = `Last 12 months · ${formatToday()}`;

    const [allApps, allLunches, allPlans] = await Promise.all([
      db.applications.all(),
      db.lunches.all(),
      db.plans.all()
    ]);
    const counts   = await db.applications.counts(allApps);
    const flow     = await db.metrics.monthlyApplicationFlow(12, allApps);
    const mrrSer   = await db.metrics.monthlyRecurringRevenue(12, allApps, allPlans);
    const lunSer   = await db.metrics.monthlyLunches(12, allLunches);
    const activity = await db.metrics.memberActivity(allApps, allLunches, allPlans);
    const mrrNow   = await db.metrics.currentMRR(allApps, allPlans);
    const arrNow   = await db.metrics.currentARR(allApps, allPlans);
    const mrrD     = await db.metrics.mrrDelta(allApps, allPlans);
    const rate     = await db.metrics.overallAcceptanceRate(allApps);
    const lunches30 = (await db.lunches.inLastDays(30, allLunches)).length;
    const lunchesPrev = allLunches.filter(l => {
      const t = new Date(l.date).getTime();
      return t < Date.now() - 30*86400000 && t >= Date.now() - 60*86400000;
    }).length;

    // KPI grid
    document.getElementById('kpiGrid').innerHTML = `
      ${kpi('Current MRR', `<span class="currency">€</span>${formatNum(mrrNow)}`,
            mrrD.pct == null
              ? `${counts.accepted} paying members`
              : `<span class="${mrrD.abs >= 0 ? 'up' : 'down'}">${mrrD.abs >= 0 ? '↑' : '↓'} ${formatPct(Math.abs(mrrD.pct))}</span> · €${formatNum(Math.abs(mrrD.abs))} MoM`)}
      ${kpi('ARR run-rate', `<span class="currency">€</span>${formatNum(arrNow)}`,
            `Based on current MRR × 12`)}
      ${kpi('Acceptance rate', rate == null ? '—' : formatPct(rate),
            `${counts.accepted} accepted · ${counts.declined + counts.waitlist} declined or waitlisted`)}
      ${kpi('Lunches (30d)', `${lunches30}`,
            (() => {
              if (!lunchesPrev) return `seating ${db.lunches.inLastDays(30).reduce((s,l)=>s+l.attendees.length,0)} members`;
              const d = lunches30 - lunchesPrev;
              const pct = d / lunchesPrev;
              return `<span class="${d>=0?'up':'down'}">${d>=0?'↑':'↓'} ${formatPct(Math.abs(pct))}</span> vs prior 30d`;
            })())}
    `;

    // Charts
    drawAppFlowChart('chartApps', flow);
    drawRateChart('chartRate', flow);
    drawMrrChart('chartMrr', mrrSer);
    drawLunchesChart('chartLunches', lunSer);

    // Member activity rankings
    const totalLun = lunSer.reduce((s,m) => s+m.count, 0) || 1;
    const max = activity[0]?.attended || 1;
    document.getElementById('mostActive').innerHTML = activity.slice(0, 6).map((m, i) =>
      activityRow(i + 1, m, max)
    ).join('') || `<div class="empty">No activity yet.</div>`;
    const least = activity.slice().reverse().slice(0, 6);
    document.getElementById('leastActive').innerHTML = least.map((m, i) =>
      activityRow(i + 1, m, max)
    ).join('') || `<div class="empty">No activity yet.</div>`;
  }

  function kpi(k, v, d) {
    return `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  }
  function activityRow(rank, m, max) {
    return `
      <div class="activity-row">
        <div class="rank">${String(rank).padStart(2, '0')}</div>
        <div class="who">
          <div class="nm">${escape(m.name)}</div>
          <div class="meta">${escape(m.work || '')} · ${db.PLANS[m.plan].label}</div>
        </div>
        <div class="count">${m.attended}<span class="unit">lunches</span></div>
        <div class="bar"><i style="width: ${Math.round((m.attended / max) * 100)}%"></i></div>
      </div>
    `;
  }

  /* ============================================================
     CHARTS — hand-drawn SVG, no external lib
     ============================================================ */
  const C = {
    ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#F4F1EA',
    muted: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6E6B64',
    ok: getComputedStyle(document.documentElement).getPropertyValue('--ok').trim() || '#4F9B65',
    warn: getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() || '#B58A3C',
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C9A37A'
  };

  // Common: paired bars (applied vs accepted) over months
  function drawAppFlowChart(id, data) {
    const svg = document.getElementById(id);
    const W = 720, H = 260;
    const pad = { l: 36, r: 12, t: 14, b: 28 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const max = Math.max(1, ...data.map(d => Math.max(d.applied, d.accepted)));

    const slot = cw / data.length;
    const barW = Math.min(18, slot * 0.34);

    // Y ticks
    const ticks = niceTicks(max, 4);
    let g = '';
    ticks.forEach(t => {
      const y = pad.t + ch - (t / ticks[ticks.length-1]) * ch;
      g += `<g class="axis"><line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${C.muted}" stroke-opacity="0.18"/>
              <text x="${pad.l - 8}" y="${y + 3}" text-anchor="end">${t}</text></g>`;
    });

    let bars = '';
    let labels = '';
    data.forEach((d, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const x1 = cx - barW - 2;
      const x2 = cx + 2;
      const h1 = (d.applied / max) * ch;
      const h2 = (d.accepted / max) * ch;
      bars += `<rect class="bar" x="${x1}" y="${pad.t + ch - h1}" width="${barW}" height="${h1}" fill="${C.ink}" fill-opacity="0.72" rx="1"/>`;
      bars += `<rect class="bar" x="${x2}" y="${pad.t + ch - h2}" width="${barW}" height="${h2}" fill="${C.ok}" rx="1"/>`;
      labels += `<text class="axis" x="${cx}" y="${H - 10}" text-anchor="middle">${d.label}</text>`;
    });

    svg.innerHTML = g + bars + labels;
  }

  function drawRateChart(id, data) {
    const svg = document.getElementById(id);
    const W = 480, H = 260;
    const pad = { l: 36, r: 12, t: 14, b: 28 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const series = data.map(d => d.rate);

    // Y axis 0-100%
    let g = '';
    [0, 25, 50, 75, 100].forEach(p => {
      const y = pad.t + ch - (p / 100) * ch;
      g += `<g class="axis"><line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${C.muted}" stroke-opacity="0.18"/>
              <text x="${pad.l - 8}" y="${y + 3}" text-anchor="end">${p}%</text></g>`;
    });

    // Build path skipping null months
    const stepX = cw / Math.max(1, data.length - 1);
    let pathD = '';
    let dots = '';
    let started = false;
    series.forEach((r, i) => {
      if (r == null) return;
      const x = pad.l + i * stepX;
      const y = pad.t + ch - r * ch;
      pathD += (started ? ' L' : 'M') + x + ' ' + y;
      started = true;
      dots += `<circle class="dot" cx="${x}" cy="${y}" r="3" fill="${C.accent}" stroke="${C.bg || '#0A0A09'}"/>`;
    });

    // X axis labels (every 2nd to avoid crowding)
    let labels = '';
    data.forEach((d, i) => {
      if (i % 2 === 0) {
        const x = pad.l + i * stepX;
        labels += `<text class="axis" x="${x}" y="${H - 10}" text-anchor="middle">${d.label}</text>`;
      }
    });

    svg.innerHTML = `${g}<path class="line-path" d="${pathD}" stroke="${C.accent}"/>${dots}${labels}`;
  }

  function drawMrrChart(id, data) {
    const svg = document.getElementById(id);
    const W = 720, H = 220;
    const pad = { l: 50, r: 12, t: 14, b: 28 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const vals = data.map(d => d.mrr);
    const max = Math.max(1, ...vals);
    const ticks = niceTicks(max, 4);
    const tmax = ticks[ticks.length - 1];

    let g = '';
    ticks.forEach(t => {
      const y = pad.t + ch - (t / tmax) * ch;
      g += `<g class="axis"><line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${C.muted}" stroke-opacity="0.18"/>
              <text x="${pad.l - 8}" y="${y + 3}" text-anchor="end">€${formatNum(t)}</text></g>`;
    });

    const stepX = cw / Math.max(1, data.length - 1);
    let pathD = '';
    let areaD = '';
    let dots = '';
    data.forEach((d, i) => {
      const x = pad.l + i * stepX;
      const y = pad.t + ch - (d.mrr / tmax) * ch;
      pathD += (i === 0 ? 'M' : ' L') + x + ' ' + y;
      areaD += (i === 0 ? `M${x} ${pad.t + ch} L${x} ${y}` : ` L${x} ${y}`);
      dots += `<circle class="dot" cx="${x}" cy="${y}" r="3" fill="${C.ok}" stroke="#0A0A09"/>`;
    });
    areaD += ` L${pad.l + (data.length - 1) * stepX} ${pad.t + ch} Z`;

    let labels = '';
    data.forEach((d, i) => {
      if (i % 2 === 0) {
        const x = pad.l + i * stepX;
        labels += `<text class="axis" x="${x}" y="${H - 10}" text-anchor="middle">${d.label}</text>`;
      }
    });

    svg.innerHTML = `${g}<path class="area" d="${areaD}" fill="${C.ok}"/>
                     <path class="line-path" d="${pathD}" stroke="${C.ok}"/>${dots}${labels}`;
  }

  function drawLunchesChart(id, data) {
    const svg = document.getElementById(id);
    const W = 480, H = 220;
    const pad = { l: 36, r: 12, t: 14, b: 28 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const max = Math.max(1, ...data.map(d => Math.max(d.count, d.attendees / 6)));
    const ticks = niceTicks(max, 4);
    const tmax = ticks[ticks.length - 1];

    let g = '';
    ticks.forEach(t => {
      const y = pad.t + ch - (t / tmax) * ch;
      g += `<g class="axis"><line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${C.muted}" stroke-opacity="0.18"/>
              <text x="${pad.l - 8}" y="${y + 3}" text-anchor="end">${t}</text></g>`;
    });

    const slot = cw / data.length;
    const barW = Math.min(14, slot * 0.42);
    let bars = '';
    let line = '';
    let labels = '';
    data.forEach((d, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const h = (d.count / tmax) * ch;
      bars += `<rect class="bar" x="${cx - barW/2}" y="${pad.t + ch - h}" width="${barW}" height="${h}" fill="${C.ink}" fill-opacity="0.6" rx="1"/>`;
      labels += `<text class="axis" x="${cx}" y="${H - 10}" text-anchor="middle">${d.label}</text>`;
      // attendees as small line above
      const y = pad.t + ch - ((d.attendees / 6) / tmax) * ch;
      line += (i === 0 ? 'M' : ' L') + cx + ' ' + y;
    });

    svg.innerHTML = `${g}${bars}<path class="line-path" d="${line}" stroke="${C.muted}" stroke-opacity="0.85"/>${labels}`;
  }

  /* ---------- Number / scale helpers ---------- */
  function niceTicks(max, count) {
    const step = niceStep(max / count);
    const top = Math.ceil(max / step) * step;
    const out = [];
    for (let v = 0; v <= top + 0.0001; v += step) out.push(round(v));
    return out;
  }
  function niceStep(rough) {
    const exp = Math.floor(Math.log10(rough));
    const base = Math.pow(10, exp);
    const m = rough / base;
    let nice;
    if (m < 1.5) nice = 1;
    else if (m < 3) nice = 2;
    else if (m < 7) nice = 5;
    else nice = 10;
    return nice * base;
  }
  function round(n) {
    if (n >= 1000) return Math.round(n);
    if (n >= 10)   return Math.round(n);
    return Math.round(n * 100) / 100;
  }
  function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }
  function formatPct(n) {
    return Math.round(n * 100) + '%';
  }

  /* ============================================================
     DRAWER
     ============================================================ */
  const drawer = document.getElementById('drawer');
  const scrim  = document.getElementById('drawerScrim');
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  async function openDrawer(id) {
    const allApps = await db.applications.all();
    const app = allApps.find(a => a.id === id);
    if (!app) return;
    const d = app.data;
    const dob = (d.dobDay && d.dobMonth && d.dobYear) ? `${d.dobDay}/${d.dobMonth}/${d.dobYear}` : '—';
    const planKey = await db.plans.get(app.id);

    // Resolve inviter name if this is a referred application
    let referralHtml;
    if (app.invitedBy) {
      const inviter = allApps.find(a => a.id === app.invitedBy);
      const inviterName = inviter ? `${inviter.data.firstName} ${inviter.data.lastName}` : 'a member';
      referralHtml = `<span style="color:var(--ok)">Referred by ${escape(inviterName)}</span>`;
    } else {
      const fmtRef = (n, r) => n
        ? `${escape(n)}${r ? ' · ' + escape(r) : ''}`
        : null;
      const refs = [
        fmtRef(d.refName,  d.refRelation),
        fmtRef(d.refName2, d.refRelation2),
        fmtRef(d.refName3, d.refRelation3)
      ].filter(Boolean);
      referralHtml = refs.length
        ? refs.map(r => `<div>${r}</div>`).join('')
        : '<span style="opacity:0.45">none</span>';
    }

    // Fetch invite quota for accepted members
    let quotaHtml = '';
    if (app.status === 'accepted') {
      const currentQuota = await db.invites.getQuota(app.id);
      quotaHtml = `
        <div class="drawer-row">
          <div class="k">Invites</div>
          <div class="v" style="display:flex; align-items:center; gap:8px;">
            <input type="number" id="quotaInput" min="0" max="99" value="${currentQuota}"
              style="width:52px; background:var(--field); border:1px solid var(--field-line);
                     color:var(--ink); padding:4px 8px; border-radius:4px; font-size:13px; font-family:var(--sans);">
            <button id="quotaSave" style="background:none; border:1px solid var(--field-line);
                    color:var(--muted-2); padding:4px 10px; border-radius:4px; font-size:12px;
                    letter-spacing:0.06em; cursor:pointer; font-family:var(--sans);">Save</button>
            <span id="quotaFeedback" style="font-size:12px; color:var(--muted);"></span>
          </div>
        </div>`;
    }

    drawer.innerHTML = `
      <div class="drawer-head">
        <div>
          <div class="title">${escape(d.firstName)} ${escape(d.lastName)}</div>
          <div class="ref"><span>${app.refCode}</span> · ${statusPill(app.status)}</div>
        </div>
        <button class="drawer-close" id="drawerClose" aria-label="Close">×</button>
      </div>
      <div class="drawer-body">
        ${row('Applied', formatFull(app.appliedAt))}
        ${app.decidedAt ? row('Decided', formatFull(app.decidedAt)) : ''}
        ${row('Email',   `<a href="mailto:${escape(d.email)}">${escape(d.email)}</a>`)}
        ${row('Phone',   `${escape(d.countryCode || '')} ${escape(d.phone || '')}`)}
        ${row('Birth',   dob)}
        ${row('City',    escape(d.city || '—'))}
        ${row('Work',    `${escape(d.profession || '')}${d.employer ? ' · ' + escape(d.employer) : ''}` || '—')}
        ${row('LinkedIn', d.linkedin ? `<a href="https://${cleanUrl(d.linkedin)}" target="_blank" rel="noopener">${escape(d.linkedin)}</a>` : '—')}
        ${row('Instagram', d.instagram ? escape(d.instagram) : '—')}
        ${row('Referral', referralHtml)}
        ${row('Why', d.why ? `<span style="font-family:var(--serif); font-style:italic; color: var(--muted-2);">"${escape(d.why)}"</span>` : '—')}
        ${app.status === 'accepted' ? row('Plan', `${db.PLANS[planKey].label} · €${db.PLANS[planKey].monthly}/mo`) : ''}
        ${quotaHtml}
      </div>
      <div class="drawer-actions">
        <button class="btn accept"  data-action="accepted">Accept</button>
        <button class="btn wait"    data-action="waitlist">Waitlist</button>
        <button class="btn decline" data-action="declined">Decline</button>
      </div>
    `;
    drawer.querySelector('#drawerClose').addEventListener('click', closeDrawer);

    // Wire invite quota save
    const quotaSaveBtn = drawer.querySelector('#quotaSave');
    if (quotaSaveBtn) {
      quotaSaveBtn.addEventListener('click', async () => {
        const input = drawer.querySelector('#quotaInput');
        const feedback = drawer.querySelector('#quotaFeedback');
        const val = parseInt(input.value, 10);
        if (isNaN(val) || val < 0) {
          feedback.textContent = 'Invalid number';
          feedback.style.color = 'var(--danger)';
          return;
        }
        try {
          const res = await db.invites.setQuota(app.id, val);
          if (res.ok) {
            feedback.textContent = `Saved (${res.used} used)`;
            feedback.style.color = 'var(--ok)';
          } else if (res.error === 'quota_below_used') {
            feedback.textContent = `Can't go below ${res.used} (already used)`;
            feedback.style.color = 'var(--danger)';
          } else {
            feedback.textContent = res.error;
            feedback.style.color = 'var(--danger)';
          }
        } catch (err) {
          feedback.textContent = 'Error saving';
          feedback.style.color = 'var(--danger)';
        }
        setTimeout(() => { if (feedback) feedback.textContent = ''; }, 3000);
      });
    }

    drawer.querySelectorAll('.drawer-actions .btn').forEach(b => {
      b.addEventListener('click', async () => {
        const newStatus = b.dataset.action;
        await db.applications.update(id, { status: newStatus, decidedAt: new Date().toISOString() });
        if (newStatus === 'accepted') {
          const currentPlan = await db.plans.get(id);
          await db.plans.set(id, currentPlan || 'standard');
          // Fetch the auto-generated temp password for the acceptance email
          const tempPwd = await db.onboarding.getTempPassword(id);
          if (tempPwd) {
            showCredentialsModal(d.firstName, app.refCode, tempPwd);
          }
        }
        closeDrawer();
        await boot();
      });
    });
    drawer.classList.add('open');
    scrim.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function row(k, v) {
    return `<div class="drawer-row"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    scrim.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  /* ============================================================
     Helpers
     ============================================================ */
  function escape(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function cleanUrl(s) { return String(s).replace(/^https?:\/\//, ''); }
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  function formatLunchDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' · ' +
           d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function formatFull(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
         + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function statusPill(s) {
    return `<span class="status ${s}"><span class="dot"></span>${s}</span>`;
  }

  /* ============================================================
     Credentials modal (shown after accepting a member)
     ============================================================ */
  function showCredentialsModal(firstName, refCode, tempPassword) {
    const overlay = document.createElement('div');
    overlay.className = 'cred-overlay';
    overlay.innerHTML = `
      <div class="cred-modal">
        <div class="cred-title">Member accepted</div>
        <p class="cred-sub">Include these credentials in ${escape(firstName)}'s acceptance email so they can complete onboarding.</p>
        <div class="cred-fields">
          <div class="cred-field">
            <label>Reference code</label>
            <div class="cred-value" id="credRef">${escape(refCode)}</div>
            <button class="cred-copy" data-copy="${escape(refCode)}">Copy</button>
          </div>
          <div class="cred-field">
            <label>Temporary password</label>
            <div class="cred-value" id="credPwd">${escape(tempPassword)}</div>
            <button class="cred-copy" data-copy="${escape(tempPassword)}">Copy</button>
          </div>
        </div>
        <div class="cred-link">
          <label>Onboarding link</label>
          <div class="cred-value cred-url" id="credUrl">${window.location.origin + window.location.pathname.replace('Staff.html', 'Apply.html')}?mode=onboard</div>
          <button class="cred-copy" data-copy-url>Copy</button>
        </div>
        <button class="cred-done" id="credDone">Done</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.querySelectorAll('.cred-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy || document.getElementById('credUrl').textContent;
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied';
          setTimeout(() => btn.textContent = 'Copy', 1400);
        });
      });
    });
    overlay.querySelector('#credDone').addEventListener('click', () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 260);
    });
  }

  /* ============================================================
     Boot
     ============================================================ */
  db.session.init().then(() => {
    if (db.session.isStaff()) showDash();
    else showLogin();
  });
})();
