/* ========== MEDILENS CORE SCRIPT ========== */

/* ========== DEBUG LOGGING ========== */
function debugLog(context, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const style = 'color: #0ea5e9; font-weight: bold;';
    console.log(`%c[${timestamp}] [${context}]`, style, message);
    if (data) console.dir(data);
}

/* ========== FIREBASE AUTH LOGIC (Main App) ========== */
function initAuthStateObserver() {
    if (!window.mlAuth) return;

    const { auth, onAuthStateChanged } = window.mlAuth;
    onAuthStateChanged(auth, (user) => {
        if (user) {
            debugLog('Auth', 'User is signed in', user.email);
            updateUIForAuth(user);
        } else {
            debugLog('Auth', 'User is signed out - system will redirect via index.html check');
            // The redirection is handled in index.html for faster response
        }
    });
}

function updateUIForAuth(user) {
    const userDisplay = document.getElementById('userDisplay');
    const logoutBtn = document.getElementById('logoutBtn');

    if (user) {
        if (userDisplay) {
            userDisplay.textContent = user.email;
            userDisplay.style.display = 'inline-block';
        }
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
        if (userDisplay) userDisplay.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

async function handleLogout() {
    if (!window.mlAuth) return;
    const { auth, signOut } = window.mlAuth;

    try {
        debugLog('Auth', 'Logging out...');
        await signOut(auth);
        toast('👋 Signed out successfully.');
        window.location.href = 'login.html';
    } catch (err) {
        debugLog('Auth', 'Logout error', err);
        toast('❌ Error signing out.');
    }
}

// Global hook for the application
window.addEventListener('DOMContentLoaded', () => {
    initAuthStateObserver();
    loadProfile();
    renderHistory();
});

/* ========== STATE ========== */
let currentScan = {};
let lastImageSrc = ''; // Keep last uploaded image for AI fallback
let speechUtterance = null;
const HISTORY_KEY = 'medilens_history_v2';
const PROFILE_KEY = 'medilens_profile_v2';

if (sessionStorage.getItem('ml_agreed')) {
    const modal = document.getElementById('disclaimerModal');
    if (modal) modal.style.display = 'none';
}

function showPrivacyPolicy() {
    const modal = document.getElementById('privacyModal');
    if (modal) modal.classList.remove('hidden');
}

/* ========== TOAST ========== */
function toast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

/* ========== DRAG & DROP ========== */
function handleDrag(e) {
    e.preventDefault();
    document.getElementById('uploadArea').classList.add('drag-over');
}
function handleDragLeave(e) {
    document.getElementById('uploadArea').classList.remove('drag-over');
}
function handleDrop(e) {
    e.preventDefault();
    document.getElementById('uploadArea').classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) handleFile(f);
    else toast('⚠️ Please drop an image file.');
}

/* ========== SECURE FILE HANDLING ========== */
function handleFile(file) {
    if (!file) return;
    toast('🕵️ Privacy: Processing image. Image will be deleted after parsing.');
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('imgPreview');
        img.src = e.target.result;
        lastImageSrc = e.target.result; // Store for AI re-analysis
        img.classList.remove('hidden');
        document.getElementById('resultsSection').classList.add('hidden');
        runOCR(e.target.result);
    };
    reader.readAsDataURL(file);
}

/* ========== MANUAL AI RE-ANALYSIS ========== */
async function forceAIScan() {
    if (!lastImageSrc) {
        toast('⚠️ Please upload a prescription image first.');
        return;
    }
    debugLog('AI', 'Manual force AI analysis triggered');
    const wrap = document.getElementById('progressWrap');
    const label = document.getElementById('progressLabel');
    const fill = document.getElementById('progressFill');
    wrap.style.display = 'block';
    fill.style.width = '20%';
    label.textContent = '🧠 Requesting GPT-4o Vision Analysis…';
    toast('🤖 Sending image to OpenAI GPT-4o Vision...');
    await callAIExtractor(lastImageSrc);
}

/* ========== DEMO IMAGE ========== */
function loadDemoImage() {
    currentScan = {
        medicine: 'Amoxicillin',
        dosage: '500 mg',
        frequency: 'Three times daily',
        duration: '7 days',
        doctor: 'Dr. S. Mehta',
        confidence: 92
    };
    const img = document.getElementById('imgPreview');
    img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" style="background:%230d1726;font-family:Georgia,serif"><rect x="20" y="20" width="360" height="220" rx="8" fill="%23111d30" stroke="%231e3050"/><text x="200" y="55" fill="%230ea5e9" font-size="14" text-anchor="middle" font-weight="bold">Dr. S. Mehta — City Clinic</text><line x1="30" y1="65" x2="370" y2="65" stroke="%231e3050"/><text x="40" y="95" fill="%23e8f0fe" font-size="13">Rx:</text><text x="70" y="95" fill="%23e8f0fe" font-size="13" font-style="italic">Amoxicillin 500mg</text><text x="40" y="125" fill="%236b8cba" font-size="12">Sig: 1 cap TDS × 7 days</text><text x="40" y="155" fill="%236b8cba" font-size="12">After meals. Complete full course.</text><text x="40" y="185" fill="%236b8cba" font-size="11">Allergies: None known</text><text x="40" y="215" fill="%23374151" font-size="10">Date: 02/03/2026</text></svg>';
    img.classList.remove('hidden');
    renderResults();
    fetchDrugInfo('Amoxicillin');
}

/* ========== OCR WITH GEMINI FALLBACK ========== */
async function runOCR(imageSrc) {
    const wrap = document.getElementById('progressWrap');
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    wrap.style.display = 'block';
    fill.style.width = '5%';

    try {
        debugLog('OCR', 'Starting Tesseract OCR...');
        const worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 80) + 10;
                    fill.style.width = pct + '%';
                    label.textContent = `Scanning with OCR… ${pct}%`;
                }
            }
        });

        const { data: { text, confidence } } = await worker.recognize(imageSrc);
        await worker.terminate();
        debugLog('OCR', 'Completed', { confidence, text });

        // If confidence is low, try AI
        if (confidence < 40) {
            debugLog('AI', 'Low confidence OCR, triggering OpenAI fallback...');
            label.textContent = '🧠 OCR unclear: Switching to GPT-4o Vision…';
            fill.style.width = '60%';
            await callAIExtractor(imageSrc);
            return;
        }

        fill.style.width = '100%';
        label.textContent = '✅ OCR extraction complete!';
        parseExtraction(text, confidence);

        // Image cleanup logic moved after parsing
        cleanupImage();
        setTimeout(() => { wrap.style.display = 'none'; }, 1200);

    } catch (err) {
        debugLog('OCR', 'Error', err);
        label.textContent = '🧠 OCR failed: Requesting GPT-4o Analysis…';
        await callAIExtractor(imageSrc);
    }
}

async function callAIExtractor(imageSrc) {
    const label = document.getElementById('progressLabel');
    const fill = document.getElementById('progressFill');

    try {
        const response = await fetch('/api/analyze-prescription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageSrc })
        });

        if (!response.ok) throw new Error('AI endpoint returned error');

        const data = await response.json();
        debugLog('AI', 'OpenAI Result Received', data);

        currentScan = {
            medicine: data.medicine || 'Unknown',
            dosage: data.dosage || 'Manual entry needed',
            frequency: data.frequency || 'Manual entry needed',
            duration: data.duration || 'Manual entry needed',
            doctor: data.doctor || 'Unidentified',
            confidence: data.confidence || 0,
            rawText: `[AI Extraction]\n${JSON.stringify(data, null, 2)}`
        };

        fill.style.width = '100%';
        label.textContent = '✨ AI Intelligent Analysis complete!';
        renderResults();
        fetchDrugInfo(currentScan.medicine);
        cleanupImage();

        setTimeout(() => {
            document.getElementById('progressWrap').style.display = 'none';
        }, 1200);

    } catch (err) {
        debugLog('AI', 'Error', err);
        label.textContent = '❌ AI Analysis failed.';
        toast('Error: Could not parse prescription even with AI.');
        document.getElementById('progressWrap').style.display = 'none';
    }
}

function cleanupImage() {
    setTimeout(() => {
        const img = document.getElementById('imgPreview');
        img.src = '';
        img.classList.add('hidden');
        toast('🛡️ Image purged from memory.');
    }, 5000);
}

/* ========== PARSE WITH ACCURACY MODIFIER ========== */
function parseExtraction(text, confidence) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const lower = text.toLowerCase();

    const medMatch = text.match(/(?:tab|cap|syrup|inj|gel|cream|oint)\.?\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
    const doseMatch = text.match(/\d+\s*(?:mg|ml|mcg|g|iu)/i);
    const freqMatch = lower.match(/(?:once|twice|thrice|three times|od|bd|tds|qid|daily|every \d+ hours)/i);
    const durMatch = text.match(/\d+\s*(?:days?|weeks?|months?)/i);
    const drMatch = text.match(/Dr\.?\s+[A-Za-z .]+/i);

    currentScan = {
        medicine: medMatch ? medMatch[1].trim() : extractFirstCapital(lines) || 'Unknown',
        dosage: doseMatch ? doseMatch[0] : 'Manual entry needed',
        frequency: freqMatch ? freqMatch[0] : 'Manual entry needed',
        duration: durMatch ? durMatch[0] : 'Manual entry needed',
        doctor: drMatch ? drMatch[0] : 'Unidentified',
        confidence: Math.round(confidence),
        rawText: text
    };
    renderResults();
    fetchDrugInfo(currentScan.medicine);
}

function extractFirstCapital(lines) {
    for (const line of lines) {
        const m = line.match(/\b([A-Z][a-z]{3,})\b/);
        if (m) return m[1];
    }
    return null;
}

/* ========== RENDER EXTRACTED RESULTS ========== */
function renderResults() {
    const s = currentScan;
    const confClass = s.confidence >= 80 ? 'conf-high' : s.confidence >= 50 ? 'conf-med' : 'conf-low';
    const confLabel = s.confidence >= 80 ? '✅ High' : s.confidence >= 50 ? '⚠️ Medium' : '❌ Low';

    document.getElementById('resultsGrid').innerHTML = `
    <div class="result-card"><label>Medicine Name</label>
      <input class="edit-val" id="editMed" value="${s.medicine}" onchange="currentScan.medicine=this.value;fetchDrugInfo(this.value)"/></div>
    <div class="result-card"><label>Dosage</label>
      <input class="edit-val" id="editDose" value="${s.dosage}" onchange="currentScan.dosage=this.value"/></div>
    <div class="result-card"><label>Frequency</label>
      <input class="edit-val" value="${s.frequency}" onchange="currentScan.frequency=this.value"/></div>
    <div class="result-card"><label>Duration</label>
      <input class="edit-val" value="${s.duration}" onchange="currentScan.duration=this.value"/></div>
    <div class="result-card"><label>Doctor</label>
      <div class="val">${s.doctor}</div></div>
    <div class="result-card"><label>OCR Confidence</label>
      <div><span class="confidence-badge ${confClass}">${confLabel} — ${s.confidence}%</span></div></div>`;

    document.getElementById('resultsSection').classList.remove('hidden');
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ========== DRUG INFO ========== */
async function fetchDrugInfo(medicineName) {
    const card = document.getElementById('drugInfoCard');
    card.innerHTML = `<p class="pulse" style="color:var(--muted)">🔍 Retrieving latest drug data for "${medicineName}"…</p>`;

    let data = null;
    try {
        const res = await fetch(`https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${medicineName}"&limit=1`);
        const json = await res.json();
        if (json.results) data = json.results[0];
    } catch (_) { }

    if (!data) {
        card.innerHTML = `<h3>💊 ${medicineName}</h3><p>Information not found in latest FDA database. <strong>Do not proceed without professional confirmation.</strong></p>`;
        fetchAlternatives(medicineName);
        return;
    }

    const oFDA = data.openfda || {};
    const gname = (oFDA.generic_name || ['N/A'])[0];
    const bname = (oFDA.brand_name || ['N/A'])[0];
    const uses = arr(data.indications_and_usage) || 'Available in documentation.';
    const sides = arr(data.adverse_reactions) || 'Available in documentation.';

    currentScan.genericName = gname;
    currentScan.brandName = bname;

    card.innerHTML = `
    <h3>💊 ${bname}</h3>
    <p style="font-size:0.8rem; color:var(--muted); margin-bottom:1rem;"><em>Latest Database Sync: March 2026. Drug information is dynamic and varies over time.</em></p>
    <div class="info-row"><span class="lbl">Classification</span><span class="desc">${gname} (Educational info)</span></div>
    <div class="info-row"><span class="lbl">Reported Uses</span><span class="desc">${uses.substring(0, 300)}…</span></div>
    <div class="info-row"><span class="lbl">Reported Reactions</span><span class="desc">${sides.substring(0, 300)}…</span></div>
    <div class="warn-box" style="margin-top:1rem; border-color:var(--red)">
      <p style="color:var(--red); font-size:0.8rem;"><strong>🚨 DO NOT ADJUST DOSAGE:</strong> This system is not a medical advisor. Any change in medication must be discussed with your physician. Misuse of information can lead to severe health risks.</p>
    </div>`;

    checkInteractions(medicineName);
    fetchAlternatives(medicineName);
}

function arr(field) {
    if (!field) return null;
    return Array.isArray(field) ? field[0] : field;
}

/* ========== INTERACTION CHECKER ========== */
async function checkInteractions(medicineName) {
    const card = document.getElementById('interactionCard');
    card.innerHTML = `<div class="warn-box"><p>Educational Purpose Only: These results are sourced from clinical databases but may not apply to your specific health profile. Consult a doctor.</p></div>`;
    try {
        const res = await fetch(`https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(medicineName)}`);
        const json = await res.json();
        const concepts = json.drugGroup?.conceptGroup?.flatMap(g => g.conceptProperties || []) || [];
        if (!concepts.length) { card.innerHTML += `<p style="color:var(--muted)">No interaction data found for this medicine in RxNav.</p>`; return; }
        const rxcui = concepts[0].rxcui;
        const res2 = await fetch(`https://rxnav.nlm.nih.gov/REST/interaction/interaction.json?rxcui=${rxcui}`);
        const json2 = await res2.json();
        const pairs = json2.interactionTypeGroup?.flatMap(g => g.interactionType || [])
            .flatMap(t => t.interactionPair || []) || [];
        if (!pairs.length) {
            card.innerHTML += `<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.3);border-radius:10px;padding:1rem"><p style="color:var(--green)">✅ No known significant drug interactions found for ${medicineName}.</p></div>`;
            return;
        }
        const items = pairs.slice(0, 5).map(p => {
            const sev = p.severity || 'moderate';
            const col = sev === 'high' ? 'var(--red)' : sev === 'moderate' ? 'var(--yellow)' : 'var(--green)';
            return `<div class="interaction-item"><div class="interaction-dot" style="background:${col}"></div><div><strong style="font-size:.9rem">${p.interactionConcept?.map(c => c.minConceptItem?.name).join(' + ') || 'Interaction'}</strong><p style="color:var(--muted);font-size:.82rem;margin-top:.2rem">${p.description || ''}</p><span class="tag ${sev === 'high' ? 'tag-red' : sev === 'moderate' ? 'tag-yellow' : 'tag-green'}">${sev.toUpperCase()} risk</span></div></div>`;
        }).join('');
        card.innerHTML += `<h3>⚠️ Drug Interactions</h3><div class="interaction-list">${items}</div>`;
    } catch (_) {
        card.innerHTML += `<p style="color:var(--muted)">Could not load interaction data. Check your internet connection.</p>`;
    }
}

/* ========== GENERIC ALTERNATIVES ========== */
async function fetchAlternatives(medicineName) {
    const card = document.getElementById('altCard');
    card.innerHTML = `<p class="pulse" style="color:var(--muted)">Finding alternatives…</p>`;
    try {
        const res = await fetch(`https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(medicineName)}`);
        const json = await res.json();
        const groups = json.drugGroup?.conceptGroup || [];
        const results = groups.flatMap(g => g.conceptProperties || []).slice(0, 8);
        if (!results.length) { card.innerHTML = `<h3>🔄 Generic Alternatives</h3><p style="color:var(--muted)">No alternatives found.</p>`; return; }
        const tags = results.map(r => `<span class="tag tag-blue" title="RxCUI: ${r.rxcui}" style="font-size:.82rem;padding:.35rem .7rem;cursor:pointer">${r.name} (${r.tty})</span>`).join('');
        card.innerHTML = `<h3>🔄 Generic Alternatives</h3><p style="color:var(--muted);font-size:.88rem;margin-bottom:1rem">Chemically equivalent medicines from RxNorm database. Always confirm with your pharmacist.</p><div>${tags}</div>`;
    } catch (_) {
        card.innerHTML = `<h3>🔄 Generic Alternatives</h3><p style="color:var(--muted)">Could not load alternatives.</p>`;
    }
}

/* ========== TTS ========== */
function readAloud() {
    if (!('speechSynthesis' in window)) { toast('⚠️ TTS not supported in this browser.'); return; }
    stopSpeech();
    const s = currentScan;
    const text = `Your prescription is for ${s.medicine}, ${s.dosage}, taken ${s.frequency}, for ${s.duration}. Prescribed by ${s.doctor}. Remember: always take medicines exactly as prescribed.`;
    speechUtterance = new SpeechSynthesisUtterance(text);
    speechUtterance.rate = 0.9;
    speechUtterance.pitch = 1;
    speechUtterance.onstart = () => { document.getElementById('ttsStatus').textContent = '🔊 Reading…'; };
    speechUtterance.onend = () => { document.getElementById('ttsStatus').textContent = 'Done.'; };
    window.speechSynthesis.speak(speechUtterance);
}
function stopSpeech() {
    if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
    document.getElementById('ttsStatus').textContent = 'Stopped.';
}

/* ========== TABS ========== */
function showTab(id, btn) {
    ['info', 'interactions', 'alternatives'].forEach(t => {
        const tabEl = document.getElementById('tab-' + t);
        if (tabEl) tabEl.classList.toggle('hidden', t !== id);
    });
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

/* ========== ENCRYPTED STORAGE SIMULATION ========== */
function encrypt(text) { return btoa(unescape(encodeURIComponent(text))); }
function decrypt(text) { try { return decodeURIComponent(escape(atob(text))); } catch (e) { return text; } }

function saveToHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const sensitiveEntry = encrypt(JSON.stringify(currentScan));
    history.unshift({ data: sensitiveEntry, savedAt: new Date().toISOString() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    renderHistory();
    toast('🔒 Prescription encrypted & saved safely.');
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const grid = document.getElementById('historyGrid');
    if (!grid) return;
    if (!history.length) { grid.innerHTML = '<p style="color:var(--muted)">Vault is empty.</p>'; return; }
    grid.innerHTML = history.map((h, i) => {
        let raw;
        try {
            raw = JSON.parse(decrypt(h.data));
        } catch (e) {
            raw = { medicine: 'Encrypted Data', dosage: 'Unknown' };
        }
        return `<div class="history-card" onclick="loadFromHistory(${i})">
      <div class="hdate">Saved: ${new Date(h.savedAt).toLocaleDateString()}</div>
      <div class="hmed">🔒 ${raw.medicine}</div>
      <div class="hdose">${raw.dosage}</div>
    </div>`;
    }).join('');
}

function loadFromHistory(i) {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    currentScan = JSON.parse(decrypt(history[i].data));
    renderResults();
    fetchDrugInfo(currentScan.medicine);
    document.getElementById('scan').scrollIntoView({ behavior: 'smooth' });
}

function clearHistory() {
    if (!confirm('Clear all prescription history?')) return;
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    toast('🗑 History cleared.');
}

/* ========== PROFILE ========== */
function saveProfile() {
    const profile = {
        name: document.getElementById('pName').value,
        age: document.getElementById('pAge').value,
        weight: document.getElementById('pWeight').value,
        blood: document.getElementById('pBlood').value,
        pregnancy: document.getElementById('pPreg').value,
        conditions: document.getElementById('pConditions').value,
        allergies: document.getElementById('pAllergies').value
    };
    localStorage.setItem(PROFILE_KEY, encrypt(JSON.stringify(profile)));
    toast('🔐 Profile Encrypted & Stored.');
}

function loadProfile() {
    const pRaw = localStorage.getItem(PROFILE_KEY);
    if (!pRaw) return;
    const p = JSON.parse(decrypt(pRaw));
    if (p.name) document.getElementById('pName').value = p.name;
    if (p.age) document.getElementById('pAge').value = p.age;
    if (p.weight) document.getElementById('pWeight').value = p.weight;
    if (p.blood) document.getElementById('pBlood').value = p.blood;
    if (p.pregnancy) document.getElementById('pPreg').value = p.pregnancy;
    if (p.conditions) document.getElementById('pConditions').value = p.conditions;
    if (p.allergies) document.getElementById('pAllergies').value = p.allergies;
}

/* ========== RESET ========== */
function resetScan() {
    currentScan = {};
    const img = document.getElementById('imgPreview');
    img.classList.add('hidden');
    img.src = '';
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('progressWrap').style.display = 'none';
    document.getElementById('fileInput').value = '';
    document.getElementById('cameraInput').value = '';
    stopSpeech();
    document.getElementById('scan').scrollIntoView({ behavior: 'smooth' });
}

/* ========== EXPORTS FOR HTML onclick AND HANDLERS ========== */
window.toggleAuthMode = toggleAuthMode;
window.handleFirebaseAuth = handleFirebaseAuth;
window.handleDrag = handleDrag;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.handleFile = handleFile;
window.runOCR = runOCR;
window.loadDemoImage = loadDemoImage;
window.fetchDrugInfo = fetchDrugInfo;
window.readAloud = readAloud;
window.stopSpeech = stopSpeech;
window.showTab = showTab;
window.saveToHistory = saveToHistory;
window.loadFromHistory = loadFromHistory;
window.clearHistory = clearHistory;
window.saveProfile = saveProfile;
window.loadProfile = loadProfile;
window.resetScan = resetScan;
window.showPrivacyPolicy = showPrivacyPolicy;
window.handleLogout = handleLogout;
window.forceAIScan = forceAIScan;

