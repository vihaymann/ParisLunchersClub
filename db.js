/* ============================================================
   The Paris Lunchers Club — Supabase data layer
   ============================================================
   Backed by Supabase (Postgres + Auth + RLS). Every read/write
   goes through this module via the window.TPLC global.
   ============================================================ */

(function () {
  const SUPABASE_URL = 'https://sswjazyebylqsujfrmfp.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzd2phenllYnlscXN1amZybWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODE1NTIsImV4cCI6MjA5MTc1NzU1Mn0.fciyLEccINRyTAysCYOEq_6PeIeRgBH40Xv02pYjMT0';

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* ---------- Pricing ---------- */
  const PLANS = {
    standard: { label: 'Standard', monthly: 80 },
    patron:   { label: 'Patron',   monthly: 180 }
  };

  /* ---------- Record mapping: DB row → front-end shape ---------- */
  function toAppRecord(row) {
    return {
      id: row.id,
      status: row.status,
      appliedAt: row.applied_at,
      decidedAt: row.decided_at,
      refCode: row.ref_code,
      data: {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        countryCode: row.country_code,
        phone: row.phone,
        dobDay: row.dob_day,
        dobMonth: row.dob_month,
        dobYear: row.dob_year,
        city: row.city,
        cityIsOther: row.city_is_other,
        profession: row.profession,
        employer: row.employer,
        linkedin: row.linkedin,
        instagram: row.instagram,
        refName: row.ref_name,
        refRelation: row.ref_relation,
        why: row.why
      }
    };
  }

  function toLunchRecord(row) {
    return {
      id: row.id,
      date: row.date,
      restaurant: row.restaurant,
      neighborhood: row.neighborhood,
      capacity: row.capacity,
      host: row.host_id,
      attendees: (row.lunch_attendees || []).map(a => a.member_id)
    };
  }

  /* ---------- Session (Supabase Auth) ---------- */
  let _session = null;
  const _ready = sb.auth.getSession().then(({ data }) => {
    _session = data.session;
  });
  sb.auth.onAuthStateChange((_event, sess) => {
    _session = sess;
  });

  const session = {
    init: () => _ready,
    get() {
      return _session
        ? { email: _session.user.email, signedInAt: _session.user.last_sign_in_at }
        : null;
    },
    isStaff() { return !!_session; },
    async login(email, pass) {
      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password: pass
      });
      if (error) return false;
      _session = data.session;
      return true;
    },
    async logout() {
      await sb.auth.signOut();
      _session = null;
    }
  };

  /* ---------- Applications ---------- */
  const applications = {
    async all() {
      const { data, error } = await sb.from('applications')
        .select('*')
        .order('applied_at', { ascending: false });
      if (error) { console.error('applications.all:', error); return []; }
      return (data || []).map(toAppRecord);
    },

    async add(record) {
      const cols = {
        first_name: record.data.firstName || '',
        last_name: record.data.lastName || '',
        email: record.data.email || '',
        country_code: record.data.countryCode || '+33',
        phone: record.data.phone || '',
        dob_day: record.data.dobDay || '',
        dob_month: record.data.dobMonth || '',
        dob_year: record.data.dobYear || '',
        city: record.data.city || '',
        city_is_other: !!record.data.cityIsOther,
        profession: record.data.profession || '',
        employer: record.data.employer || '',
        linkedin: record.data.linkedin || '',
        instagram: record.data.instagram || '',
        ref_name: record.data.refName || '',
        ref_relation: record.data.refRelation || '',
        why: record.data.why || '',
        status: 'pending'
      };
      const { data, error } = await sb.from('applications')
        .insert(cols)
        .select()
        .single();
      if (error) throw error;
      return toAppRecord(data);
    },

    async update(id, patch) {
      const updates = {};
      if (patch.status) updates.status = patch.status;
      if (patch.decidedAt) updates.decided_at = patch.decidedAt;
      const { data, error } = await sb.from('applications')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) { console.error('applications.update:', error); return null; }
      return toAppRecord(data);
    },

    async byStatus(status, _all) {
      if (_all) return _all.filter(a => a.status === status);
      const { data, error } = await sb.from('applications')
        .select('*')
        .eq('status', status)
        .order('applied_at', { ascending: false });
      if (error) { console.error('applications.byStatus:', error); return []; }
      return (data || []).map(toAppRecord);
    },

    async counts(_all) {
      const all = _all || await applications.all();
      const out = { pending: 0, accepted: 0, waitlist: 0, declined: 0, total: all.length };
      for (const a of all) if (out[a.status] != null) out[a.status]++;
      return out;
    },

    async recent(days = 7, _all) {
      const all = _all || await applications.all();
      const cutoff = Date.now() - days * 86400000;
      return all.filter(a => new Date(a.appliedAt).getTime() >= cutoff);
    }
  };

  /* ---------- Lunches ---------- */
  const lunches = {
    async all() {
      const { data, error } = await sb.from('lunches')
        .select('*, lunch_attendees(member_id)')
        .order('date', { ascending: false });
      if (error) { console.error('lunches.all:', error); return []; }
      return (data || []).map(toLunchRecord);
    },

    async add(rec) {
      const { data, error } = await sb.from('lunches')
        .insert({
          date: rec.date,
          restaurant: rec.restaurant,
          neighborhood: rec.neighborhood || '',
          capacity: rec.capacity || 8,
          host_id: rec.host || null
        })
        .select()
        .single();
      if (error) throw error;
      if (rec.attendees && rec.attendees.length) {
        await sb.from('lunch_attendees')
          .insert(rec.attendees.map(mid => ({ lunch_id: data.id, member_id: mid })));
      }
      return toLunchRecord({
        ...data,
        lunch_attendees: (rec.attendees || []).map(id => ({ member_id: id }))
      });
    },

    async between(startIso, endIso, _all) {
      if (_all) {
        const s = new Date(startIso).getTime();
        const e = new Date(endIso).getTime();
        return _all.filter(l => {
          const t = new Date(l.date).getTime();
          return t >= s && t <= e;
        });
      }
      const { data, error } = await sb.from('lunches')
        .select('*, lunch_attendees(member_id)')
        .gte('date', startIso)
        .lte('date', endIso)
        .order('date', { ascending: false });
      if (error) { console.error('lunches.between:', error); return []; }
      return (data || []).map(toLunchRecord);
    },

    async inLastDays(days, _all) {
      const all = _all || await lunches.all();
      const cutoff = Date.now() - days * 86400000;
      return all.filter(l => new Date(l.date).getTime() >= cutoff);
    }
  };

  /* ---------- Plans (membership tier per member) ---------- */
  const plans = {
    async all() {
      const { data, error } = await sb.from('member_plans').select('*');
      if (error) { console.error('plans.all:', error); return {}; }
      const map = {};
      (data || []).forEach(r => { map[r.member_id] = r.plan_key; });
      return map;
    },
    async get(memberId) {
      const { data } = await sb.from('member_plans')
        .select('plan_key')
        .eq('member_id', memberId)
        .maybeSingle();
      return data?.plan_key || 'standard';
    },
    async set(memberId, planKey) {
      await sb.from('member_plans')
        .upsert({ member_id: memberId, plan_key: planKey, updated_at: new Date().toISOString() });
    },
    catalog() { return PLANS; }
  };

  /* ---------- Derived metrics ---------- */
  function monthKey(iso) {
    const d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }
  function monthRange(months) {
    const out = [];
    const now = new Date();
    now.setDate(1);
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    return out;
  }

  const metrics = {
    monthRange,
    monthLabel,

    async monthlyApplicationFlow(months = 12, _apps) {
      const allApps = _apps || await applications.all();
      const buckets = {};
      const keys = monthRange(months);
      keys.forEach(k => buckets[k] = { key: k, label: monthLabel(k), applied: 0, accepted: 0, declined: 0, waitlisted: 0 });

      allApps.forEach(a => {
        const k = monthKey(a.appliedAt);
        if (buckets[k]) buckets[k].applied++;
        if (a.decidedAt) {
          const dk = monthKey(a.decidedAt);
          if (buckets[dk]) {
            if (a.status === 'accepted')  buckets[dk].accepted++;
            if (a.status === 'declined')  buckets[dk].declined++;
            if (a.status === 'waitlist')  buckets[dk].waitlisted++;
          }
        }
      });
      return keys.map(k => {
        const b = buckets[k];
        const decided = b.accepted + b.declined + b.waitlisted;
        b.rate = decided ? b.accepted / decided : null;
        return b;
      });
    },

    async monthlyLunches(months = 12, _lunches) {
      const allLunches = _lunches || await lunches.all();
      const buckets = {};
      const keys = monthRange(months);
      keys.forEach(k => buckets[k] = { key: k, label: monthLabel(k), count: 0, attendees: 0 });
      allLunches.forEach(l => {
        const k = monthKey(l.date);
        if (buckets[k]) {
          buckets[k].count++;
          buckets[k].attendees += l.attendees.length;
        }
      });
      return keys.map(k => buckets[k]);
    },

    async monthlyRecurringRevenue(months = 12, _apps, _plans) {
      const keys = monthRange(months);
      const accepted = _apps
        ? _apps.filter(a => a.status === 'accepted')
        : await applications.byStatus('accepted');
      const planMap = _plans || await plans.all();
      return keys.map(k => {
        const [y, mo] = k.split('-').map(Number);
        const cutoff = new Date(y, mo, 0, 23, 59, 59).getTime();
        let mrr = 0;
        accepted.forEach(a => {
          const joined = new Date(a.decidedAt || a.appliedAt).getTime();
          if (joined <= cutoff) {
            const plan = PLANS[planMap[a.id] || 'standard'];
            mrr += plan.monthly;
          }
        });
        return { key: k, label: monthLabel(k), mrr };
      });
    },

    async currentMRR(_apps, _plans) {
      const series = await metrics.monthlyRecurringRevenue(2, _apps, _plans);
      return series[series.length - 1]?.mrr || 0;
    },
    async currentARR(_apps, _plans) {
      return (await metrics.currentMRR(_apps, _plans)) * 12;
    },
    async mrrDelta(_apps, _plans) {
      const s = await metrics.monthlyRecurringRevenue(3, _apps, _plans);
      const cur = s[s.length - 1]?.mrr || 0;
      const prev = s[s.length - 2]?.mrr || 0;
      if (!prev) return { abs: cur, pct: null };
      return { abs: cur - prev, pct: (cur - prev) / prev };
    },

    async overallAcceptanceRate(_apps) {
      const all = _apps || await applications.all();
      const decided = all.filter(a => a.status !== 'pending');
      if (decided.length === 0) return null;
      return decided.filter(a => a.status === 'accepted').length / decided.length;
    },

    async memberActivity(_apps, _lunches, _plans) {
      const allApps = _apps || await applications.all();
      const allLunches = _lunches || await lunches.all();
      const planMap = _plans || await plans.all();
      const members = allApps.filter(a => a.status === 'accepted');
      const counts = {};
      allLunches.forEach(l => {
        l.attendees.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
      });
      const now = Date.now();
      return members.map(m => {
        const attended = counts[m.id] || 0;
        const joined = new Date(m.decidedAt || m.appliedAt).getTime();
        const daysSince = Math.max(30, Math.round((now - joined) / 86400000));
        const planKey = planMap[m.id] || 'standard';
        return {
          id: m.id,
          name: `${m.data.firstName} ${m.data.lastName}`,
          city: m.data.city,
          work: m.data.profession,
          joined,
          attended,
          perMonth: +(attended / (daysSince / 30)).toFixed(2),
          plan: planKey,
          mrr: PLANS[planKey].monthly
        };
      }).sort((a, b) => b.attended - a.attended);
    }
  };

  /* ---------- Submit (called by Apply.html via RPC) ---------- */
  async function submitApplication(formData) {
    const { data, error } = await sb.rpc('submit_application', {
      p_first_name: formData.firstName || '',
      p_last_name: formData.lastName || '',
      p_email: formData.email || '',
      p_country_code: formData.countryCode || '+33',
      p_phone: formData.phone || '',
      p_dob_day: formData.dobDay || '',
      p_dob_month: formData.dobMonth || '',
      p_dob_year: formData.dobYear || '',
      p_city: formData.city || '',
      p_city_is_other: !!formData.cityIsOther,
      p_profession: formData.profession || '',
      p_employer: formData.employer || '',
      p_linkedin: formData.linkedin || '',
      p_instagram: formData.instagram || '',
      p_ref_name: formData.refName || '',
      p_ref_relation: formData.refRelation || '',
      p_why: formData.why || ''
    });
    if (error) throw error;
    return {
      id: data.id,
      status: data.status,
      appliedAt: data.applied_at,
      decidedAt: null,
      refCode: data.ref_code,
      data: { ...formData }
    };
  }

  /* ---------- Public surface ---------- */
  window.TPLC = {
    applications,
    lunches,
    plans,
    metrics,
    PLANS,
    session,
    submitApplication,
    resetAll() {}
  };
})();
