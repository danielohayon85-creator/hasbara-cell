/* מערכת ניהול תא הסברה נפתית — SPA */
'use strict';

const $ = (sel) => document.querySelector(sel);
let ME = null;      // המשתמש המחובר
let META = null;    // רשימות: נושאים, רשויות, משתמשים, סטטוסים...
let currentTab = 'dashboard';

/* ---------------- עזרים ---------------- */
async function api(path, opts = {}) {
  const o = { headers: {}, ...opts };
  if (o.body && !(o.body instanceof FormData)) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(o.body);
  }
  const res = await fetch(path, o);
  let data = null;
  try { data = await res.json(); } catch (e) { /* לא JSON */ }
  if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error('לא מחובר'); }
  if (!res.ok) {
    const msg = (data && data.error) || 'שגיאה בשרת';
    throw new Error(msg);
  }
  return data;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function fmtDT(s) { return s ? s.replace('T', ' ').slice(0, 16) : ''; }
function fmtD(s) { return s ? s.slice(0, 10) : ''; }
function stClass(s) { return 'st-' + String(s || '').replace(/ /g, '-'); }
function chip(v, cls) { return v ? `<span class="chip ${cls}">${esc(v)}</span>` : ''; }
function urgChip(u) { return chip(u, 'urg-' + u); }
function statusChip(s) { return chip(s, stClass(s)); }

function options(list, selected, withEmpty = true) {
  let h = withEmpty ? '<option value="">— בחר —</option>' : '';
  for (const item of list) {
    const v = typeof item === 'object' ? item.id : item;
    const label = typeof item === 'object' ? item.name : item;
    h += `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }
  return h;
}

function modal(html, wide = false) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
  root.querySelector('.modal-back').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-back')) closeModal();
  });
  return root.querySelector('.modal');
}
function closeModal() { $('#modalRoot').innerHTML = ''; }

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = filename;
  a.click();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('הועתק ללוח'); }
  catch (e) { toast('העתקה נכשלה', true); }
}

const canWrite = () => ME && ME.role !== 'viewer';
const isLead = () => ME && (ME.role === 'admin' || ME.role === 'lead');
const isAdmin = () => ME && ME.role === 'admin';

/* ---------------- התחברות ---------------- */
function showLogin() {
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
}

async function boot() {
  try {
    ME = await api('/api/me');
    await enterApp();
  } catch (e) { showLogin(); }
}

async function enterApp() {
  META = await api('/api/meta');
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#userName').textContent = `${ME.name}`;
  renderTabs();
  switchTab('dashboard');
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    ME = await api('/api/login', { method: 'POST', body: { username: $('#username').value, password: $('#password').value } });
    $('#password').value = '';
    await enterApp();
  } catch (err) { $('#loginError').textContent = err.message; }
});

$('#logoutBtn').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.reload(); });

$('#pwBtn').addEventListener('click', () => {
  const m = modal(`
    <h2>שינוי סיסמה</h2>
    <div class="field"><label>סיסמה נוכחית</label><input type="password" id="pwCur"></div>
    <div class="field"><label>סיסמה חדשה (לפחות 8 תווים)</label><input type="password" id="pwNew"></div>
    <div class="btn-row"><button class="btn" id="pwSave">שמור</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  m.querySelector('#pwSave').addEventListener('click', async () => {
    try {
      await api('/api/change-password', { method: 'POST', body: { current: m.querySelector('#pwCur').value, new: m.querySelector('#pwNew').value } });
      closeModal(); toast('הסיסמה עודכנה');
    } catch (e) { toast(e.message, true); }
  });
});

/* ---------------- טאבים ---------------- */
const TABS = [
  { id: 'dashboard', label: '📊 דשבורד' },
  { id: 'questions', label: '❓ מרכז שאלות' },
  { id: 'documents', label: '📄 מסמכים' },
  { id: 'messages', label: '📢 מסרים' },
  { id: 'canned', label: '🗂 בנק הודעות' },
  { id: 'gallery', label: '🖼 גלריה' },
  { id: 'activities', label: '📝 פעילות' },
  { id: 'outgoing', label: '📤 הפצה' },
  { id: 'summary', label: '🕐 סיכום משמרת' },
  { id: 'search', label: '🔍 חיפוש' },
  { id: 'settings', label: '⚙️ הגדרות' },
];

function renderTabs() {
  const nav = $('#tabs');
  nav.innerHTML = TABS.map(t => `<button data-tab="${t.id}">${t.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));
}

function switchTab(id) {
  currentTab = id;
  $('#tabs').querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id));
  const renderers = {
    dashboard: renderDashboard, questions: renderQuestions, documents: renderDocuments,
    messages: renderMessages, canned: renderCanned, gallery: renderGallery,
    activities: renderActivities, outgoing: renderOutgoing,
    summary: renderSummary, search: renderSearch, settings: renderSettings,
  };
  renderers[id]();
}

/* ---------------- דשבורד ---------------- */
async function renderDashboard() {
  const c = $('#content');
  c.innerHTML = '<div class="empty">טוען...</div>';
  const d = await api('/api/dashboard');
  c.innerHTML = `
    <div class="stats-row">
      <div class="stat-card red" data-go="questions"><div class="num">${d.open}</div><div class="lbl">שאלות פתוחות</div></div>
      <div class="stat-card amber" data-go="questions"><div class="num">${d.in_progress}</div><div class="lbl">בטיפול</div></div>
      <div class="stat-card amber" data-go="questions"><div class="num">${d.awaiting_approval}</div><div class="lbl">ממתינות לאישור</div></div>
      <div class="stat-card green" data-go="questions"><div class="num">${d.closed_today}</div><div class="lbl">נסגרו היום</div></div>
      <div class="stat-card" data-go="activities"><div class="num">${d.activities_today}</div><div class="lbl">פעולות היום</div></div>
      <div class="stat-card" data-go="activities"><div class="num">${d.distributed_today}</div><div class="lbl">הודעות הופצו היום</div></div>
    </div>
    <div class="card">
      <h2>הפקת תוצרים בלחיצה</h2>
      <div class="btn-row">
        <button class="btn" data-report="status_summary">סיכום מצב הסברתי</button>
        <button class="btn ghost" data-go="summary">סיכום משמרת</button>
        <button class="btn ghost" data-report="open_questions">שאלות פתוחות</button>
        <button class="btn ghost" data-report="actions">פעולות שבוצעו</button>
        <button class="btn ghost" data-report="messages_doc">מסמך מסרים</button>
        <button class="btn ghost" data-report="gaps">רשימת פערים</button>
      </div>
    </div>
    <div class="grid2">
      <div class="card">
        <h2>🔴 שאלות דחופות פתוחות</h2>
        ${d.urgent_open.length ? d.urgent_open.map(q =>
          `<div class="hist-item" style="cursor:pointer" data-q="${q.id}">
            ${urgChip(q.urgency)} ${statusChip(q.status)} ${esc(q.content.slice(0, 90))}</div>`).join('')
        : '<div class="empty">אין שאלות דחופות פתוחות</div>'}
      </div>
      <div class="card">
        <h2>📢 מסרים פעילים</h2>
        ${d.active_messages.length ? d.active_messages.map(m =>
          `<div class="hist-item">${esc(m.title)} <span class="muted">${esc(m.audience || '')}</span></div>`).join('')
        : '<div class="empty">אין מסרים פעילים</div>'}
      </div>
      <div class="card">
        <h2>📄 מסמכים אחרונים</h2>
        ${d.recent_documents.length ? d.recent_documents.map(doc =>
          `<div class="hist-item">${esc(doc.title)} <span class="muted">${esc(doc.doc_type || '')} · ${fmtD(doc.created_at)}</span></div>`).join('')
        : '<div class="empty">אין מסמכים</div>'}
      </div>
      <div class="card">
        <h2>🔁 נושאים חוזרים</h2>
        ${d.recurring_topics.length ? d.recurring_topics.map(t =>
          `<div class="hist-item">${esc(t.topic)} <span class="chip urg-רגיל">${t.c} שאלות</span></div>`).join('')
        : '<div class="empty">אין עדיין נושאים חוזרים</div>'}
      </div>
    </div>
    ${d.open_gaps.length ? `<div class="card"><h2>⚠️ פערים פתוחים</h2>${d.open_gaps.map(g =>
      `<div class="hist-item"><b>${esc(g.title)}</b>: ${esc((g.ai_gaps || '').slice(0, 150))}</div>`).join('')}</div>` : ''}
  `;
  c.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.go)));
  c.querySelectorAll('[data-report]').forEach(el => el.addEventListener('click', () => showReport(el.dataset.report)));
  c.querySelectorAll('[data-q]').forEach(el => el.addEventListener('click', () => openQuestion(+el.dataset.q)));
}

async function showReport(kind) {
  try {
    const r = await api('/api/reports/' + kind);
    const m = modal(`
      <h2>${esc(r.title)}</h2>
      <div class="summary-box">${esc(r.text)}</div>
      <div class="btn-row">
        <button class="btn" id="repCopy">📋 העתק</button>
        <button class="btn ghost" id="repDl">⬇️ הורד קובץ</button>
        <button class="btn ghost" onclick="closeModal()">סגור</button>
      </div>`, true);
    m.querySelector('#repCopy').addEventListener('click', () => copyText(r.text));
    m.querySelector('#repDl').addEventListener('click', () => download(`${r.title} ${new Date().toISOString().slice(0, 10)}.md`, r.text));
  } catch (e) { toast(e.message, true); }
}

/* ---------------- מרכז שאלות ---------------- */
let qFilters = { open: '1' };

async function renderQuestions() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">מרכז שאלות ופניות</h2>
        <div class="btn-row" style="margin:0">
          ${canWrite() ? `<button class="btn" id="newQ">+ שאלה חדשה</button>
          <button class="btn ghost" id="pasteWA">📱 הדבק מוואטסאפ</button>` : ''}
        </div>
      </div>
      <div class="filters" style="margin-top:12px">
        <select id="fOpen"><option value="1" ${qFilters.open === '1' ? 'selected' : ''}>פתוחות בלבד</option><option value="" ${!qFilters.open ? 'selected' : ''}>הכל</option></select>
        <select id="fStatus"><option value="">כל הסטטוסים</option>${options(META.statuses, qFilters.status, false)}</select>
        <select id="fTopic"><option value="">כל הנושאים</option>${options(META.topics, qFilters.topic, false)}</select>
        <select id="fUrg"><option value="">כל הדחיפויות</option>${options(META.urgencies, qFilters.urgency, false)}</select>
        <select id="fSource"><option value="">כל המקורות</option>${options(META.sources, qFilters.source, false)}</select>
        <input id="fQ" placeholder="חיפוש חופשי..." value="${esc(qFilters.q || '')}">
        <button class="btn sm" id="fApply">סנן</button>
      </div>
      <div id="qList"><div class="empty">טוען...</div></div>
    </div>`;
  if (canWrite()) {
    $('#newQ').addEventListener('click', () => questionForm());
    $('#pasteWA').addEventListener('click', pasteWhatsappModal);
  }
  $('#fApply').addEventListener('click', () => {
    qFilters = {
      open: $('#fOpen').value, status: $('#fStatus').value, topic: $('#fTopic').value,
      urgency: $('#fUrg').value, source: $('#fSource').value, q: $('#fQ').value.trim(),
    };
    if (qFilters.status) qFilters.open = '';
    loadQuestions();
  });
  $('#fQ').addEventListener('keydown', e => { if (e.key === 'Enter') $('#fApply').click(); });
  loadQuestions();
}

async function loadQuestions() {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(qFilters)) if (v) params.set(k, v);
  const rows = await api('/api/questions?' + params.toString());
  const el = $('#qList');
  if (!rows.length) { el.innerHTML = '<div class="empty">אין שאלות תואמות</div>'; return; }
  el.innerHTML = `<div class="table-wrap"><table class="list">
    <tr><th>#</th><th>נפתחה</th><th>תוכן</th><th>פונה</th><th>נושא</th><th>דחיפות</th><th>סטטוס</th><th>מטפל</th><th>מקור</th></tr>
    ${rows.map(q => `<tr class="clickable" data-q="${q.id}">
      <td>${q.id}</td><td class="muted">${fmtDT(q.opened_at)}</td>
      <td>${esc(q.content.slice(0, 80))}${q.content.length > 80 ? '…' : ''}</td>
      <td>${esc(q.asker_name || '')}</td><td>${esc(q.topic || '')}</td>
      <td>${urgChip(q.urgency)}</td><td>${statusChip(q.status)}</td>
      <td>${esc(q.assignee_name || '')}</td><td><span class="src-chip">${esc(q.source)}</span></td>
    </tr>`).join('')}
  </table></div>`;
  el.querySelectorAll('tr[data-q]').forEach(tr =>
    tr.addEventListener('click', () => openQuestion(+tr.dataset.q)));
}

function questionFormFields(q = {}) {
  return `
    <div class="row">
      <div class="field"><label>שם הפונה</label><input id="qName" value="${esc(q.asker_name || '')}"></div>
      <div class="field"><label>טלפון</label><input id="qPhone" value="${esc(q.asker_phone || '')}"></div>
      <div class="field"><label>מקור</label><select id="qSource">${options(META.sources, q.source || 'ידני', false)}</select></div>
    </div>
    <div class="field"><label>תוכן השאלה *</label><textarea id="qContent">${esc(q.content || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>נושא</label><select id="qTopic">${options(META.topics, q.topic)}</select></div>
      <div class="field"><label>רשות / אזור</label>
        ${META.authorities.length ? `<select id="qAuth">${options(META.authorities, q.authority)}</select>`
          : `<input id="qAuth" value="${esc(q.authority || '')}" placeholder="שם רשות">`}</div>
      <div class="field"><label>דחיפות</label><select id="qUrg">${options(META.urgencies, q.urgency || 'רגיל', false)}</select></div>
      <div class="field"><label>גורם מטפל</label><select id="qAssignee">${options(META.users, q.assignee_id)}</select></div>
    </div>
    <div class="field"><label><input type="checkbox" id="qNeedsAppr" ${q.needs_approval ? 'checked' : ''}> נדרש אישור למענה</label></div>
    <div class="field"><label>הערות פנימיות</label><textarea id="qNotes" style="min-height:44px">${esc(q.internal_notes || '')}</textarea></div>`;
}

function readQuestionForm(m) {
  return {
    asker_name: m.querySelector('#qName').value.trim(),
    asker_phone: m.querySelector('#qPhone').value.trim(),
    source: m.querySelector('#qSource').value,
    content: m.querySelector('#qContent').value.trim(),
    topic: m.querySelector('#qTopic').value,
    authority: m.querySelector('#qAuth').value,
    urgency: m.querySelector('#qUrg').value,
    assignee_id: m.querySelector('#qAssignee').value || null,
    needs_approval: m.querySelector('#qNeedsAppr').checked,
    internal_notes: m.querySelector('#qNotes').value.trim(),
  };
}

function questionForm(preset = {}) {
  const m = modal(`<h2>שאלה חדשה</h2>${questionFormFields(preset)}
    <div class="btn-row"><button class="btn" id="qSave">פתח שאלה</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`, true);
  m.querySelector('#qSave').addEventListener('click', async () => {
    const body = readQuestionForm(m);
    if (preset.opened_at) body.opened_at = preset.opened_at;
    if (preset.raw_source_text) body.raw_source_text = preset.raw_source_text;
    if (!body.content) { toast('תוכן השאלה חובה', true); return; }
    try {
      await api('/api/questions', { method: 'POST', body });
      closeModal(); toast('השאלה נפתחה');
      if (currentTab === 'questions') loadQuestions(); else switchTab('questions');
    } catch (e) { toast(e.message, true); }
  });
}

function pasteWhatsappModal() {
  const m = modal(`
    <h2>📱 הדבקת הודעה מוואטסאפ</h2>
    <p class="muted">הדבק כאן הודעה או קטע שיחה שהועתקו מוואטסאפ. המערכת תזהה שם, טלפון ותוכן.</p>
    <div class="field"><textarea id="waText" style="min-height:140px" placeholder="[8.7.2026, 14:22] ישראל ישראלי: האם יש הנחיות חדשות?"></textarea></div>
    <div class="btn-row"><button class="btn" id="waParse">זהה ופתח שאלה</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`, true);
  m.querySelector('#waParse').addEventListener('click', async () => {
    try {
      const p = await api('/api/questions/paste-whatsapp', { method: 'POST', body: { text: m.querySelector('#waText').value } });
      closeModal();
      questionForm({
        asker_name: p.asker_name, asker_phone: p.asker_phone, content: p.content,
        source: 'וואטסאפ', opened_at: p.opened_at, raw_source_text: p.raw_source_text,
      });
    } catch (e) { toast(e.message, true); }
  });
}

async function openQuestion(qid) {
  const q = await api('/api/questions/' + qid);
  const m = modal(`
    <div class="row" style="justify-content:space-between">
      <h2 style="margin:0">שאלה #${q.id}</h2>
      <div>${urgChip(q.urgency)} ${statusChip(q.status)} <span class="src-chip">${esc(q.source)}</span></div>
    </div>
    <p class="muted">נפתחה: ${fmtDT(q.opened_at)} ${q.asker_name ? '· פונה: ' + esc(q.asker_name) : ''}
      ${q.asker_phone ? '· ' + esc(q.asker_phone) : ''} ${q.authority ? '· רשות: ' + esc(q.authority) : ''}</p>
    ${canWrite() ? questionFormFields(q) : `<div class="summary-box">${esc(q.content)}</div>`}
    <div class="field"><label>מענה מוצע</label>
      <textarea id="qProposed" ${canWrite() ? '' : 'readonly'}>${esc(q.proposed_answer || '')}</textarea></div>
    ${q.approved_answer ? `<div class="field"><label>✅ מענה מאושר (${esc(q.approved_by_name || '')}, ${fmtDT(q.answered_at)})</label>
      <div class="summary-box" style="max-height:150px">${esc(q.approved_answer)}</div>
      <div class="btn-row" style="margin-top:4px">
        <button class="btn sm ghost" id="copyAnswer">📋 העתק מענה לשליחה</button>
        ${canWrite() && q.asker_phone && META.wa_send_enabled ? `<button class="btn sm" style="background:#25D366" id="sendWA">📱 השב בוואטסאפ לפונה</button>` : ''}
      </div></div>` : ''}
    ${canWrite() ? `
    <div class="btn-row">
      <button class="btn" id="qUpdate">💾 שמור שינויים</button>
      ${isLead() || !q.needs_approval ? `<button class="btn green" style="background:var(--ok)" id="qApprove">✅ אשר מענה</button>` : ''}
      ${q.needs_approval && !isLead() ? `<button class="btn amber" id="qToApproval">שלח לאישור</button>` : ''}
      <select id="qStatusSel">${options(META.statuses, q.status, false)}</select>
      <button class="btn ghost" id="qSetStatus">עדכן סטטוס</button>
    </div>
    <div class="row" style="margin-top:10px">
      <div class="field"><label>צירוף קובץ</label><input type="file" id="qFile"></div>
      <button class="btn sm ghost" id="qUpload">העלה</button>
    </div>` : ''}
    ${q.attachments.length ? `<h3 style="margin-top:14px">📎 קבצים</h3>` + q.attachments.map(a =>
      `<div class="hist-item"><a href="/api/attachments/${a.id}/download">${esc(a.orig_name)}</a>
       <span class="muted">(${Math.round((a.size || 0) / 1024)}KB)</span></div>`).join('') : ''}
    ${q.links.length ? `<h3 style="margin-top:14px">🔗 קישורים</h3>` + q.links.map(l =>
      `<div class="hist-item">${l.kind === 'document' ? '📄' : l.kind === 'message' ? '📢' : '📝'} ${esc(l.label)}</div>`).join('') : ''}
    <h3 style="margin-top:14px">🕐 היסטוריית טיפול</h3>
    ${q.history.map(h => `<div class="hist-item">${esc(h.detail || h.action)}
      <div class="when">${fmtDT(h.created_at)} ${h.user_name ? '· ' + esc(h.user_name) : '· מערכת'}</div></div>`).join('') || '<div class="empty">אין</div>'}
    <div class="btn-row"><button class="btn ghost" onclick="closeModal()">סגור</button></div>
  `, true);

  const copyBtn = m.querySelector('#copyAnswer');
  if (copyBtn) copyBtn.addEventListener('click', () => copyText(q.approved_answer));

  const sendWABtn = m.querySelector('#sendWA');
  if (sendWABtn) sendWABtn.addEventListener('click', async () => {
    if (!confirm(`לשלוח את המענה בוואטסאפ אל ${q.asker_name || ''} (${q.asker_phone})?`)) return;
    sendWABtn.disabled = true;
    try {
      await api(`/api/questions/${qid}/send-answer`, { method: 'POST' });
      toast('📱 המענה נשלח לפונה בוואטסאפ');
      closeModal();
      if (currentTab === 'questions') loadQuestions();
    } catch (e) { toast(e.message, true); sendWABtn.disabled = false; }
  });

  if (!canWrite()) return;

  m.querySelector('#qUpdate').addEventListener('click', async () => {
    try {
      const body = readQuestionForm(m);
      body.proposed_answer = m.querySelector('#qProposed').value.trim();
      await api('/api/questions/' + qid, { method: 'PUT', body });
      closeModal(); toast('נשמר');
      if (currentTab === 'questions') loadQuestions();
    } catch (e) { toast(e.message, true); }
  });

  const apprBtn = m.querySelector('#qApprove');
  if (apprBtn) apprBtn.addEventListener('click', async () => {
    try {
      const answer = m.querySelector('#qProposed').value.trim();
      await api(`/api/questions/${qid}/approve`, { method: 'POST', body: { answer } });
      toast('המענה אושר'); closeModal();
      if (currentTab === 'questions') loadQuestions();
    } catch (e) { toast(e.message, true); }
  });

  const toApprBtn = m.querySelector('#qToApproval');
  if (toApprBtn) toApprBtn.addEventListener('click', async () => {
    try {
      const body = readQuestionForm(m);
      body.proposed_answer = m.querySelector('#qProposed').value.trim();
      await api('/api/questions/' + qid, { method: 'PUT', body });
      await api(`/api/questions/${qid}/status`, { method: 'POST', body: { status: 'ממתין לאישור' } });
      toast('נשלח לאישור'); closeModal();
      if (currentTab === 'questions') loadQuestions();
    } catch (e) { toast(e.message, true); }
  });

  m.querySelector('#qSetStatus').addEventListener('click', async () => {
    try {
      await api(`/api/questions/${qid}/status`, { method: 'POST', body: { status: m.querySelector('#qStatusSel').value } });
      toast('הסטטוס עודכן'); closeModal();
      if (currentTab === 'questions') loadQuestions();
    } catch (e) { toast(e.message, true); }
  });

  m.querySelector('#qUpload').addEventListener('click', async () => {
    const f = m.querySelector('#qFile').files[0];
    if (!f) { toast('בחר קובץ', true); return; }
    const fd = new FormData();
    fd.append('file', f);
    try {
      await api(`/api/questions/${qid}/attachments`, { method: 'POST', body: fd });
      toast('הקובץ הועלה'); closeModal(); openQuestion(qid);
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- מסמכים ---------------- */
async function renderDocuments() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">מאגר מסמכים ותובנות</h2>
        ${canWrite() ? '<button class="btn" id="upDoc">+ העלאת מסמך</button>' : ''}
      </div>
      <div id="docList" style="margin-top:12px"><div class="empty">טוען...</div></div>
    </div>`;
  if (canWrite()) $('#upDoc').addEventListener('click', uploadDocModal);
  loadDocuments();
}

async function loadDocuments() {
  const rows = await api('/api/documents');
  const el = $('#docList');
  if (!rows.length) { el.innerHTML = '<div class="empty">אין מסמכים. העלה מסמך ראשון.</div>'; return; }
  el.innerHTML = `<div class="table-wrap"><table class="list">
    <tr><th>שם</th><th>סוג</th><th>מקור</th><th>הועלה</th><th>ע"י</th><th>תובנות</th></tr>
    ${rows.map(d => `<tr class="clickable" data-d="${d.id}">
      <td>${esc(d.title)}</td><td>${esc(d.doc_type || '')}</td><td>${esc(d.source || '')}</td>
      <td class="muted">${fmtDT(d.created_at)}</td><td>${esc(d.uploaded_by_name || '')}</td>
      <td>${d.insights_generated_at ? '<span class="ai-tag">✓ הופקו</span>' : '<span class="muted">—</span>'}</td>
    </tr>`).join('')}
  </table></div>`;
  el.querySelectorAll('tr[data-d]').forEach(tr =>
    tr.addEventListener('click', () => openDocument(+tr.dataset.d)));
}

function uploadDocModal() {
  const m = modal(`
    <h2>העלאת מסמך</h2>
    <div class="field"><label>קובץ (PDF / Word / טקסט) *</label><input type="file" id="dFile" accept=".pdf,.docx,.txt"></div>
    <div class="field"><label>שם המסמך</label><input id="dTitle" placeholder="ברירת מחדל: שם הקובץ"></div>
    <div class="row">
      <div class="field"><label>סוג מסמך</label><select id="dType">${options(META.doc_types, '')}</select></div>
      <div class="field"><label>מקור המסמך</label><input id="dSource" placeholder="פיקוד העורף / מחוז / רשות..."></div>
    </div>
    <div class="btn-row"><button class="btn" id="dUp">העלה</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  m.querySelector('#dUp').addEventListener('click', async () => {
    const f = m.querySelector('#dFile').files[0];
    if (!f) { toast('בחר קובץ', true); return; }
    const fd = new FormData();
    fd.append('file', f);
    fd.append('title', m.querySelector('#dTitle').value.trim());
    fd.append('doc_type', m.querySelector('#dType').value);
    fd.append('source', m.querySelector('#dSource').value.trim());
    try {
      const r = await api('/api/documents', { method: 'POST', body: fd });
      closeModal();
      if (r.warning) toast(r.warning, true); else toast('המסמך הועלה');
      loadDocuments();
      openDocument(r.id);
    } catch (e) { toast(e.message, true); }
  });
}

const INSIGHT_FIELDS = [
  ['ai_summary', 'תקציר'], ['ai_key_points', 'עיקרי הדברים'], ['ai_messages', 'מסרים מרכזיים'],
  ['ai_qa', 'שאלות ותשובות'], ['ai_gaps', 'פערים שדורשים הבהרה'], ['ai_draft_message', 'נוסח הודעה מוצע'],
];

async function openDocument(docId) {
  const d = await api('/api/documents/' + docId);
  const m = modal(`
    <div class="row" style="justify-content:space-between">
      <h2 style="margin:0">📄 ${esc(d.title)}</h2>
      <a class="btn sm ghost" href="/api/documents/${d.id}/download">⬇️ הורד קובץ</a>
    </div>
    <p class="muted">${esc(d.doc_type || 'מסמך')} · ${esc(d.source || '')} · הועלה ${fmtDT(d.created_at)} ע"י ${esc(d.uploaded_by_name || '')}
      ${d.insights_generated_at ? `· <span class="ai-tag">תובנות: ${fmtDT(d.insights_generated_at)} (${esc(d.insights_model || '')})</span>` : ''}</p>
    ${canWrite() && META.ai_enabled ? `<div class="btn-row" style="margin-bottom:10px">
      <button class="btn" id="genInsights">🤖 הפק תובנות${d.insights_generated_at ? ' מחדש' : ''}</button>
      <span id="aiSpin" class="hidden"><span class="spinner"></span>מנתח מסמך... (עשוי לקחת עד דקה)</span>
    </div>` : (!META.ai_enabled ? '<p class="muted">🤖 מפתח AI לא מוגדר — ניתן למלא את שדות התובנות ידנית.</p>' : '')}
    <div class="field"><label>טקסט מחולץ (ניתן לעריכה/הדבקה)</label>
      <textarea id="dExtracted" style="min-height:90px" ${canWrite() ? '' : 'readonly'}>${esc(d.extracted_text || '')}</textarea></div>
    ${INSIGHT_FIELDS.map(([f, label]) => `
      <div class="field"><label>${label}</label>
        <textarea id="f_${f}" ${canWrite() ? '' : 'readonly'}>${esc(d[f] || '')}</textarea></div>`).join('')}
    ${canWrite() ? `<div class="btn-row">
      <button class="btn" id="dSave">💾 שמור</button>
      <button class="btn ghost" id="dToMsg">📢 צור מסר מהתובנות</button>
      <button class="btn ghost" id="dToOut">📤 צור הודעה להפצה</button>
      ${isLead() ? '<button class="btn danger" id="dDelete">מחק מסמך</button>' : ''}
      <button class="btn ghost" onclick="closeModal()">סגור</button>
    </div>` : '<div class="btn-row"><button class="btn ghost" onclick="closeModal()">סגור</button></div>'}
  `, true);

  if (!canWrite()) return;

  const gen = m.querySelector('#genInsights');
  if (gen) gen.addEventListener('click', async () => {
    const hasContent = INSIGHT_FIELDS.some(([f]) => m.querySelector('#f_' + f).value.trim());
    if (hasContent && !confirm('קיימות תובנות בשדות — להחליף אותן בתובנות חדשות?')) return;
    gen.disabled = true;
    m.querySelector('#aiSpin').classList.remove('hidden');
    try {
      // שמירת הטקסט המחולץ קודם (אם המשתמש הדביק ידנית)
      await api('/api/documents/' + docId, { method: 'PUT', body: { extracted_text: m.querySelector('#dExtracted').value } });
      const r = await api(`/api/documents/${docId}/insights`, { method: 'POST' });
      if (r.error) { toast(r.error, true); }
      else {
        toast('התובנות הופקו');
        const map = { summary: 'ai_summary', key_points: 'ai_key_points', messages: 'ai_messages', qa: 'ai_qa', gaps: 'ai_gaps', draft_message: 'ai_draft_message' };
        for (const [k, f] of Object.entries(map)) m.querySelector('#f_' + f).value = r.insights[k] || '';
      }
    } catch (e) { toast(e.message, true); }
    gen.disabled = false;
    m.querySelector('#aiSpin').classList.add('hidden');
  });

  m.querySelector('#dSave').addEventListener('click', async () => {
    const body = { extracted_text: m.querySelector('#dExtracted').value };
    for (const [f] of INSIGHT_FIELDS) body[f] = m.querySelector('#f_' + f).value;
    try {
      await api('/api/documents/' + docId, { method: 'PUT', body });
      toast('נשמר'); closeModal(); loadDocuments();
    } catch (e) { toast(e.message, true); }
  });

  m.querySelector('#dToMsg').addEventListener('click', async () => {
    try {
      await api(`/api/documents/${docId}/to-message`, { method: 'POST' });
      toast('נוצר מסר (טיוטה) מהמסמך'); closeModal(); switchTab('messages');
    } catch (e) { toast(e.message, true); }
  });

  m.querySelector('#dToOut').addEventListener('click', () => {
    closeModal();
    switchTab('outgoing');
    setTimeout(() => {
      const st = $('#oSrcType'), si = $('#oSrcId');
      if (st) { st.value = 'document'; st.dispatchEvent(new Event('change')); }
      setTimeout(() => { if (si) si.value = docId; }, 300);
    }, 300);
  });

  const del = m.querySelector('#dDelete');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('למחוק את המסמך לצמיתות?')) return;
    try {
      await api('/api/documents/' + docId, { method: 'DELETE' });
      toast('נמחק'); closeModal(); loadDocuments();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- מסרים ---------------- */
async function renderMessages() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">מסרים פעילים</h2>
        ${canWrite() ? '<button class="btn" id="newMsg">+ מסר חדש</button>' : ''}
      </div>
      <div class="filters" style="margin-top:12px">
        <select id="mStatus"><option value="">כל הסטטוסים</option>${options(META.msg_statuses, '', false)}</select>
        <button class="btn sm" id="mApply">סנן</button>
      </div>
      <div id="msgList"><div class="empty">טוען...</div></div>
    </div>`;
  if (canWrite()) $('#newMsg').addEventListener('click', () => messageForm());
  $('#mApply').addEventListener('click', loadMessages);
  loadMessages();
}

async function loadMessages() {
  const st = $('#mStatus') ? $('#mStatus').value : '';
  const rows = await api('/api/messages' + (st ? '?status=' + encodeURIComponent(st) : ''));
  const el = $('#msgList');
  if (!rows.length) { el.innerHTML = '<div class="empty">אין מסרים</div>'; return; }
  el.innerHTML = rows.map(msg => `
    <div class="card" style="margin-bottom:10px">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">${esc(msg.title)} ${statusChip(msg.status)} ${msg.audience ? chip(msg.audience, 'urg-רגיל') : ''}</h3>
        <span class="muted">${fmtDT(msg.updated_at)}</span>
      </div>
      <div style="white-space:pre-wrap;font-size:14px;margin:8px 0">${esc(msg.body)}</div>
      <div class="muted">ניסח: ${esc(msg.created_by_name || '')} ${msg.approved_by_name ? '· אישר: ' + esc(msg.approved_by_name) : ''}
        ${msg.valid_until ? '· תוקף עד: ' + fmtD(msg.valid_until) : ''}</div>
      <div class="btn-row">
        <button class="btn sm ghost" data-copy="${msg.id}">📋 העתק</button>
        ${canWrite() ? `<button class="btn sm ghost" data-edit="${msg.id}">✏️ ערוך</button>` : ''}
        ${isLead() && msg.status !== 'פעיל' && msg.status !== 'הוחלף' ? `<button class="btn sm" data-appr="${msg.id}">✅ אשר והפעל</button>` : ''}
        ${canWrite() && msg.status === 'פעיל' ? `<button class="btn sm ghost" data-repl="${msg.id}">🔄 החלף בגרסה חדשה</button>
          <button class="btn sm amber" data-deact="${msg.id}">⏸ הפוך ללא פעיל</button>` : ''}
        ${isLead() && msg.status === 'לא פעיל' ? `<button class="btn sm ghost" data-react="${msg.id}">▶️ הפעל מחדש</button>` : ''}
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
    const msg = rows.find(x => x.id === +b.dataset.copy);
    copyText(msg.title + '\n' + msg.body);
  }));
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
    messageForm(rows.find(x => x.id === +b.dataset.edit))));
  el.querySelectorAll('[data-appr]').forEach(b => b.addEventListener('click', async () => {
    try { await api(`/api/messages/${b.dataset.appr}/approve`, { method: 'POST' }); toast('המסר אושר והופעל'); loadMessages(); }
    catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll('[data-repl]').forEach(b => b.addEventListener('click', () => {
    const old = rows.find(x => x.id === +b.dataset.repl);
    messageForm({ ...old, id: null, _replaces: old.id, status: 'טיוטה' });
  }));
  el.querySelectorAll('[data-deact]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('להפוך את המסר ללא פעיל? הוא יוסר מהמסרים הפעילים וממסמך המסרים.')) return;
    try { await api('/api/messages/' + b.dataset.deact, { method: 'PUT', body: { status: 'לא פעיל' } }); toast('המסר הועבר ללא פעיל'); loadMessages(); }
    catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll('[data-react]').forEach(b => b.addEventListener('click', async () => {
    try { await api('/api/messages/' + b.dataset.react, { method: 'PUT', body: { status: 'פעיל' } }); toast('המסר הופעל מחדש'); loadMessages(); }
    catch (e) { toast(e.message, true); }
  }));
}

function messageForm(msg = {}) {
  const isEdit = !!msg.id;
  const m = modal(`
    <h2>${isEdit ? 'עריכת מסר' : msg._replaces ? 'גרסה חדשה למסר' : 'מסר חדש'}</h2>
    <div class="field"><label>נושא המסר *</label><input id="msgTitle" value="${esc(msg.title || '')}"></div>
    <div class="field"><label>נוסח המסר *</label><textarea id="msgBody" style="min-height:110px">${esc(msg.body || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>קהל יעד</label><select id="msgAud">${options(META.audiences, msg.audience)}</select></div>
      <div class="field"><label>תוקף עד</label><input type="date" id="msgValid" value="${esc(fmtD(msg.valid_until || ''))}"></div>
      ${isEdit ? `<div class="field"><label>סטטוס</label><select id="msgStatus">${options(META.msg_statuses, msg.status, false)}</select></div>` : ''}
    </div>
    <div class="field"><label>הערות</label><input id="msgNotes" value="${esc(msg.notes || '')}"></div>
    <div class="btn-row"><button class="btn" id="msgSave">שמור</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`, true);
  m.querySelector('#msgSave').addEventListener('click', async () => {
    const body = {
      title: m.querySelector('#msgTitle').value.trim(),
      body: m.querySelector('#msgBody').value.trim(),
      audience: m.querySelector('#msgAud').value,
      valid_until: m.querySelector('#msgValid').value || null,
      notes: m.querySelector('#msgNotes').value.trim(),
    };
    if (!body.title || !body.body) { toast('נושא ונוסח חובה', true); return; }
    try {
      if (isEdit) {
        body.status = m.querySelector('#msgStatus').value;
        await api('/api/messages/' + msg.id, { method: 'PUT', body });
      } else if (msg._replaces) {
        await api(`/api/messages/${msg._replaces}/replace`, { method: 'POST', body });
      } else {
        await api('/api/messages', { method: 'POST', body });
      }
      closeModal(); toast('נשמר'); loadMessages();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- בנק הודעות מוכנות ---------------- */
async function renderCanned() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">🗂 בנק הודעות מוכנות מראש</h2>
        ${canWrite() ? '<button class="btn" id="newCanned">+ תבנית חדשה</button>' : ''}
      </div>
      <p class="muted">הודעות מנוסחות מראש לתרחישי חירום — ממלאים את ה[סוגריים] ומפיצים. חוסך דקות קריטיות באירוע.</p>
      <div class="filters">
        <select id="cnCat"><option value="">כל התרחישים</option>${options(META.canned_categories, '', false)}</select>
        <button class="btn sm" id="cnApply">סנן</button>
      </div>
      <div id="cannedList"><div class="empty">טוען...</div></div>
    </div>`;
  if (canWrite()) $('#newCanned').addEventListener('click', () => cannedForm());
  $('#cnApply').addEventListener('click', loadCanned);
  loadCanned();
}

async function loadCanned() {
  const cat = $('#cnCat') ? $('#cnCat').value : '';
  const rows = await api('/api/canned' + (cat ? '?category=' + encodeURIComponent(cat) : ''));
  const el = $('#cannedList');
  if (!rows.length) { el.innerHTML = '<div class="empty">אין תבניות. צור תבנית ראשונה.</div>'; return; }
  el.innerHTML = rows.map(cm => `
    <div class="card" style="margin-bottom:10px">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">${esc(cm.title)} ${cm.category ? chip(cm.category, 'urg-דחוף') : ''}
          ${cm.audience ? chip(cm.audience, 'urg-רגיל') : ''}</h3>
      </div>
      <div style="white-space:pre-wrap;font-size:14px;margin:8px 0">${esc(cm.body)}</div>
      ${cm.notes ? `<div class="muted">📌 ${esc(cm.notes)}</div>` : ''}
      <div class="btn-row">
        <button class="btn sm" data-use="${cm.id}">📤 שלח להפצה</button>
        <button class="btn sm ghost" data-copy="${cm.id}">📋 העתק</button>
        ${canWrite() ? `<button class="btn sm ghost" data-edit="${cm.id}">✏️ ערוך</button>` : ''}
        ${isLead() ? `<button class="btn sm danger" data-del="${cm.id}">מחק</button>` : ''}
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () =>
    copyText(rows.find(x => x.id === +b.dataset.copy).body)));
  el.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
    const cm = rows.find(x => x.id === +b.dataset.use);
    switchTab('outgoing');
    setTimeout(() => {
      const bodyEl = $('#oBody'), audEl = $('#oAud');
      if (bodyEl) bodyEl.value = cm.body;
      if (audEl && cm.audience) audEl.value = cm.audience;
      toast('התבנית נטענה — מלא את ה[סוגריים] לפני השמירה');
    }, 400);
  }));
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
    cannedForm(rows.find(x => x.id === +b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('למחוק את התבנית?')) return;
    try { await api('/api/canned/' + b.dataset.del, { method: 'DELETE' }); toast('נמחק'); loadCanned(); }
    catch (e) { toast(e.message, true); }
  }));
}

function cannedForm(cm = null) {
  const isEdit = !!cm;
  const m = modal(`
    <h2>${isEdit ? 'עריכת תבנית' : 'תבנית הודעה חדשה'}</h2>
    <div class="field"><label>כותרת התבנית *</label><input id="cnTitle" value="${esc(cm ? cm.title : '')}"></div>
    <div class="row">
      <div class="field"><label>תרחיש</label><select id="cnCategory">${options(META.canned_categories, cm ? cm.category : '')}</select></div>
      <div class="field"><label>קהל יעד</label><select id="cnAud">${options(META.audiences, cm ? cm.audience : '')}</select></div>
    </div>
    <div class="field"><label>נוסח ההודעה * (השתמש ב[סוגריים] לפרטים משתנים)</label>
      <textarea id="cnBody" style="min-height:130px">${esc(cm ? cm.body : '')}</textarea></div>
    <div class="field"><label>הערות שימוש</label><input id="cnNotes" value="${esc(cm ? cm.notes || '' : '')}"></div>
    <div class="btn-row"><button class="btn" id="cnSave">שמור</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`, true);
  m.querySelector('#cnSave').addEventListener('click', async () => {
    const body = {
      title: m.querySelector('#cnTitle').value.trim(),
      category: m.querySelector('#cnCategory').value,
      audience: m.querySelector('#cnAud').value,
      body: m.querySelector('#cnBody').value.trim(),
      notes: m.querySelector('#cnNotes').value.trim(),
    };
    if (!body.title || !body.body) { toast('כותרת ונוסח חובה', true); return; }
    try {
      if (isEdit) await api('/api/canned/' + cm.id, { method: 'PUT', body });
      else await api('/api/canned', { method: 'POST', body });
      closeModal(); toast('נשמר'); loadCanned();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- גלריית חומרי הסברה ---------------- */
async function renderGallery() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">🖼 גלריית חומרי הסברה</h2>
        ${canWrite() ? '<button class="btn" id="upMat">+ העלאת חומר</button>' : ''}
      </div>
      <p class="muted">פליירים, אינפוגרפיקות, תמונות, סרטונים ומצגות — מוכנים להורדה והפצה.</p>
      <div class="filters">
        <select id="gCat"><option value="">כל הקטגוריות</option>${options(META.material_categories, '', false)}</select>
        <button class="btn sm" id="gApply">סנן</button>
      </div>
      <div id="galleryGrid" class="gallery-grid"><div class="empty">טוען...</div></div>
    </div>`;
  if (canWrite()) $('#upMat').addEventListener('click', uploadMaterialModal);
  $('#gApply').addEventListener('click', loadGallery);
  loadGallery();
}

async function loadGallery() {
  const cat = $('#gCat') ? $('#gCat').value : '';
  const rows = await api('/api/materials' + (cat ? '?category=' + encodeURIComponent(cat) : ''));
  const el = $('#galleryGrid');
  if (!rows.length) { el.innerHTML = '<div class="empty">אין חומרים בגלריה. העלה חומר ראשון.</div>'; return; }
  const icon = (m) => m.is_image ? '' :
    (m.mime || '').includes('pdf') ? '📄' : (m.mime || '').includes('video') ? '🎬' :
    (m.orig_name || '').endsWith('.pptx') ? '📊' : '📁';
  el.innerHTML = rows.map(mt => `
    <div class="gallery-card">
      ${mt.is_image
        ? `<a href="/api/materials/${mt.id}/file" target="_blank"><img src="/api/materials/${mt.id}/file" alt="${esc(mt.title)}" loading="lazy"></a>`
        : `<a class="gallery-icon" href="/api/materials/${mt.id}/file?dl=1">${icon(mt)}</a>`}
      <div class="gallery-info">
        <b>${esc(mt.title)}</b>
        ${mt.category ? chip(mt.category, 'urg-רגיל') : ''}
        ${mt.description ? `<div class="muted">${esc(mt.description)}</div>` : ''}
        <div class="muted">${esc(mt.uploaded_by_name || '')} · ${fmtD(mt.created_at)} · ${Math.round((mt.size || 0) / 1024)}KB</div>
        <div class="btn-row" style="margin-top:6px">
          <a class="btn sm ghost" href="/api/materials/${mt.id}/file?dl=1">⬇️ הורד</a>
          ${isLead() ? `<button class="btn sm danger" data-del="${mt.id}">מחק</button>` : ''}
        </div>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('למחוק את החומר לצמיתות?')) return;
    try { await api('/api/materials/' + b.dataset.del, { method: 'DELETE' }); toast('נמחק'); loadGallery(); }
    catch (e) { toast(e.message, true); }
  }));
}

function uploadMaterialModal() {
  const m = modal(`
    <h2>העלאת חומר הסברה</h2>
    <div class="field"><label>קובץ * (תמונה / PDF / וידאו / מצגת / מסמך, עד 20MB)</label>
      <input type="file" id="mtFile" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.mp4,.pptx,.docx,.xlsx"></div>
    <div class="field"><label>שם החומר</label><input id="mtTitle" placeholder="ברירת מחדל: שם הקובץ"></div>
    <div class="row">
      <div class="field"><label>קטגוריה</label><select id="mtCat">${options(META.material_categories, '')}</select></div>
    </div>
    <div class="field"><label>תיאור</label><input id="mtDesc" placeholder="למה משמש, לאיזה קהל..."></div>
    <div class="btn-row"><button class="btn" id="mtUp">העלה</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  m.querySelector('#mtUp').addEventListener('click', async () => {
    const f = m.querySelector('#mtFile').files[0];
    if (!f) { toast('בחר קובץ', true); return; }
    const fd = new FormData();
    fd.append('file', f);
    fd.append('title', m.querySelector('#mtTitle').value.trim());
    fd.append('category', m.querySelector('#mtCat').value);
    fd.append('description', m.querySelector('#mtDesc').value.trim());
    try {
      await api('/api/materials', { method: 'POST', body: fd });
      closeModal(); toast('החומר הועלה לגלריה'); loadGallery();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- פעילות ---------------- */
async function renderActivities() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">ריכוז פעילות שבוצעה</h2>
        ${canWrite() ? '<button class="btn" id="newAct">+ תיעוד פעולה</button>' : ''}
      </div>
      <div class="filters" style="margin-top:12px">
        <select id="aType"><option value="">כל הסוגים</option>${options(META.activity_types, '', false)}</select>
        <select id="aStatus"><option value="">כל הסטטוסים</option>${options(META.activity_statuses, '', false)}</select>
        <input type="date" id="aFrom"> <input type="date" id="aTo">
        <button class="btn sm" id="aApply">סנן</button>
      </div>
      <div id="actList"><div class="empty">טוען...</div></div>
    </div>`;
  if (canWrite()) $('#newAct').addEventListener('click', () => activityForm());
  $('#aApply').addEventListener('click', loadActivities);
  loadActivities();
}

async function loadActivities() {
  const params = new URLSearchParams();
  if ($('#aType') && $('#aType').value) params.set('activity_type', $('#aType').value);
  if ($('#aStatus') && $('#aStatus').value) params.set('status', $('#aStatus').value);
  if ($('#aFrom') && $('#aFrom').value) params.set('from', $('#aFrom').value);
  if ($('#aTo') && $('#aTo').value) params.set('to', $('#aTo').value);
  const rows = await api('/api/activities?' + params.toString());
  const el = $('#actList');
  if (!rows.length) { el.innerHTML = '<div class="empty">אין פעילות מתועדת</div>'; return; }
  el.innerHTML = `<div class="table-wrap"><table class="list">
    <tr><th>מתי</th><th>סוג</th><th>תוכן</th><th>קהל/רשות</th><th>מבצע</th><th>סטטוס</th></tr>
    ${rows.map(a => `<tr>
      <td class="muted">${fmtDT(a.performed_at)}</td><td>${esc(a.activity_type)}</td>
      <td>${esc(a.description.slice(0, 100))}</td>
      <td>${esc(a.audience || a.authority || '')}</td>
      <td>${esc(a.performed_by_name || '')}</td><td>${statusChip(a.status)}</td>
    </tr>`).join('')}
  </table></div>`;
}

function activityForm() {
  const m = modal(`
    <h2>תיעוד פעולת הסברה</h2>
    <div class="row">
      <div class="field"><label>סוג הפעולה</label><select id="actType">${options(META.activity_types, 'אחר', false)}</select></div>
      <div class="field"><label>סטטוס</label><select id="actStatus">${options(META.activity_statuses, 'בוצע', false)}</select></div>
    </div>
    <div class="field"><label>תוכן הפעולה *</label><textarea id="actDesc"></textarea></div>
    <div class="row">
      <div class="field"><label>נושא</label><select id="actTopic">${options(META.topics, '')}</select></div>
      <div class="field"><label>קהל יעד</label><select id="actAud">${options(META.audiences, '')}</select></div>
      <div class="field"><label>רשות</label><input id="actAuth"></div>
    </div>
    <div class="btn-row"><button class="btn" id="actSave">שמור</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  m.querySelector('#actSave').addEventListener('click', async () => {
    const body = {
      activity_type: m.querySelector('#actType').value,
      status: m.querySelector('#actStatus').value,
      description: m.querySelector('#actDesc').value.trim(),
      topic: m.querySelector('#actTopic').value,
      audience: m.querySelector('#actAud').value,
      authority: m.querySelector('#actAuth').value.trim(),
    };
    if (!body.description) { toast('תוכן הפעולה חובה', true); return; }
    try {
      await api('/api/activities', { method: 'POST', body });
      closeModal(); toast('הפעולה תועדה'); loadActivities();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- הודעות להפצה ---------------- */
async function renderOutgoing() {
  const c = $('#content');
  c.innerHTML = `
    ${canWrite() ? `<div class="card">
      <h2>יצירת הודעה להפצה</h2>
      <div class="row">
        <div class="field"><label>מקור המידע</label>
          <select id="oSrcType">
            <option value="manual">הזנה ידנית</option>
            <option value="question">שאלה שטופלה</option>
            <option value="document">מסמך</option>
            <option value="message">מסר פעיל</option>
          </select></div>
        <div class="field" id="oSrcIdWrap" style="display:none"><label>בחירת פריט</label><select id="oSrcId"></select></div>
        <div class="field"><label>קהל יעד</label><select id="oAud">${options(META.audiences, 'ציבור', false)}</select></div>
      </div>
      <div class="field" id="oManualWrap"><label>טקסט מקור (ידני)</label><textarea id="oManual"></textarea></div>
      <div class="btn-row">
        <button class="btn" id="oDraft">${META.ai_enabled ? '🤖 נסח הודעה' : 'הבא טקסט מקור'}</button>
        <span id="oSpin" class="hidden"><span class="spinner"></span>מנסח...</span>
      </div>
      <div class="field" style="margin-top:10px"><label>נוסח ההודעה (ניתן לעריכה)</label>
        <textarea id="oBody" style="min-height:110px"></textarea></div>
      <div class="field"><label><input type="checkbox" id="oNeedsAppr"> נדרש אישור לפני הפצה</label></div>
      <div class="btn-row"><button class="btn" id="oSave">שמור כטיוטה</button></div>
    </div>` : ''}
    <div class="card"><h2>הודעות להפצה</h2><div id="outList"><div class="empty">טוען...</div></div></div>`;

  if (canWrite()) {
    let lastDraftAI = false;
    $('#oSrcType').addEventListener('change', async () => {
      const t = $('#oSrcType').value;
      $('#oManualWrap').style.display = t === 'manual' ? '' : 'none';
      $('#oSrcIdWrap').style.display = t === 'manual' ? 'none' : '';
      if (t === 'question') {
        const qs = await api('/api/questions?open=');
        $('#oSrcId').innerHTML = options(qs.map(q => ({ id: q.id, name: `#${q.id} ${q.content.slice(0, 60)}` })), '');
      } else if (t === 'document') {
        const ds = await api('/api/documents');
        $('#oSrcId').innerHTML = options(ds.map(d => ({ id: d.id, name: d.title })), '');
      } else if (t === 'message') {
        const ms = await api('/api/messages');
        $('#oSrcId').innerHTML = options(ms.map(x => ({ id: x.id, name: x.title })), '');
      }
    });
    $('#oDraft').addEventListener('click', async () => {
      // אם כבר יש נוסח בתיבה — זהו ניסוח מחדש; מבקשים אישור לפני דריסה
      if ($('#oBody').value.trim() && !confirm('לנסח מחדש? הנוסח הנוכחי יוחלף.')) return;
      const t = $('#oSrcType').value;
      const body = {
        source_type: t,
        source_id: t === 'manual' ? null : ($('#oSrcId').value || null),
        audience: $('#oAud').value,
        manual_text: $('#oManual').value.trim(),
      };
      $('#oSpin').classList.remove('hidden');
      $('#oDraft').disabled = true;
      try {
        const r = await api('/api/outgoing/draft', { method: 'POST', body });
        $('#oBody').value = r.body;
        lastDraftAI = r.ai;
        if (r.ai) {
          toast('נוסח הוצע ע"י AI — ערוך לפי הצורך');
          $('#oDraft').textContent = '🔄 נסח מחדש עם AI';
        }
      } catch (e) { toast(e.message, true); }
      $('#oSpin').classList.add('hidden');
      $('#oDraft').disabled = false;
    });
    $('#oSave').addEventListener('click', async () => {
      const t = $('#oSrcType').value;
      const body = {
        source_type: t,
        source_id: t === 'manual' ? null : ($('#oSrcId').value || null),
        audience: $('#oAud').value,
        body: $('#oBody').value.trim(),
        needs_approval: $('#oNeedsAppr').checked,
        ai_generated: lastDraftAI,
      };
      if (!body.body) { toast('נוסח ההודעה ריק', true); return; }
      try {
        await api('/api/outgoing', { method: 'POST', body });
        $('#oBody').value = '';
        toast('נשמר כטיוטה'); loadOutgoing();
      } catch (e) { toast(e.message, true); }
    });
  }
  loadOutgoing();
}

async function loadOutgoing() {
  const rows = await api('/api/outgoing');
  const el = $('#outList');
  if (!rows.length) { el.innerHTML = '<div class="empty">אין הודעות</div>'; return; }
  el.innerHTML = rows.map(o => `
    <div class="hist-item" style="border-color:${o.status === 'הופץ' ? 'var(--ok)' : 'var(--warn)'}">
      <div class="row" style="justify-content:space-between">
        <div>${statusChip(o.status)} ${o.audience ? chip(o.audience, 'urg-רגיל') : ''}
          ${o.ai_generated ? '<span class="ai-tag">AI</span>' : ''}
          ${o.needs_approval ? '<span class="chip st-ממתין-לאישור">דורש אישור</span>' : ''}</div>
        <span class="muted">${fmtDT(o.created_at)} · ${esc(o.created_by_name || '')}</span>
      </div>
      <div style="white-space:pre-wrap;margin:6px 0">${esc(o.body)}</div>
      <div class="btn-row" style="margin-top:4px">
        <button class="btn sm ghost" data-copy="${o.id}">📋 העתק</button>
        ${canWrite() && o.status !== 'הופץ' ? `
          ${isLead() && o.needs_approval && o.status === 'טיוטה' ? `<button class="btn sm" data-appr="${o.id}">✅ אשר</button>` : ''}
          <button class="btn sm" style="background:var(--ok)" data-dist="${o.id}">📤 סמן כהופץ</button>` : ''}
        ${o.distributed_at ? `<span class="muted">הופץ: ${fmtDT(o.distributed_at)}</span>` : ''}
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () =>
    copyText(rows.find(x => x.id === +b.dataset.copy).body)));
  el.querySelectorAll('[data-appr]').forEach(b => b.addEventListener('click', async () => {
    try { await api(`/api/outgoing/${b.dataset.appr}/approve`, { method: 'POST' }); toast('אושר'); loadOutgoing(); }
    catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll('[data-dist]').forEach(b => b.addEventListener('click', async () => {
    try { await api(`/api/outgoing/${b.dataset.dist}/distribute`, { method: 'POST' }); toast('סומן כהופץ ותועד בפעילות'); loadOutgoing(); }
    catch (e) { toast(e.message, true); }
  }));
}

/* ---------------- סיכום משמרת ---------------- */
async function renderSummary() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <h2>סיכום משמרת / סוף יום</h2>
      <div class="row">
        <div class="field"><label>מתחילת (ברירת מחדל: מאז הסיכום האחרון)</label><input type="datetime-local" id="sFrom"></div>
        <div class="field"><label>עד</label><input type="datetime-local" id="sTo"></div>
        <button class="btn" id="sPreview">📋 הפק סיכום משמרת</button>
        ${META.ai_enabled && canWrite() ? '<button class="btn ghost" id="sAI">🤖 נסח נרטיבי עם AI</button>' : ''}
        <span id="sSpin" class="hidden"><span class="spinner"></span>מכין...</span>
      </div>
      <div id="sResult" class="hidden" style="margin-top:14px">
        <div class="field"><label>הסיכום (ניתן לעריכה לפני שמירה)</label>
          <textarea id="sBody" style="min-height:300px"></textarea></div>
        <div class="btn-row">
          ${canWrite() ? '<button class="btn" id="sSave">💾 שמור סיכום</button>' : ''}
          <button class="btn ghost" id="sCopy">📋 העתק</button>
          <button class="btn ghost" id="sDl">⬇️ הורד</button>
        </div>
      </div>
    </div>
    <div class="card"><h2>סיכומים קודמים</h2><div id="sumList"><div class="empty">טוען...</div></div></div>`;

  let period = { start: null, end: null, ai: false };

  async function doPreview(useAI) {
    $('#sSpin').classList.remove('hidden');
    try {
      const from = $('#sFrom').value || null;
      const to = $('#sTo').value || null;
      const prev = await api('/api/summaries/preview?' + new URLSearchParams(
        Object.fromEntries(Object.entries({ from, to }).filter(([, v]) => v))));
      period = { start: prev.period_start, end: prev.period_end, ai: false };
      let body = prev.body;
      if (useAI) {
        const r = await api('/api/summaries/draft', { method: 'POST', body: { from: prev.period_start, to: prev.period_end } });
        body = r.body;
        period.ai = r.ai;
      }
      $('#sBody').value = body;
      $('#sResult').classList.remove('hidden');
    } catch (e) { toast(e.message, true); }
    $('#sSpin').classList.add('hidden');
  }

  $('#sPreview').addEventListener('click', () => doPreview(false));
  const aiBtn = $('#sAI');
  if (aiBtn) aiBtn.addEventListener('click', () => doPreview(true));
  $('#sCopy').addEventListener('click', () => copyText($('#sBody').value));
  $('#sDl').addEventListener('click', () => download(`סיכום משמרת ${new Date().toISOString().slice(0, 10)}.md`, $('#sBody').value));
  const saveBtn = $('#sSave');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    try {
      await api('/api/summaries', { method: 'POST', body: { period_start: period.start, period_end: period.end, body: $('#sBody').value, ai_generated: period.ai } });
      toast('הסיכום נשמר'); loadSummaries();
    } catch (e) { toast(e.message, true); }
  });
  loadSummaries();
}

async function loadSummaries() {
  const rows = await api('/api/summaries');
  const el = $('#sumList');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<div class="empty">אין סיכומים שמורים</div>'; return; }
  el.innerHTML = rows.map(s => `
    <div class="hist-item" style="cursor:pointer" data-s="${s.id}">
      <b>${fmtDT(s.period_start)} → ${fmtDT(s.period_end)}</b>
      ${s.ai_generated ? '<span class="ai-tag">AI</span>' : ''}
      <div class="when">נשמר ${fmtDT(s.created_at)} ע"י ${esc(s.created_by_name || '')}</div>
    </div>`).join('');
  el.querySelectorAll('[data-s]').forEach(d => d.addEventListener('click', () => {
    const s = rows.find(x => x.id === +d.dataset.s);
    const m = modal(`<h2>סיכום משמרת</h2><p class="muted">${fmtDT(s.period_start)} → ${fmtDT(s.period_end)}</p>
      <div class="summary-box">${esc(s.body)}</div>
      <div class="btn-row"><button class="btn" id="sumCopy">📋 העתק</button>
      <button class="btn ghost" onclick="closeModal()">סגור</button></div>`, true);
    m.querySelector('#sumCopy').addEventListener('click', () => copyText(s.body));
  }));
}

/* ---------------- חיפוש ---------------- */
async function renderSearch() {
  const c = $('#content');
  c.innerHTML = `
    <div class="card">
      <h2>חיפוש במערכת</h2>
      <div class="row">
        <div class="field" style="flex:2"><label>מה לחפש?</label><input id="srchQ" placeholder="מילות חיפוש..."></div>
        <div class="field"><label>סוג פריט</label>
          <select id="srchType">
            <option value="">הכל</option>
            <option value="questions">שאלות ומענים</option>
            <option value="documents">מסמכים ותובנות</option>
            <option value="messages">מסרים</option>
            <option value="activities">פעילות</option>
            <option value="summaries">סיכומי משמרת</option>
            <option value="canned">בנק הודעות</option>
            <option value="materials">גלריה</option>
          </select></div>
        <button class="btn" id="srchGo">🔍 חפש</button>
      </div>
      <div id="srchResults" style="margin-top:14px"></div>
    </div>`;
  const go = async () => {
    const q = $('#srchQ').value.trim();
    if (!q) return;
    const t = $('#srchType').value;
    const rows = await api('/api/search?q=' + encodeURIComponent(q) + (t ? '&types=' + t : ''));
    const el = $('#srchResults');
    if (!rows.length) { el.innerHTML = '<div class="empty">לא נמצאו תוצאות</div>'; return; }
    const typeLabels = { question: 'שאלה', document: 'מסמך', message: 'מסר', activity: 'פעילות', summary: 'סיכום', canned: 'הודעה מוכנה', material: 'חומר הסברה' };
    el.innerHTML = rows.map((r, i) => `
      <div class="result-item" data-i="${i}">
        <span class="type-tag">${typeLabels[r.type]}</span>${esc(r.title)}
        <div class="muted">${esc(r.meta)}</div>
      </div>`).join('');
    el.querySelectorAll('[data-i]').forEach(d => d.addEventListener('click', () => {
      const r = rows[+d.dataset.i];
      if (r.type === 'question') openQuestion(r.id);
      else if (r.type === 'document') openDocument(r.id);
      else if (r.type === 'message') switchTab('messages');
      else if (r.type === 'activity') switchTab('activities');
      else if (r.type === 'summary') switchTab('summary');
      else if (r.type === 'canned') switchTab('canned');
      else if (r.type === 'material') switchTab('gallery');
    }));
  };
  $('#srchGo').addEventListener('click', go);
  $('#srchQ').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  $('#srchQ').focus();
}

/* ---------------- הגדרות ---------------- */
async function renderSettings() {
  const c = $('#content');
  let html = '<div class="grid2">';
  // נושאים ורשויות — admin/lead
  if (isLead()) {
    html += `
      <div class="card"><h2>נושאים</h2><div id="topicList"></div>
        <div class="row" style="margin-top:8px"><input id="newTopic" placeholder="נושא חדש">
        <button class="btn sm" id="addTopic">הוסף</button></div></div>
      <div class="card"><h2>רשויות / אזורים</h2><div id="authList"></div>
        <div class="row" style="margin-top:8px"><input id="newAuth" placeholder="רשות חדשה">
        <button class="btn sm" id="addAuth">הוסף</button></div></div>`;
  }
  if (isAdmin()) {
    html += `
      <div class="card"><h2>משתמשים והרשאות</h2><div id="userList"></div>
        <button class="btn sm" id="addUser" style="margin-top:8px">+ משתמש חדש</button></div>
      <div class="card"><h2>מצב מערכת</h2><div id="sysStatus"><div class="empty">טוען...</div></div></div>`;
  }
  html += '</div>';
  if (!isLead()) html = '<div class="card"><p class="muted">אין לך הרשאות לניהול הגדרות. פנה למנהל המערכת.</p></div>';
  c.innerHTML = html;

  if (isLead()) {
    loadListMgr('topics', '#topicList', '#newTopic', '#addTopic');
    loadListMgr('authorities', '#authList', '#newAuth', '#addAuth');
  }
  if (isAdmin()) { loadUsers(); loadSysStatus(); }
}

async function loadListMgr(resource, listSel, inputSel, btnSel) {
  const rows = await api('/api/' + resource);
  const el = $(listSel);
  el.innerHTML = rows.map(r =>
    `<div class="hist-item row" style="justify-content:space-between">${esc(r.name)}
     <button class="btn sm danger" data-del="${r.id}">✕</button></div>`).join('') || '<div class="empty">ריק</div>';
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('למחוק?')) return;
    await api(`/api/${resource}/${b.dataset.del}`, { method: 'DELETE' });
    META = await api('/api/meta');
    loadListMgr(resource, listSel, inputSel, btnSel);
  }));
  const btn = $(btnSel);
  const newBtn = btn.cloneNode(true);
  btn.replaceWith(newBtn);
  newBtn.addEventListener('click', async () => {
    const name = $(inputSel).value.trim();
    if (!name) return;
    try {
      await api('/api/' + resource, { method: 'POST', body: { name } });
      $(inputSel).value = '';
      META = await api('/api/meta');
      loadListMgr(resource, listSel, inputSel, btnSel);
    } catch (e) { toast(e.message, true); }
  });
}

const ROLE_LABELS = { admin: 'מנהל מערכת', lead: 'אחראי תא הסברה', user: 'משתמש רגיל', viewer: 'צפייה בלבד' };

async function loadUsers() {
  const rows = await api('/api/users');
  const el = $('#userList');
  el.innerHTML = rows.map(u => `
    <div class="hist-item row" style="justify-content:space-between">
      <span>${esc(u.name)} <span class="muted">(${esc(u.username)})</span>
        ${chip(ROLE_LABELS[u.role], 'urg-רגיל')} ${u.active ? '' : '<span class="chip st-לא-פעיל">מושבת</span>'}</span>
      <button class="btn sm ghost" data-edit="${u.id}">ערוך</button>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
    userForm(rows.find(x => x.id === +b.dataset.edit))));
  const addBtn = $('#addUser');
  const newBtn = addBtn.cloneNode(true);
  addBtn.replaceWith(newBtn);
  newBtn.addEventListener('click', () => userForm());
}

function userForm(u = null) {
  const isEdit = !!u;
  const m = modal(`
    <h2>${isEdit ? 'עריכת משתמש' : 'משתמש חדש'}</h2>
    <div class="field"><label>שם מלא</label><input id="uName" value="${esc(u ? u.name : '')}"></div>
    ${!isEdit ? '<div class="field"><label>שם משתמש</label><input id="uUsername"></div>' : ''}
    <div class="field"><label>תפקיד</label><select id="uRole">
      ${Object.entries(ROLE_LABELS).map(([k, v]) => `<option value="${k}" ${u && u.role === k ? 'selected' : ''}>${v}</option>`).join('')}
    </select></div>
    <div class="field"><label>${isEdit ? 'סיסמה חדשה (ריק = ללא שינוי)' : 'סיסמה (לפחות 8 תווים)'}</label>
      <input type="password" id="uPass"></div>
    ${isEdit ? `<div class="field"><label><input type="checkbox" id="uActive" ${u.active ? 'checked' : ''}> פעיל</label></div>` : ''}
    <div class="btn-row"><button class="btn" id="uSave">שמור</button>
    <button class="btn ghost" onclick="closeModal()">ביטול</button></div>`);
  m.querySelector('#uSave').addEventListener('click', async () => {
    try {
      if (isEdit) {
        const body = { name: m.querySelector('#uName').value.trim(), role: m.querySelector('#uRole').value, active: m.querySelector('#uActive').checked ? 1 : 0 };
        const p = m.querySelector('#uPass').value;
        if (p) body.password = p;
        await api('/api/users/' + u.id, { method: 'PUT', body });
      } else {
        await api('/api/users', { method: 'POST', body: {
          name: m.querySelector('#uName').value.trim(),
          username: m.querySelector('#uUsername').value.trim(),
          role: m.querySelector('#uRole').value,
          password: m.querySelector('#uPass').value,
        } });
      }
      closeModal(); toast('נשמר'); loadUsers();
    } catch (e) { toast(e.message, true); }
  });
}

async function loadSysStatus() {
  try {
    const s = await api('/api/settings/status');
    $('#sysStatus').innerHTML = `
      <div class="hist-item">🤖 AI (Claude): ${s.ai_enabled
        ? `<b style="color:var(--ok)">פעיל</b> · מודל: ${esc(s.model)} · מפתח: <code style="font-size:12px">${esc(s.key_masked || '')}</code> (${s.key_source === 'settings' ? 'מההגדרות' : 'ממשתנה סביבה'})`
        : '<b style="color:var(--err)">לא מוגדר</b>'}</div>
      <div class="field" style="margin-top:6px"><label>מפתח Anthropic API (נשמר במערכת; ריק = מחיקה)</label>
        <div class="row"><input id="apiKeyInput" type="password" placeholder="sk-ant-..." style="flex:2">
        <button class="btn sm" id="apiKeySave">שמור מפתח</button></div>
        <span class="muted">ניתן ליצור מפתח ב-console.anthropic.com. המפתח מפעיל: תובנות ממסמכים, ניסוח הודעות וסיכום נרטיבי.</span></div>
      <div class="hist-item">📱 שליחת וואטסאפ (מענה חוזר לפונה): ${s.wa_send_enabled
        ? `<b style="color:var(--ok)">מחובר</b> · Instance: <code style="font-size:12px">${esc(s.greenapi_instance || '')}</code>`
        : '<b style="color:var(--err)">לא מחובר</b>'}</div>
      <div class="field" style="margin-top:6px"><label>חיבור Green API (מהלוח ב-green-api.com)</label>
        <div class="row">
          <input id="gaInstance" placeholder="idInstance" style="flex:1">
          <input id="gaToken" type="password" placeholder="apiTokenInstance" style="flex:2">
          <button class="btn sm" id="gaSave">שמור חיבור</button>
        </div>
        <span class="muted">מאפשר לשלוח מענה מאושר חזרה לפונה בלחיצה. השאר ריק ושמור — לניתוק.</span></div>
      <div class="hist-item">📥 Webhook קליטת וואטסאפ: ${s.webhook_configured ? '<b style="color:var(--ok)">מוגדר</b>' : '<b style="color:var(--err)">לא מוגדר</b> — הגדר WHATSAPP_WEBHOOK_TOKEN'}</div>
      ${s.webhook_url ? `<div class="hist-item" style="word-break:break-all"><span class="muted">כתובת ל-Twilio (מספר ייעודי רשמי):</span><br><code style="font-size:12px">${esc(s.webhook_url)}</code>
        <button class="btn sm ghost" id="whCopy">📋</button></div>` : ''}
      ${s.greenapi_url ? `<div class="hist-item" style="word-break:break-all"><span class="muted">כתובת ל-Green API (בוט בקבוצה + מספר ייעודי):</span><br><code style="font-size:12px">${esc(s.greenapi_url)}</code>
        <button class="btn sm ghost" id="gaCopy">📋</button></div>` : ''}
      <div class="hist-item">🌐 סביבה: ${s.is_prod ? 'פרודקשן (Render)' : 'פיתוח מקומי'}</div>
      <div class="hist-item">📦 גיבוי: <a class="btn sm" href="/api/backup">הורד גיבוי מלא (ZIP)</a>
        <span class="muted">כולל את כל הנתונים והקבצים. מומלץ אחת לשבוע — שמור בדרייב/מחשב.</span></div>`;
    const wc = $('#whCopy');
    if (wc) wc.addEventListener('click', () => copyText(s.webhook_url));
    const gc = $('#gaCopy');
    if (gc) gc.addEventListener('click', () => copyText(s.greenapi_url));
    $('#gaSave').addEventListener('click', async () => {
      const instance_id = $('#gaInstance').value.trim();
      const token = $('#gaToken').value.trim();
      if ((!instance_id || !token) && !confirm('לא הוזנו פרטים מלאים — לנתק את חיבור השליחה?')) return;
      try {
        const r = await api('/api/settings/greenapi', { method: 'POST', body: { instance_id, token } });
        toast(r.wa_send_enabled ? '📱 חיבור הוואטסאפ נשמר — שליחת מענה חוזר פעילה' : 'החיבור נותק');
        META = await api('/api/meta');
        loadSysStatus();
      } catch (e) { toast(e.message, true); }
    });
    $('#apiKeySave').addEventListener('click', async () => {
      const key = $('#apiKeyInput').value.trim();
      if (!key && !confirm('לא הוזן מפתח — למחוק את המפתח השמור?')) return;
      try {
        const r = await api('/api/settings/api-key', { method: 'POST', body: { key } });
        toast(r.ai_enabled ? '🤖 המפתח נשמר — יכולות ה-AI פעילות' : 'המפתח נמחק — המערכת במצב ידני');
        META = await api('/api/meta');
        loadSysStatus();
      } catch (e) { toast(e.message, true); }
    });
  } catch (e) { $('#sysStatus').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

/* ---------------- אתחול ---------------- */
boot();
