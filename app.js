import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const EXCLUSIVE_ADMIN_EMAIL = "raiyuri.freefire@gmail.com";
const AVAILABLE_GENRES = ["Ação","Aventura","Comédia","Drama","Terror","Suspense","Romance","Ficção Científica","Fantasia","Animação","Documentário","Musical","Guerra","Mistério","Crime","Família","Histórico","Faroeste"];
const FIREBASE_RTDB_FREE_LIMIT_BYTES = 1073741824;
const CONTINUE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

const firebaseConfig = {
    apiKey: "AIzaSyCGD9DZDFp0w9baW8jiqgGGfkasAvqreY0",
    authDomain: "site-ec6fd.firebaseapp.com",
    databaseURL: "https://site-ec6fd-default-rtdb.firebaseio.com",
    projectId: "site-ec6fd",
    storageBucket: "site-ec6fd.firebasestorage.app",
    messagingSenderId: "338689686380",
    appId: "1:338689686380:web:509aebb8d64694a0e1d149"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const rtdb = getDatabase(app);

let mediaCatalog = [];
let activeItem = null;
let seasonsBuilder = [];
let selectedCategory = "Todos";
let isSignUpMode = false;
let selectedGenres = [];
let cropperInstance = null;
let currentTargetPreview = null;
let previousModal = null;
let controlsHideTimer = null;
let cursorHideTimer = null;
let isAdmin = false;
let suggestionsSelectMode = false;
let selectedSuggestionIds = new Set();
let allSuggestions = [];
let authProcessing = false;
let currentUserUid = null;
let currentVideoUrl = '';

// Audio Booster
let audioCtx = null;
let audioGainNode = null;
let boostedElements = new WeakSet();
let audioBoostLevel = 100;
let overlayCleanerInterval = null;

// ========== TV ==========
function isTVDevice() { return /smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(navigator.userAgent.toLowerCase()); }
function isTV() { return isTVDevice() || (window.innerWidth >= 1920 && !('ontouchstart' in window)); }
function setupTVMode() {
    if (isTV()) document.body.classList.add('tv-mode');
    window.addEventListener('resize', () => {
        if (isTV()) document.body.classList.add('tv-mode');
        else document.body.classList.remove('tv-mode');
    });
}
setupTVMode();

// ========== HELPERS ==========
function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); document.body.classList.add('modal-open'); } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); document.body.classList.remove('modal-open'); } }
function normalizeText(t) { if (!t) return ''; return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
function getPosterUrl(i) { return i.coverUrl || i.backdropUrl || ''; }
function getBackdropUrl(i) { return i.backdropUrl || i.coverUrl || ''; }
function getItemGenres(i) { if (Array.isArray(i.genres) && i.genres.length > 0) return i.genres; if (i.category) return [i.category]; return []; }
function itemMatchesCategory(i, c) { if (c === "Todos") return true; if (c === "Filmes") return i.type === "movie"; if (c === "Séries") return i.type === "serie"; return getItemGenres(i).includes(c); }
function showMsg(text, type) { const m = document.getElementById('msg'); if (!m) return; m.innerText = text; m.className = type === 'success' ? 'msg-success' : 'msg-error'; m.classList.remove('hidden'); setTimeout(() => m.classList.add('hidden'), 4000); }
function formatVideoUrl(u) {
    if (!u) return '';
    let f = u.trim();
    if (f.includes('mixdrop.')) {
        if (f.includes('/f/')) f = f.replace('/f/', '/e/');
        else if (!f.includes('/e/')) {
            const m = f.match(/(?:mixdrop\.[a-z]+)\/(?:e\/|f\/)?([a-zA-Z0-9]+)/);
            if (m && m[1]) f = `https://mixdrop.ag/e/${m[1]}`;
        }
    }
    return f;
}
function isValidImageUrl(url) {
    if (!url) return false;
    if (url.includes(window.location.origin)) return false;
    return url.startsWith('http') || url.startsWith('data:image');
}
function formatBytes(b) { if (b === 0) return '0 B'; const k = 1024; const s = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i]; }
function estimateJsonBytes(obj) { try { return new Blob([JSON.stringify(obj)]).size; } catch { return JSON.stringify(obj).length * 2; } }
function translateAuthError(c) { const e = { 'auth/email-already-in-use': 'E-mail já cadastrado!', 'auth/invalid-email': 'E-mail inválido.', 'auth/weak-password': 'Senha fraca (mín 6).', 'auth/user-not-found': 'Conta não encontrada.', 'auth/wrong-password': 'Senha incorreta.', 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/too-many-requests': 'Muitas tentativas.', 'auth/network-request-failed': 'Sem internet.' }; return e[c] || `Erro: ${c}`; }
function timeAgo(ts) { const d = Date.now() - ts; const min = Math.floor(d / 60000); if (min < 1) return 'agora'; if (min < 60) return `${min}m`; const h = Math.floor(min / 60); if (h < 24) return `${h}h`; const days = Math.floor(h / 24); return `${days}d`; }

// ========== CACHE ==========
function getUserCacheKey(key) { if (!currentUserUid) return null; return `mfx_${currentUserUid}_${key}`; }
function setUserCache(key, value) { const k = getUserCacheKey(key); if (k && value) localStorage.setItem(k, value); }
function getUserCache(key) { const k = getUserCacheKey(key); if (!k) return null; return localStorage.getItem(k); }
function clearLegacyCache() { ['masterflix_user_name', 'masterflix_user_bio', 'masterflix_user_fav_genre', 'masterflix_user_avatar', 'masterflix_user_banner'].forEach(k => localStorage.removeItem(k)); }
function applyUserTheme(c) { if (!c || isTVDevice()) return; document.documentElement.style.setProperty('--primary-color', c); localStorage.setItem('masterflix_theme_color', c); if (currentUserUid) setUserCache('theme_color', c); }
if (!isTVDevice()) { const sc = localStorage.getItem('masterflix_theme_color'); if (sc) document.documentElement.style.setProperty('--primary-color', sc); }
window.onscroll = () => { const h = document.getElementById('mainHeader'); if (h) { if (window.scrollY > 50) h.classList.add('scrolled'); else h.classList.remove('scrolled'); } };

// ========== SIDEBAR & EVENTS SETUP ==========
function openSidebar() { document.getElementById('sidebarMenu')?.classList.add('active'); document.getElementById('sidebarOverlay')?.classList.add('active'); document.getElementById('menuToggleBtn')?.classList.add('active'); document.body.classList.add('modal-open'); }
function closeSidebar() { document.getElementById('sidebarMenu')?.classList.remove('active'); document.getElementById('sidebarOverlay')?.classList.remove('active'); document.getElementById('menuToggleBtn')?.classList.remove('active'); document.body.classList.remove('modal-open'); }

const menuBtn = document.getElementById('menuToggleBtn');
if (menuBtn) menuBtn.onclick = () => { if (document.getElementById('sidebarMenu')?.classList.contains('active')) closeSidebar(); else openSidebar(); };
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn'); if (sidebarCloseBtn) sidebarCloseBtn.onclick = closeSidebar;
const sidebarOverlay = document.getElementById('sidebarOverlay'); if (sidebarOverlay) sidebarOverlay.onclick = closeSidebar;

document.querySelectorAll('.sidebar-item').forEach(item => {
    item.onclick = () => {
        const a = item.dataset.nav;
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        if (['home', 'movies', 'series', 'continue'].includes(a)) item.classList.add('active');
        closeSidebar();
        if (a === 'home') { selectedCategory = "Todos"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if (a === 'movies') { selectedCategory = "Filmes"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 300, behavior: 'smooth' }); }
        else if (a === 'series') { selectedCategory = "Séries"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 300, behavior: 'smooth' }); }
        else if (a === 'continue') { const r = document.getElementById('continueRow'); if (r && !r.classList.contains('hidden')) r.scrollIntoView({ behavior: 'smooth' }); else showMsg('Nada em andamento!', 'error'); }
        else if (a === 'suggestions') openModal('suggestionModal');
        else if (a === 'profile') openModal('profileModal');
        else if (a === 'admin') { renderAdminCatalogList(); openModal('adminModal'); }
        else if (a === 'creator') openCreator();
        else if (a === 'suggestionsAdmin') { loadSuggestionsAdmin(); openModal('suggestionsAdminModal'); }
        else if (a === 'storage') { loadStorageInfo(); openModal('storageModal'); }
        else if (a === 'logout') { if (confirm('Sair da conta?')) handleLogout(); }
    };
});
function updateCategoryChips() { document.querySelectorAll('.category-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === selectedCategory)); }
document.querySelectorAll('.category-chip').forEach(chip => { chip.onclick = () => { document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); selectedCategory = chip.dataset.cat; renderApp(); }; });

// ========== GENRE ==========
function renderGenreSelector() {
    const c = document.getElementById('genreSelectorContainer'); if (!c) return; c.innerHTML = '';
    AVAILABLE_GENRES.forEach(g => { const t = document.createElement('div'); t.className = 'genre-tag'; if (selectedGenres.includes(g)) t.classList.add('selected'); t.textContent = g; t.onclick = () => { const i = selectedGenres.indexOf(g); if (i >= 0) selectedGenres.splice(i, 1); else selectedGenres.push(g); renderGenreSelector(); }; c.appendChild(t); });
    const ct = document.getElementById('genreCounter'); if (ct) { if (selectedGenres.length === 0) { ct.textContent = '⚠️ Selecione ao menos 1'; ct.style.color = '#ff9800'; } else { ct.textContent = `✓ ${selectedGenres.length}: ${selectedGenres.join(', ')}`; ct.style.color = 'var(--primary-color)'; } }
}

// ========== CROPPER ==========
window.triggerCropModal = function (inputId, previewId, ar) {
    const fi = document.getElementById(inputId); currentTargetPreview = document.getElementById(previewId);
    if (!fi) return;
    fi.onchange = (e) => { 
        const file = e.target.files[0]; if (!file) return; 
        const reader = new FileReader(); 
        reader.onload = (ev) => { 
            const tmp = new Image(); 
            tmp.onload = () => { 
                if (tmp.naturalWidth <= 800 && tmp.naturalHeight <= 800) { 
                    if (currentTargetPreview) { currentTargetPreview.src = ev.target.result; currentTargetPreview.classList.remove('hidden'); } 
                    fi.value = ""; return; 
                } 
                const cropImg = document.getElementById('cropperImage');
                if (cropImg) cropImg.src = ev.target.result; 
                if (!document.getElementById('profileModal')?.classList.contains('hidden')) { previousModal = 'profileModal'; closeModal('profileModal'); } 
                else if (!document.getElementById('creatorModal')?.classList.contains('hidden')) { previousModal = 'creatorModal'; closeModal('creatorModal'); } 
                openModal('cropperModal'); 
                if (cropperInstance) cropperInstance.destroy(); 
                cropperInstance = new Cropper(cropImg, { 
                    aspectRatio: ar || NaN, viewMode: 1, autoCropArea: 1, responsive: true, 
                    crop() { 
                        const cv = cropperInstance.getCroppedCanvas({ width: 800 }); 
                        if (cv) { 
                            const u = cv.toDataURL('image/jpeg', 0.9); 
                            ['prevMobile', 'prevPC', 'prevTV'].forEach(id => { const el = document.getElementById(id); if (el) el.src = u; });
                        } 
                    } 
                }); 
            }; 
            tmp.src = ev.target.result; 
        }; 
        reader.readAsDataURL(file); 
    }; 
    fi.click();
};

const btnConfirmCrop = document.getElementById('btnConfirmCrop');
if (btnConfirmCrop) btnConfirmCrop.onclick = () => { if (!cropperInstance) return; const cv = cropperInstance.getCroppedCanvas({ width: 1200 }); if (cv && currentTargetPreview) { currentTargetPreview.src = cv.toDataURL('image/jpeg', 0.92); currentTargetPreview.classList.remove('hidden'); } closeModal('cropperModal'); if (previousModal) openModal(previousModal); if (cropperInstance) cropperInstance.destroy(); };
const btnCloseCropper = document.getElementById('btnCloseCropper');
if (btnCloseCropper) btnCloseCropper.onclick = () => { closeModal('cropperModal'); if (previousModal) openModal(previousModal); if (cropperInstance) cropperInstance.destroy(); };

// ========== SEARCH ==========
const searchBox = document.getElementById('searchBox'), searchInput = document.getElementById('searchInput'), searchDropdown = document.getElementById('searchResultsDropdown');
document.getElementById('searchIconBtn')?.addEventListener('click', (e) => { e.stopPropagation(); if (searchBox?.classList.contains('active')) { if (searchInput?.value.trim() === '') searchBox.classList.remove('active'); } else { searchBox?.classList.add('active'); setTimeout(() => searchInput?.focus(), 250); } });
searchInput?.addEventListener('input', () => { const v = searchInput.value.trim(); if (v.length > 0) { searchBox?.classList.add('has-text'); renderSearchDropdown(v); } else { searchBox?.classList.remove('has-text'); searchDropdown?.classList.remove('visible'); } });
document.getElementById('searchClearBtn')?.addEventListener('click', (e) => { e.stopPropagation(); if (searchInput) searchInput.value = ''; searchBox?.classList.remove('has-text'); searchDropdown?.classList.remove('visible'); searchInput?.focus(); });

function smartSearch(q) { const nq = normalizeText(q); if (!nq) return []; const sc = []; mediaCatalog.forEach(i => { const t = normalizeText(i.title); if (!t) return; let s = 0; if (t === nq) s = 10000; else if (t.startsWith(nq)) s = 1000 - t.length; else if (t.includes(nq)) s = 100 - t.length; else { const words = nq.split(' ').filter(w => w.length > 0); const mc = words.filter(w => t.includes(w)).length; if (mc > 0) s = mc * 20; } if (s > 0) sc.push({ item: i, score: s }); }); sc.sort((a, b) => b.score - a.score); return sc.slice(0, 10).map(s => s.item); }
function highlightMatch(t, q) { const nt = normalizeText(t), nq = normalizeText(q), i = nt.indexOf(nq); if (i === -1) return t; return t.substring(0, i) + '<mark>' + t.substring(i, i + q.length) + '</mark>' + t.substring(i + q.length); }
function renderSearchDropdown(query) {
    if (!searchDropdown) return;
    const results = smartSearch(query); searchDropdown.innerHTML = '';
    if (results.length === 0) { searchDropdown.innerHTML = `<div class="search-no-results"><span class="search-empty-icon">🔍</span><div>Nenhum resultado para "<strong>${query}</strong>"</div></div>`; }
    else { searchDropdown.innerHTML = `<div class="search-results-header">🔍 ${results.length} resultado(s)</div>`; results.forEach(item => { const d = document.createElement('div'); d.className = 'search-result-item'; d.tabIndex = 0; const p = getPosterUrl(item) || ''; const tl = item.type === 'movie' ? 'Filme' : 'Série'; const gs = getItemGenres(item); d.innerHTML = `<img class="search-result-thumb" src="${p}" loading="lazy" onerror="this.style.display='none'"><div class="search-result-info"><div class="search-result-title">${highlightMatch(item.title, query)}</div><div class="search-result-meta"><span class="type-badge">${tl}</span>${item.year ? '<span>' + item.year + '</span>' : ''}${gs.length > 0 ? '<span>' + gs.slice(0, 2).join(', ') + '</span>' : ''}</div></div>`; d.onclick = () => { searchDropdown.classList.remove('visible'); if (searchInput) searchInput.value = ''; searchBox?.classList.remove('has-text'); window.location.hash = `#/midia/${item.id}`; openDetails(item); }; d.onkeydown = (e) => { if (e.key === 'Enter') d.click(); }; searchDropdown.appendChild(d); }); }
    searchDropdown.classList.add('visible');
}

searchInput?.addEventListener('keydown', (e) => { const items = searchDropdown?.querySelectorAll('.search-result-item'); if (!items?.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); items[0]?.focus(); } });
searchDropdown?.addEventListener('keydown', (e) => { const items = [...searchDropdown.querySelectorAll('.search-result-item')]; const idx = items.indexOf(document.activeElement); if (e.key === 'ArrowDown' && idx < items.length - 1) { e.preventDefault(); items[idx + 1]?.focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx > 0) items[idx - 1]?.focus(); else searchInput?.focus(); } else if (e.key === 'Escape') { searchDropdown.classList.remove('visible'); searchInput?.focus(); } });
document.addEventListener('click', (e) => { const wrapper = document.getElementById('searchWrapper'); if (wrapper && !wrapper.contains(e.target)) { searchDropdown?.classList.remove('visible'); if (searchInput?.value.trim() === '') searchBox?.classList.remove('active'); } });

// ========== HASH ==========
function handleHashRouting() { const h = window.location.hash; if (h.startsWith('#/midia/')) { const id = h.replace('#/midia/', ''); const i = mediaCatalog.find(m => m.id === id); if (i) openDetails(i); } }
window.addEventListener('hashchange', handleHashRouting);

// ========== MEDIA TYPE ==========
const mediaTypeEl = document.getElementById('mediaType');
if (mediaTypeEl) {
    mediaTypeEl.onchange = (e) => { 
        const t = e.target.value; 
        if (t === 'movie') { 
            document.getElementById('movieFileArea')?.classList.remove('hidden'); 
            document.getElementById('seriesBuilderArea')?.classList.add('hidden'); 
            const lbl = document.getElementById('mediaDurationLabel'); if (lbl) lbl.innerText = "Duração (Ex: 2h 10m)"; 
        } else { 
            document.getElementById('movieFileArea')?.classList.add('hidden'); 
            document.getElementById('seriesBuilderArea')?.classList.remove('hidden'); 
            const lbl = document.getElementById('mediaDurationLabel'); if (lbl) lbl.innerText = "Duração Média (Ex: 45m/ep)"; 
            if (seasonsBuilder.length === 0) addSeason(); 
        } 
    };
}

// ========== SEASONS ==========
function renderSeasonsBuilder() { const c = document.getElementById('seasonsList'); if (!c) return; c.innerHTML = ""; seasonsBuilder.forEach((s, si) => { const d = document.createElement('div'); d.style.cssText = "background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin-top:14px;"; d.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:10px;"><strong style="color:var(--primary-color);">T${si + 1}</strong><button type="button" class="btn-secondary" onclick="addEpisode(${si})">+ EP</button></div><div class="input-group"><label>Foto Temporada</label><div class="file-upload-box" onclick="triggerCropModal('seasonCoverFile_${si}','seasonCoverPrev_${si}',16/9)"><span class="file-upload-label">📁</span><input type="file" id="seasonCoverFile_${si}" accept="image/*" class="hidden"><img id="seasonCoverPrev_${si}" src="${s.seasonCoverUrl || ''}" class="file-preview-img ${s.seasonCoverUrl ? '' : 'hidden'}"></div></div><div id="episodesListBuilder_${si}"></div>`; c.appendChild(d); const el = d.querySelector(`#episodesListBuilder_${si}`); (s.episodes || []).forEach((ep, ei) => { const ed = document.createElement('div'); ed.style.cssText = "background:#111;padding:12px;margin-top:10px;border-radius:8px;"; ed.innerHTML = `<strong style="font-size:10px;color:#888;">EP ${ei + 1}</strong><div class="input-group"><label>Título</label><input type="text" id="epTitle_${si}_${ei}" value="${ep.title || ''}"></div><div class="input-group"><label>Duração</label><input type="text" id="epDuration_${si}_${ei}" value="${ep.duration || ''}"></div><div class="input-group"><label>Thumb</label><div class="file-upload-box" onclick="triggerCropModal('epThumbFile_${si}_${ei}','epThumbPrev_${si}_${ei}',16/9)"><span class="file-upload-label">📸</span><input type="file" id="epThumbFile_${si}_${ei}" accept="image/*" class="hidden"><img id="epThumbPrev_${si}_${ei}" src="${ep.thumbUrl || ''}" class="file-preview-img ${ep.thumbUrl ? '' : 'hidden'}"></div></div><div class="input-group"><label>Link Vídeo</label><input type="text" id="epVideoUrl_${si}_${ei}" value="${ep.videoUrl || ''}"></div>`; el.appendChild(ed); }); }); }
function addSeason() { seasonsBuilder.push({ seasonNumber: seasonsBuilder.length + 1, seasonCoverUrl: '', episodes: [{ title: 'Episódio 1', duration: '45m', videoUrl: '', thumbUrl: '' }] }); renderSeasonsBuilder(); }
window.addEpisode = (si) => { seasonsBuilder[si].episodes.push({ title: `Episódio ${seasonsBuilder[si].episodes.length + 1}`, duration: '45m', videoUrl: '', thumbUrl: '' }); renderSeasonsBuilder(); };
const btnAddSeason = document.getElementById('btnAddSeasonBtn'); if (btnAddSeason) btnAddSeason.onclick = addSeason;

// ========== CATALOG ==========
async function loadCatalog() { try { const snap = await get(ref(rtdb, "catalog")); mediaCatalog = []; if (snap.exists()) { const d = snap.val(); for (let k in d) { const i = { id: k, ...d[k] }; if (!Array.isArray(i.genres)) i.genres = i.category ? [i.category] : []; mediaCatalog.push(i); } } renderApp(); renderAdminCatalogList(); handleHashRouting(); } catch (e) { console.error(e); showMsg('Erro: ' + e.message, 'error'); } }

// ========== CONTINUE ==========
function getContinueList() { if (!currentUserUid) return []; try { return JSON.parse(localStorage.getItem(`mfx_${currentUserUid}_continue`) || '[]'); } catch { return []; } }
function saveContinueList(list) { if (!currentUserUid) return; localStorage.setItem(`mfx_${currentUserUid}_continue`, JSON.stringify(list)); }
function cleanExpiredContinue() { let list = getContinueList(); const now = Date.now(); const b = list.length; list = list.filter(i => (now - (i.lastWatched || 0)) < CONTINUE_EXPIRE_MS); if (list.length !== b) saveContinueList(list); return list; }
function saveContinueWatching(mi, extra = '', episodeInfo = null) { if (!currentUserUid) return; let cl = getContinueList(); cl = cl.filter(i => i.id !== mi.id); cl.unshift({ id: mi.id, title: mi.title, type: mi.type, coverUrl: getBackdropUrl(mi) || getPosterUrl(mi), duration: mi.duration || extra || '', lastWatched: Date.now(), episodeInfo }); if (cl.length > 30) cl.pop(); saveContinueList(cl); renderContinueWatching(); }
function removeContinueItem(id) { let cl = getContinueList(); cl = cl.filter(i => i.id !== id); saveContinueList(cl); renderContinueWatching(); }
function getContinueInfo(id) { return getContinueList().find(i => i.id === id) || null; }
function renderContinueWatching() {
    const cr = document.getElementById('continueRow'), cc = document.getElementById('continueCarousel'); 
    if (!cr || !cc) return;
    cc.innerHTML = "";
    if (!currentUserUid) { cr.classList.add('hidden'); return; }
    let list = cleanExpiredContinue();
    if (selectedCategory === "Filmes") list = list.filter(i => i.type === 'movie');
    else if (selectedCategory === "Séries") list = list.filter(i => i.type === 'serie');
    else if (selectedCategory !== "Todos") { list = list.filter(i => { const o = mediaCatalog.find(m => m.id === i.id); if (!o) return false; return getItemGenres(o).includes(selectedCategory); }); }
    if (list.length === 0) { cr.classList.add('hidden'); return; }
    cr.classList.remove('hidden');
    list.forEach(item => { const card = document.createElement('div'); card.className = 'continue-card'; card.tabIndex = 0; const epText = item.episodeInfo ? `<div class="continue-ep-badge">▶ ${item.episodeInfo}</div>` : ''; card.innerHTML = `<img src="${item.coverUrl || 'https://via.placeholder.com/300x180?text=?'}" loading="lazy"><button class="continue-remove-btn" aria-label="Remover">✕</button><div class="continue-play-icon">▶</div><div class="continue-info"><div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</div>${epText}<div class="continue-duration">${item.lastWatched ? '🕐 ' + timeAgo(item.lastWatched) : ''}</div></div>`; card.querySelector('.continue-remove-btn').onclick = (e) => { e.stopPropagation(); removeContinueItem(item.id); showMsg('Removido!', 'success'); }; card.onclick = () => { const o = mediaCatalog.find(m => m.id === item.id); if (o) openDetails(o); }; card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); }; cc.appendChild(card); });
}

// ========== RENDER ==========
function renderApp() {
    const mc = document.getElementById('moviesCarousel'), sc = document.getElementById('seriesCarousel'), mr = document.getElementById('moviesRow'), sr = document.getElementById('seriesRow'); 
    if (!mc || !sc || !mr || !sr) return;
    mc.innerHTML = ""; sc.innerHTML = "";
    if (selectedCategory === "Filmes") { mr.classList.remove('hidden'); sr.classList.add('hidden'); } else if (selectedCategory === "Séries") { mr.classList.add('hidden'); sr.classList.remove('hidden'); } else { mr.classList.remove('hidden'); sr.classList.remove('hidden'); }
    mediaCatalog.forEach(item => {
        if (!itemMatchesCategory(item, selectedCategory)) return;
        const card = document.createElement('div'); card.className = 'media-card'; card.tabIndex = 0; const ps = getPosterUrl(item); const gs = getItemGenres(item); const tg = gs.length > 0 ? gs[0] : (item.type === 'movie' ? 'Filme' : 'Série');
        if (ps) card.innerHTML = `<img class="media-card-poster" src="${ps}" loading="lazy" onerror="this.style.display='none'"><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`;
        else card.innerHTML = `<div class="media-card-poster-fallback">🎬</div><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`;
        card.onclick = () => { window.location.hash = `#/midia/${item.id}`; openDetails(item); }; card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
        if (item.type === 'movie') mc.appendChild(card); else sc.appendChild(card);
    });
    renderContinueWatching(); if (mediaCatalog.length > 0 && !activeItem) setHero(mediaCatalog[0]);
}
function setHero(item) {
    activeItem = item; 
    const heroTitle = document.getElementById('heroTitle'); if (heroTitle) heroTitle.innerText = item.title; 
    const heroDesc = document.getElementById('heroDesc'); if (heroDesc) heroDesc.innerText = item.description || '';
    const gs = getItemGenres(item); const tl = item.type === 'movie' ? '🎬 FILME' : '📺 SÉRIE';
    const heroMeta = document.getElementById('heroMeta');
    if (heroMeta) heroMeta.innerHTML = `<strong>${tl}</strong>${item.year ? ` <span class="dot">•</span> ${item.year}` : ''}${item.duration ? ` <span class="dot">•</span> ⏱️ ${item.duration}` : ''}${gs.length > 0 ? ` <span class="dot">•</span> ${gs.slice(0, 3).join(', ')}` : ''}`;
    const bd = getBackdropUrl(item); const heroBackdrop = document.getElementById('heroBackdrop');
    if (bd && heroBackdrop) heroBackdrop.style.backgroundImage = `url('${bd}')`;
    const playBtn = document.getElementById('heroPlayBtn');
    if (playBtn) playBtn.onclick = () => { if (item.type === 'movie' && item.videoUrl) { saveContinueWatching(item, item.duration || ''); playVideo(item.videoUrl, item.title, 'Filme'); } else openDetails(item); };
    const infoBtn = document.getElementById('heroInfoBtn');
    if (infoBtn) infoBtn.onclick = () => openDetails(item);
}

// ========== DETAILS ==========
function openDetails(item) {
    activeItem = item; const bd = getBackdropUrl(item), ba = document.getElementById('detailBackdropArea');
    if (ba) { if (bd) ba.style.backgroundImage = `url('${bd}')`; else ba.style.background = '#1a1a1a'; }
    const ps = getPosterUrl(item), dp = document.getElementById('detailPoster');
    if (dp) { if (ps) { dp.src = ps; dp.style.display = 'block'; } else dp.style.display = 'none'; }
    const detailTitle = document.getElementById('detailTitle'); if (detailTitle) detailTitle.innerText = item.title;
    const detailMeta = document.getElementById('detailMeta'); if (detailMeta) detailMeta.innerText = `${item.type === 'movie' ? 'FILME' : 'SÉRIE'} • ${item.year || ''}${item.duration ? ' • ⏱️ ' + item.duration : ''}`;
    const gd = document.getElementById('detailGenres'); 
    if (gd) {
        gd.innerHTML = '';
        getItemGenres(item).forEach(g => { const b = document.createElement('span'); b.style.cssText = 'padding:5px 14px;background:rgba(229,9,20,0.12);border:1px solid rgba(229,9,20,0.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary-color);text-transform:uppercase'; b.textContent = g; gd.appendChild(b); });
    }
    const detailDesc = document.getElementById('detailDesc'); if (detailDesc) detailDesc.innerText = item.description || '';
    const ci = getContinueInfo(item.id), ca = document.getElementById('detailsContentArea');
    if (item.type === 'movie') {
        document.getElementById('detailMovieArea')?.classList.remove('hidden'); document.getElementById('detailSerieArea')?.classList.add('hidden');
        const bp = document.getElementById('btnPlayMovieFile'); 
        if (bp) {
            bp.innerText = ci ? '▶ Continuar Assistindo' : '▶ Assistir Filme';
            bp.onclick = () => { saveContinueWatching(item, item.duration || ''); playVideo(item.videoUrl, item.title, 'Filme'); };
        }
        openModal('detailsModal'); if (ca) ca.scrollTop = 0; setTimeout(() => bp?.focus(), 150);
    } else {
        document.getElementById('detailMovieArea')?.classList.add('hidden'); document.getElementById('detailSerieArea')?.classList.remove('hidden');
        const tabs = document.getElementById('seasonTabs'); if (tabs) tabs.innerHTML = "";
        let rsi = 0, rei = -1;
        if (ci && ci.episodeInfo) { const match = ci.episodeInfo.match(/T(\d+)\s*E(\d+)/i); if (match) { rsi = parseInt(match[1]) - 1; rei = parseInt(match[2]) - 1; } }
        (item.seasons || []).forEach((s, idx) => {
            const tab = document.createElement('div'); tab.className = `season-tab ${idx === rsi ? 'active' : ''}`; tab.innerText = `T${idx + 1}`; tab.tabIndex = 0;
            tab.onclick = () => { document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); if (s.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${s.seasonCoverUrl}')`; else if (ba) ba.style.backgroundImage = bd ? `url('${bd}')` : ''; renderEpisodesList(s.episodes || [], idx, s, item, idx === rsi ? rei : -1); };
            tab.onkeydown = (e) => { if (e.key === 'Enter') tab.click(); else if (e.key === 'ArrowRight') { e.preventDefault(); const n = tab.nextElementSibling; if (n) { n.focus(); n.click(); } } else if (e.key === 'ArrowLeft') { e.preventDefault(); const p = tab.previousElementSibling; if (p) { p.focus(); p.click(); } } else if (e.key === 'ArrowDown') { e.preventDefault(); const fe = document.querySelector('#episodesListContainer .episode-card'); if (fe) fe.focus(); } };
            tabs?.appendChild(tab);
        });
        if (item.seasons?.length > 0) { const ti = item.seasons[rsi] ? rsi : 0; const ts = item.seasons[ti]; if (ts.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${ts.seasonCoverUrl}')`; renderEpisodesList(ts.episodes || [], ti, ts, item, ti === rsi ? rei : -1); }
        openModal('detailsModal'); if (ca) ca.scrollTop = 0;
        setTimeout(() => { const at = document.querySelector('.season-tab.active'); if (at) { at.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); at.focus(); } }, 200);
    }
}
function renderEpisodesList(eps, si, sd, ser, rei) {
    const c = document.getElementById('episodesListContainer'); if (!c) return; c.innerHTML = "";
    const fi = (sd?.seasonCoverUrl?.trim()) ? sd.seasonCoverUrl : (getBackdropUrl(ser) || getPosterUrl(ser) || '');
    eps.forEach((ep, idx) => {
        const d = document.createElement('div'); d.className = 'episode-card'; d.tabIndex = 0;
        const th = (ep.thumbUrl?.trim()) ? ep.thumbUrl : fi; const dur = ep.duration ? `<span style="color:#888;font-size:10px;margin-left:6px">⏱️ ${ep.duration}</span>` : '';
        const lbl = `T${si + 1} E${idx + 1}`; const isR = (idx === rei); const rb = isR ? `<div class="ep-resume-badge">⏳ Onde parou</div>` : '';
        d.onclick = () => { closeModal('detailsModal'); saveContinueWatching(activeItem, ep.duration || '', `${lbl} - ${ep.title || ''}`); playVideo(ep.videoUrl, activeItem.title, `${lbl} - ${ep.title}`); };
        d.onkeydown = (e) => { if (e.key === 'Enter') d.click(); else if (e.key === 'ArrowDown') { e.preventDefault(); if (d.nextElementSibling) d.nextElementSibling.focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); if (d.previousElementSibling) d.previousElementSibling.focus(); else { const at = document.querySelector('.season-tab.active'); if (at) at.focus(); } } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const tabsArr = [...document.querySelectorAll('.season-tab')]; const at = document.querySelector('.season-tab.active'); if (at) { const ci2 = tabsArr.indexOf(at); let ni = e.key === 'ArrowRight' ? ci2 + 1 : ci2 - 1; if (ni >= 0 && ni < tabsArr.length) { tabsArr[ni].focus(); tabsArr[ni].click(); } } } };
        d.innerHTML = `<div class="episode-thumb"><img src="${th}" loading="lazy" onerror="this.src='${fi}'"><div class="ep-play-overlay"><span>▶</span></div></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">${lbl} - ${ep.title || 'Sem Título'}${dur}</div><span style="font-size:11px;color:var(--primary-color);font-weight:700">▶ ${isR ? 'Continuar' : 'Assistir'}</span>${rb}</div>`;
        if (isR) { d.style.border = '1.5px solid rgba(255,202,40,0.35)'; d.style.background = 'rgba(255,202,40,0.04)'; }
        c.appendChild(d);
    });
    if (rei >= 0) setTimeout(() => { const cards = c.querySelectorAll('.episode-card'); if (cards[rei]) cards[rei].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
}
const btnCloseDetails = document.getElementById('btnCloseDetails'); if (btnCloseDetails) btnCloseDetails.onclick = () => { window.location.hash = ''; closeModal('detailsModal'); };

// ========== AUDIO BOOSTER ==========
function initAudioContext() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioGainNode = audioCtx.createGain();
        audioGainNode.connect(audioCtx.destination);
        audioGainNode.gain.value = 1.0;
    } catch (e) { console.warn('AudioContext indisponível:', e); }
}

function boostMediaElement(el) {
    if (!audioCtx || !audioGainNode || boostedElements.has(el)) return;
    try {
        const src = audioCtx.createMediaElementSource(el);
        src.connect(audioGainNode);
        boostedElements.add(el);
    } catch (e) { /* bloqueio cross-origin */ }
}

function scanAndBoostAudio() {
    if (!audioCtx) return;
    document.querySelectorAll('video, audio').forEach(el => boostMediaElement(el));
    try {
        const iframe = document.querySelector('#playerContainerView iframe');
        if (iframe && iframe.contentDocument) {
            iframe.contentDocument.querySelectorAll('video, audio').forEach(el => boostMediaElement(el));
        }
    } catch (e) { /* bloqueio cross-origin */ }
}

function setAudioBoost(pct) {
    audioBoostLevel = pct;
    initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (audioGainNode) audioGainNode.gain.value = pct / 100;
    scanAndBoostAudio();
    const icon = document.getElementById('audioBoostIcon');
    const val = document.getElementById('audioBoostValue');
    if (val) val.textContent = pct + '%';
    if (icon && val) {
        if (pct <= 100) { icon.textContent = '🔈'; val.style.color = '#aaa'; }
        else if (pct <= 200) { icon.textContent = '🔊'; val.style.color = 'var(--primary-color)'; }
        else if (pct <= 350) { icon.textContent = '🔊'; val.style.color = '#ff9800'; }
        else { icon.textContent = '🔊'; val.style.color = '#ff5252'; }
    }
}

document.getElementById('audioBoostSlider')?.addEventListener('input', (e) => setAudioBoost(parseInt(e.target.value)));
document.getElementById('audioBoostIcon')?.addEventListener('click', () => {
    const slider = document.getElementById('audioBoostSlider');
    if (slider) {
        if (audioBoostLevel > 100) { slider.value = 100; setAudioBoost(100); }
        else { slider.value = 200; setAudioBoost(200); }
    }
});

// ========== OVERLAY CLEANER ==========
function startOverlayCleaner() {
    if (overlayCleanerInterval) return;
    overlayCleanerInterval = setInterval(() => {
        if (!isPlayerOpen()) return;
        try {
            const iframe = document.querySelector('#playerContainerView iframe');
            if (!iframe || !iframe.contentDocument) return;
            const doc = iframe.contentDocument;
            const allEls = doc.querySelectorAll('div, aside, section, span');
            allEls.forEach(el => {
                const style = doc.defaultView?.getComputedStyle(el);
                if (!style) return;
                const pos = style.position;
                const zIndex = parseInt(style.zIndex) || 0;
                const isOverlay = (pos === 'fixed' || pos === 'absolute') && zIndex > 100;
                const isFullCover = el.offsetWidth > (iframe.clientWidth * 0.6) && el.offsetHeight > (iframe.clientHeight * 0.4);
                if (isOverlay && isFullCover) {
                    if (!el.querySelector('video')) {
                        el.style.display = 'none';
                        el.style.visibility = 'hidden';
                        el.style.opacity = '0';
                        el.style.pointerEvents = 'none';
                    }
                }
            });
        } catch (e) { /* ignora erro de cross-origin */ }
    }, 2000);
}

function stopOverlayCleaner() {
    if (overlayCleanerInterval) { clearInterval(overlayCleanerInterval); overlayCleanerInterval = null; }
}

// ========== PLAYER ==========
const playerBox = document.getElementById('playerModalBox');
const playerControls = document.getElementById('playerControlsTop');
const playerContainer = document.getElementById('playerContainerView');
const playerLoading = document.getElementById('playerLoading');

function isPlayerOpen() { return !document.getElementById('playerModal')?.classList.contains('hidden'); }
function isInFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

function showPlayerControls() {
    if (!isPlayerOpen()) return;
    if (playerControls) playerControls.classList.remove('is-hidden'); 
    if (playerBox) playerBox.classList.remove('cursor-hidden');
    clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer);
    controlsHideTimer = setTimeout(() => playerControls?.classList.add('is-hidden'), 4000);
    if (!('ontouchstart' in window)) cursorHideTimer = setTimeout(() => playerBox?.classList.add('cursor-hidden'), 3500);
}

if (playerBox) {
    playerBox.addEventListener('mousemove', showPlayerControls);
    playerBox.addEventListener('touchstart', showPlayerControls, { passive: true });
}
['fullscreenchange', 'webkitfullscreenchange'].forEach(e => { document.addEventListener(e, () => { if (isPlayerOpen()) showPlayerControls(); }); });

const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
if (btnToggleFullscreen) btnToggleFullscreen.onclick = (e) => { e.stopPropagation(); if (!isInFullscreen()) { if (playerBox?.requestFullscreen) playerBox.requestFullscreen(); else if (playerBox?.webkitRequestFullscreen) playerBox.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } showPlayerControls(); };

const btnToggleStretch = document.getElementById('btnToggleStretch');
if (btnToggleStretch) btnToggleStretch.onclick = (e) => { e.stopPropagation(); if (playerContainer) { playerContainer.classList.toggle('stretch-mode'); showMsg(playerContainer.classList.contains('stretch-mode') ? '📐 Esticado' : '🖼️ Normal', 'success'); } showPlayerControls(); };

const btnReloadPlayer = document.getElementById('btnReloadPlayer');
if (btnReloadPlayer) btnReloadPlayer.onclick = (e) => { e.stopPropagation(); if (!currentVideoUrl) return; const iframe = playerContainer?.querySelector('iframe'); if (iframe) { const src = iframe.src; iframe.src = ''; setTimeout(() => { iframe.src = src; }, 100); } playerLoading?.classList.remove('hidden'); setTimeout(() => playerLoading?.classList.add('hidden'), 2000); showMsg('Recarregando...', 'success'); };

const _originalOpen = window.open;
window.open = function (...args) {
    if (isPlayerOpen() && isInFullscreen()) {
        try {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch (e) { }
    }
    return _originalOpen.apply(this, args);
};

function playVideo(rawUrl, mainTitle, subTitle) {
    if (!rawUrl) { showMsg('Sem link de vídeo!', 'error'); return; }
    const url = formatVideoUrl(rawUrl); currentVideoUrl = url;
    const titleDisp = document.getElementById('playerTitleDisplay'); if (titleDisp) titleDisp.innerText = mainTitle || 'Assistindo';
    const subDisp = document.getElementById('playerSubDisplay'); if (subDisp) subDisp.innerText = subTitle || 'MasterFlix';
    const old = playerContainer?.querySelector('iframe'); if (old) old.remove();
    playerContainer?.classList.remove('stretch-mode'); playerLoading?.classList.remove('hidden');
    const booster = document.getElementById('audioBoostSlider'); if (booster) booster.value = 100; 
    setAudioBoost(100);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-popups-to-escape-sandbox');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('webkitallowfullscreen', 'true');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('scrolling', 'no');
    iframe.onload = () => {
        setTimeout(() => playerLoading?.classList.add('hidden'), 500);
        setTimeout(() => scanAndBoostAudio(), 1500);
        setTimeout(() => scanAndBoostAudio(), 3000);
        setTimeout(() => scanAndBoostAudio(), 6000);
    };
    playerContainer?.appendChild(iframe);
    openModal('playerModal');
    startOverlayCleaner();
    showPlayerControls();
    setTimeout(() => { const tip = document.getElementById('playerTip'); if (tip && isPlayerOpen()) { tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 5000); } }, 3000);
    setTimeout(() => playerLoading?.classList.add('hidden'), 6000);
    const audioScanInterval = setInterval(() => { if (!isPlayerOpen()) { clearInterval(audioScanInterval); return; } scanAndBoostAudio(); }, 5000);
}

function closePlayer() {
    clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer);
    if (isInFullscreen()) { try { document.exitFullscreen(); } catch (e) { } }
    const iframe = playerContainer?.querySelector('iframe'); if (iframe) iframe.remove();
    playerContainer?.classList.remove('stretch-mode'); playerLoading?.classList.remove('hidden');
    closeModal('playerModal'); playerBox?.classList.remove('cursor-hidden'); playerControls?.classList.remove('is-hidden');
    stopOverlayCleaner(); currentVideoUrl = ''; renderContinueWatching();
    if (audioGainNode) audioGainNode.gain.value = 1.0;
    const booster = document.getElementById('audioBoostSlider'); if (booster) booster.value = 100;
    const boostVal = document.getElementById('audioBoostValue'); if (boostVal) boostVal.textContent = '100%';
}
const btnClosePlayer = document.getElementById('btnClosePlayer'); if (btnClosePlayer) btnClosePlayer.onclick = (e) => { e.stopPropagation(); closePlayer(); };

document.addEventListener('keydown', (e) => {
    if (!isPlayerOpen()) return;
    if (e.key === 'Escape') { closePlayer(); return; }
    if (e.key === 'f' || e.key === 'F') document.getElementById('btnToggleFullscreen')?.click();
    if (e.key === 's' || e.key === 'S') document.getElementById('btnToggleStretch')?.click();
    if (e.key === 'r' || e.key === 'R') document.getElementById('btnReloadPlayer')?.click();
    if (e.key === 'ArrowUp') { e.preventDefault(); const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = Math.min(500, parseInt(sl.value) + 25); setAudioBoost(parseInt(sl.value)); } }
    if (e.key === 'ArrowDown') { e.preventDefault(); const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = Math.max(100, parseInt(sl.value) - 25); setAudioBoost(parseInt(sl.value)); } }
    showPlayerControls();
});

// ========== FORM ==========
const mediaForm = document.getElementById('mediaForm');
if (mediaForm) {
    mediaForm.onsubmit = async (e) => {
        e.preventDefault(); 
        if (selectedGenres.length === 0) { showMsg('Selecione 1 gênero!', 'error'); return; }
        const editId = document.getElementById('editMediaId')?.value;
        const type = document.getElementById('mediaType')?.value;
        let cv = document.getElementById('mediaCoverPreview')?.src || '';
        let bd = document.getElementById('mediaBackdropPreview')?.src || '';

        if (!isValidImageUrl(cv) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) cv = ex.coverUrl; }
        if (!isValidImageUrl(bd) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) bd = ex.backdropUrl; }

        let payload = { 
            type, 
            genres: [...selectedGenres], 
            category: selectedGenres[0], 
            title: document.getElementById('mediaTitle')?.value.trim() || '', 
            year: document.getElementById('mediaYear')?.value.trim() || '', 
            duration: document.getElementById('mediaDuration')?.value.trim() || '', 
            description: document.getElementById('mediaDesc')?.value.trim() || '', 
            coverUrl: isValidImageUrl(cv) ? cv : '', 
            backdropUrl: isValidImageUrl(bd) ? bd : '' 
        };

        if (type === 'movie') payload.videoUrl = document.getElementById('movieVideoUrl')?.value.trim() || '';
        else { 
            const us = []; 
            for (let si = 0; si < seasonsBuilder.length; si++) { 
                const s = seasonsBuilder[si]; 
                let sc = document.getElementById(`seasonCoverPrev_${si}`)?.src || (s.seasonCoverUrl || ''); 
                if (!isValidImageUrl(sc)) sc = ''; 
                const ue = []; 
                for (let ei = 0; ei < (s.episodes || []).length; ei++) { 
                    let et = document.getElementById(`epThumbPrev_${si}_${ei}`)?.src || (s.episodes[ei].thumbUrl || ''); 
                    if (!isValidImageUrl(et)) et = ''; 
                    ue.push({ 
                        title: document.getElementById(`epTitle_${si}_${ei}`)?.value?.trim() || `Episódio ${ei + 1}`, 
                        duration: document.getElementById(`epDuration_${si}_${ei}`)?.value?.trim() || '', 
                        videoUrl: document.getElementById(`epVideoUrl_${si}_${ei}`)?.value?.trim() || '', 
                        thumbUrl: et 
                    }); 
                } 
                us.push({ seasonNumber: si + 1, seasonCoverUrl: sc, episodes: ue }); 
            } 
            payload.seasons = us; 
        }
        try { 
            if (editId) await set(ref(rtdb, "catalog/" + editId), payload); 
            else await set(push(ref(rtdb, "catalog")), payload); 
            showMsg('Salvo! ✅', 'success'); 
            closeModal('creatorModal'); 
            mediaForm.reset(); 
            seasonsBuilder = []; 
            selectedGenres = []; 
            await loadCatalog(); 
        } catch (err) { showMsg('Erro: ' + err.message, 'error'); }
    };
}

// ========== ADMIN ==========
window.editMedia = (id) => { 
    const i = mediaCatalog.find(m => m.id === id); if (!i) return; 
    const editIdEl = document.getElementById('editMediaId'); if (editIdEl) editIdEl.value = i.id; 
    const ts = document.getElementById('mediaType'); 
    if (ts) { ts.value = i.type; ts.disabled = true; ts.dispatchEvent(new Event('change')); }
    selectedGenres = Array.isArray(i.genres) && i.genres.length > 0 ? [...i.genres] : (i.category ? [i.category] : []); 
    renderGenreSelector(); 
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('mediaTitle', i.title); setVal('mediaYear', i.year); setVal('mediaDuration', i.duration); setVal('mediaDesc', i.description); setVal('movieVideoUrl', i.videoUrl);
    
    if (i.coverUrl) { const img = document.getElementById('mediaCoverPreview'); if (img) { img.src = i.coverUrl; img.classList.remove('hidden'); } } 
    if (i.backdropUrl) { const img = document.getElementById('mediaBackdropPreview'); if (img) { img.src = i.backdropUrl; img.classList.remove('hidden'); } } 
    
    const cTitle = document.getElementById('creatorTitle'); if (cTitle) cTitle.innerText = "Editar"; 
    if (i.type === 'serie') { seasonsBuilder = JSON.parse(JSON.stringify(i.seasons || [])); renderSeasonsBuilder(); } 
    closeModal('adminModal'); openModal('creatorModal'); 
};

window.deleteMedia = async (id) => { if (confirm("Apagar?")) { try { await remove(ref(rtdb, "catalog/" + id)); showMsg('Removido! ✅', 'success'); loadCatalog(); } catch (e) { showMsg('Erro: ' + e.message, 'error'); } } };

function renderAdminCatalogList() { 
    const c = document.getElementById('adminCatalogList'); if (!c) return; 
    const sv = normalizeText(document.getElementById('adminSearchInput')?.value || ''); c.innerHTML = ""; 
    mediaCatalog.forEach(i => { 
        if (sv && !normalizeText(i.title).includes(sv)) return; 
        const d = document.createElement('div'); 
        d.className = 'admin-item'; 
        d.innerHTML = `<div><strong>${i.title}</strong><div style="font-size:10px;color:#888">${i.type === 'movie' ? 'Filme' : 'Série'}${i.year ? ' • ' + i.year : ''}</div></div><div style="display:flex;gap:6px"><button class="btn-secondary" onclick="editMedia('${i.id}')">✏️</button><button class="btn-danger" onclick="deleteMedia('${i.id}')">🗑️</button></div>`; 
        c.appendChild(d); 
    }); 
}

const adminSearch = document.getElementById('adminSearchInput'); if (adminSearch) adminSearch.oninput = renderAdminCatalogList;
const btnCloseAdmin = document.getElementById('btnCloseAdmin'); if (btnCloseAdmin) btnCloseAdmin.onclick = () => closeModal('adminModal');
const btnAddNewAdmin = document.getElementById('btnAddNewFromAdmin'); if (btnAddNewAdmin) btnAddNewAdmin.onclick = () => { closeModal('adminModal'); openCreator(); };

function openCreator() { 
    const editIdEl = document.getElementById('editMediaId'); if (editIdEl) editIdEl.value = ""; 
    if (mediaForm) mediaForm.reset(); 
    const ts = document.getElementById('mediaType'); 
    if (ts) { ts.disabled = false; ts.dispatchEvent(new Event('change')); }
    document.getElementById('mediaCoverPreview')?.classList.add('hidden'); 
    document.getElementById('mediaBackdropPreview')?.classList.add('hidden'); 
    const cTitle = document.getElementById('creatorTitle'); if (cTitle) cTitle.innerText = "Publicar"; 
    seasonsBuilder = []; selectedGenres = []; renderGenreSelector(); 
    const sList = document.getElementById('seasonsList'); if (sList) sList.innerHTML = ""; 
    addSeason(); openModal('creatorModal'); 
}

// ========== SUGGESTIONS ==========
const btnCloseSuggestion = document.getElementById('btnCloseSuggestion'); if (btnCloseSuggestion) btnCloseSuggestion.onclick = () => closeModal('suggestionModal');
const btnSendSuggestion = document.getElementById('btnSendSuggestion');
if (btnSendSuggestion) {
    btnSendSuggestion.onclick = async () => { 
        const user = auth.currentUser; if (!user) { showMsg('Faça login!', 'error'); return; } 
        const text = document.getElementById('suggestionText')?.value.trim(); 
        const type = document.getElementById('suggestionType')?.value; 
        if (!text || text.length < 5) { showMsg('Escreva algo válido!', 'error'); return; } 
        try { 
            await set(push(ref(rtdb, "suggestions")), { userId: user.uid, userEmail: user.email, userName: getUserCache('name') || user.email.split('@')[0], text, type, timestamp: Date.now() }); 
            const txt = document.getElementById('suggestionText'); if (txt) txt.value = ''; 
            showMsg('Enviado! ✅', 'success'); 
            closeModal('suggestionModal'); 
        } catch (e) { showMsg('Erro: ' + e.message, 'error'); } 
    };
}

// ========== SUGGESTIONS ADMIN ==========
const btnCloseSuggAdmin = document.getElementById('btnCloseSuggestionsAdmin'); if (btnCloseSuggAdmin) btnCloseSuggAdmin.onclick = () => { exitSelectMode(); closeModal('suggestionsAdminModal'); };
async function loadSuggestionsAdmin() { try { const snap = await get(ref(rtdb, "suggestions")); allSuggestions = []; if (snap.exists()) { const d = snap.val(); for (let k in d) allSuggestions.push({ id: k, ...d[k] }); } allSuggestions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); const txt = document.getElementById('suggestionsCountText'); if (txt) txt.textContent = `${allSuggestions.length} item(s)`; renderSuggestionsList(); } catch (e) { showMsg('Erro: ' + e.message, 'error'); } }
function renderSuggestionsList() { 
    const c = document.getElementById('suggestionsAdminList'); if (!c) return; c.innerHTML = ''; 
    if (allSuggestions.length === 0) { c.innerHTML = '<p style="text-align:center;color:#666;padding:30px">Vazio.</p>'; return; } 
    allSuggestions.forEach(s => { 
        const d = document.createElement('div'); d.className = 'suggestion-box'; 
        const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString('pt-BR') : '?'; 
        const cb = suggestionsSelectMode ? `<input type="checkbox" class="suggestion-checkbox" data-id="${s.id}" ${selectedSuggestionIds.has(s.id) ? 'checked' : ''}>` : ''; 
        const del = !suggestionsSelectMode ? `<button class="btn-danger" onclick="deleteSingleSuggestion('${s.id}')">🗑️</button>` : ''; 
        const badge = s.type === 'bug' ? '🐛 BUG' : '💡 SUG'; 
        d.innerHTML = `<div class="sg-header"><div style="display:flex;align-items:center;gap:8px">${cb}<div><div class="sg-user">${s.userName || '?'} ${badge}</div><div class="sg-email">${s.userEmail || ''}</div></div></div><div style="display:flex;align-items:center;gap:6px"><span class="sg-date">${date}</span>${del}</div></div><div class="sg-text">${s.text}</div>`; 
        if (suggestionsSelectMode) { const chk = d.querySelector('.suggestion-checkbox'); if (chk) chk.onchange = () => { if (chk.checked) selectedSuggestionIds.add(s.id); else selectedSuggestionIds.delete(s.id); }; } 
        c.appendChild(d); 
    }); 
}
function enterSelectMode() { suggestionsSelectMode = true; selectedSuggestionIds.clear(); document.getElementById('btnToggleSelectMode')?.classList.add('hidden'); document.getElementById('btnDeleteSelectedSuggestions')?.classList.remove('hidden'); document.getElementById('btnSelectAllSuggestions')?.classList.remove('hidden'); document.getElementById('btnCancelSelectMode')?.classList.remove('hidden'); renderSuggestionsList(); }
function exitSelectMode() { suggestionsSelectMode = false; selectedSuggestionIds.clear(); document.getElementById('btnToggleSelectMode')?.classList.remove('hidden'); document.getElementById('btnDeleteSelectedSuggestions')?.classList.add('hidden'); document.getElementById('btnSelectAllSuggestions')?.classList.add('hidden'); document.getElementById('btnCancelSelectMode')?.classList.add('hidden'); renderSuggestionsList(); }

document.getElementById('btnToggleSelectMode')?.addEventListener('click', enterSelectMode);
document.getElementById('btnCancelSelectMode')?.addEventListener('click', exitSelectMode);
document.getElementById('btnSelectAllSuggestions')?.addEventListener('click', () => { if (selectedSuggestionIds.size === allSuggestions.length) selectedSuggestionIds.clear(); else allSuggestions.forEach(s => selectedSuggestionIds.add(s.id)); renderSuggestionsList(); });
document.getElementById('btnDeleteSelectedSuggestions')?.addEventListener('click', async () => { if (selectedSuggestionIds.size === 0) return; if (!confirm(`Apagar ${selectedSuggestionIds.size}?`)) return; try { for (let id of selectedSuggestionIds) await remove(ref(rtdb, "suggestions/" + id)); showMsg('OK! ✅', 'success'); exitSelectMode(); loadSuggestionsAdmin(); } catch (e) { showMsg('Erro', 'error'); } });
window.deleteSingleSuggestion = async (id) => { if (!confirm('Apagar?')) return; try { await remove(ref(rtdb, "suggestions/" + id)); loadSuggestionsAdmin(); } catch (e) { } };

// ========== STORAGE ==========
const btnCloseStorage = document.getElementById('btnCloseStorage'); if (btnCloseStorage) btnCloseStorage.onclick = () => closeModal('storageModal');
async function loadStorageInfo() {
    const c = document.getElementById('storageContent'); if (!c) return;
    c.innerHTML = '<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto 14px auto;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando banco de dados...</p></div>';
    try {
        const [catalogSnap, usersSnap, suggestionsSnap] = await Promise.all([
            get(ref(rtdb, "catalog")).catch(() => null),
            get(ref(rtdb, "users")).catch(() => null),
            get(ref(rtdb, "suggestions")).catch(() => null)
        ]);
        const catalogData = catalogSnap?.exists() ? catalogSnap.val() : {};
        const usersData = usersSnap?.exists() ? usersSnap.val() : {};
        const suggestionsData = suggestionsSnap?.exists() ? suggestionsSnap.val() : {};

        const cb = estimateJsonBytes(catalogData), ub = estimateJsonBytes(usersData), sb = estimateJsonBytes(suggestionsData);
        const tb = cb + ub + sb;
        const cc = Object.keys(catalogData).length, uc = Object.keys(usersData).length, scc = Object.keys(suggestionsData).length;

        let movieCount = 0, serieCount = 0, totalEpisodes = 0;
        Object.values(catalogData).forEach(item => {
            if (item.type === 'movie') movieCount++;
            else { serieCount++; (item.seasons || []).forEach(s => { totalEpisodes += (s.episodes || []).length; }); }
        });

        const pct = Math.min(100, (tb / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100);
        const free = FIREBASE_RTDB_FREE_LIMIT_BYTES - tb;
        let bc = '#4caf50', statusText = '✅ Saudável', statusDesc = 'Espaço de sobra';
        if (pct > 50) { bc = '#8bc34a'; statusText = '✅ Bom'; statusDesc = 'Uso moderado'; }
        if (pct > 70) { bc = '#ff9800'; statusText = '⚠️ Atenção'; statusDesc = 'Considere limpar dados'; }
        if (pct > 85) { bc = '#ff5722'; statusText = '🔴 Crítico'; statusDesc = 'Limpe dados urgente'; }
        if (pct > 95) { bc = '#f44336'; statusText = '🚨 Cheio'; statusDesc = 'Banco quase lotado!'; }

        c.innerHTML = `
            <div style="text-align:center;margin-bottom:20px">
                <div style="font-size:38px;font-weight:900;color:${bc};line-height:1">${pct.toFixed(1)}%</div>
                <div style="font-size:14px;font-weight:800;margin-top:4px">${statusText}</div>
                <div style="font-size:11px;color:#888">${statusDesc}</div>
            </div>
            <div style="margin-bottom:22px">
                <div class="storage-bar-outer">
                    <div class="storage-bar-inner" style="width:${Math.max(2, pct)}%;background:linear-gradient(90deg,${bc},${bc}dd)"></div>
                </div>
                <div class="storage-info">
                    <span>${formatBytes(tb)} usado</span>
                    <span>${formatBytes(free)} livre</span>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:22px">
                <div class="storage-icon-card">
                    <span class="sto-icon">🎬</span>
                    <div class="sto-count">${movieCount}</div>
                    <div class="sto-label">Filmes</div>
                </div>
                <div class="storage-icon-card">
                    <span class="sto-icon">📺</span>
                    <div class="sto-count">${serieCount}</div>
                    <div class="sto-label">Séries</div>
                </div>
                <div class="storage-icon-card">
                    <span class="sto-icon">🎞️</span>
                    <div class="sto-count">${totalEpisodes}</div>
                    <div class="sto-label">Episódios</div>
                </div>
            </div>
            <h4 style="font-size:12px;font-weight:800;margin-bottom:12px;color:var(--primary-color)">📊 Uso por Categoria</h4>
            <div class="storage-detail-item">
                <span class="storage-label">🎬 Catálogo (${cc} itens)</span>
                <span class="storage-value">${formatBytes(cb)}</span>
            </div>
            <div style="margin-left:20px;margin-bottom:4px">
                <div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin-top:4px">
                    <div style="height:100%;width:${tb > 0 ? (cb / tb * 100) : 0}%;background:var(--primary-color);border-radius:3px"></div>
                </div>
            </div>
            <div class="storage-detail-item">
                <span class="storage-label">👤 Usuários (${uc})</span>
                <span class="storage-value">${formatBytes(ub)}</span>
            </div>
            <div style="margin-left:20px;margin-bottom:4px">
                <div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin-top:4px">
                    <div style="height:100%;width:${tb > 0 ? (ub / tb * 100) : 0}%;background:#2196f3;border-radius:3px"></div>
                </div>
            </div>
            <div class="storage-detail-item">
                <span class="storage-label">💡 Sugestões (${scc})</span>
                <span class="storage-value">${formatBytes(sb)}</span>
            </div>
            <div style="margin-left:20px;margin-bottom:4px">
                <div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin-top:4px">
                    <div style="height:100%;width:${tb > 0 ? (sb / tb * 100) : 0}%;background:#ff9800;border-radius:3px"></div>
                </div>
            </div>
            <div class="storage-detail-item" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;margin-top:10px">
                <span class="storage-label" style="font-weight:800;color:#fff">TOTAL</span>
                <span class="storage-value" style="color:${bc};font-size:15px">${formatBytes(tb)}</span>
            </div>
            <div style="text-align:center;margin-top:18px;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.04)">
                <div style="font-size:10px;color:#666">Firebase Realtime Database — Plano Gratuito</div>
                <div style="font-size:10px;color:#555;margin-top:2px">Limite: ${formatBytes(FIREBASE_RTDB_FREE_LIMIT_BYTES)}</div>
            </div>`;
    } catch (e) {
        c.innerHTML = `<div style="text-align:center;padding:24px"><p style="color:#ff5252;font-size:14px;margin-bottom:10px">❌ Erro ao carregar</p><p style="color:#888;font-size:11px">${e.message}</p></div>`;
    }
}

// ========== PROFILE ==========
const btnSaveProfile = document.getElementById('btnSaveProfile');
if (btnSaveProfile) {
    btnSaveProfile.onclick = async () => {
        const user = auth.currentUser; if (!user) return;
        const picker = document.getElementById('themeColorPicker');
        const tc = picker ? picker.value : '#e50914'; 
        if (!isTVDevice()) applyUserTheme(tc);
        const n = document.getElementById('profileNameInput')?.value.trim() || '';
        const b = document.getElementById('profileBioInput')?.value.trim() || '';
        const fg = document.getElementById('profileFavGenreInput')?.value || 'Ação';
        const ph = document.getElementById('profilePhotoPreview')?.src || '';
        const bn = document.getElementById('profileBannerPreview')?.src || '';
        
        const data = { 
            name: n, 
            bio: b, 
            favGenre: fg, 
            photo: isValidImageUrl(ph) ? ph : '', 
            banner: isValidImageUrl(bn) ? bn : '', 
            themeColor: tc 
        };
        try { 
            await set(ref(rtdb, "users/" + user.uid), data); 
            if (n) setUserCache('name', n); 
            if (b) setUserCache('bio', b); 
            if (fg) setUserCache('fav_genre', fg); 
            if (data.photo) setUserCache('avatar', data.photo); 
            if (data.banner) setUserCache('banner', data.banner); 
            setUserCache('theme_color', tc); 
            updateUserAvatarUI(data); 
            showMsg('Salvo! ✅', 'success'); 
            closeModal('profileModal'); 
        } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
    };
}

async function loadUserProfile(user) { if (!user) return; try { const s = await get(ref(rtdb, "users/" + user.uid)); if (s.exists()) { const data = s.val(); if (data.name) setUserCache('name', data.name); if (data.bio) setUserCache('bio', data.bio); if (data.favGenre) setUserCache('fav_genre', data.favGenre); if (data.photo) setUserCache('avatar', data.photo); if (data.banner) setUserCache('banner', data.banner); if (data.themeColor) setUserCache('theme_color', data.themeColor); updateUserAvatarUI(data); if (data.themeColor && !isTVDevice()) { applyUserTheme(data.themeColor); const p = document.getElementById('themeColorPicker'); if (p) p.value = data.themeColor; } } else updateUserAvatarUI({}); } catch (e) { console.error(e); updateUserAvatarUI({}); } }

function resetProfileUI() {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setTxt('avatarText', 'U'); 
    document.getElementById('avatarImg')?.classList.add('hidden'); 
    document.getElementById('avatarText')?.classList.remove('hidden'); 
    setTxt('profileAvatarBigText', 'U'); 
    document.getElementById('profileAvatarBigImg')?.classList.add('hidden'); 
    document.getElementById('profileAvatarBigText')?.classList.remove('hidden'); 
    setTxt('profileNameDisplay', 'Usuário'); 
    setVal('profileNameInput', ''); 
    setVal('profileBioInput', ''); 
    setTxt('profileEmailDisplay', ''); 
    const pBanner = document.getElementById('profileBannerImg'); if (pBanner) pBanner.src = 'https://via.placeholder.com/600x200?text=Banner'; 
    document.getElementById('profilePhotoPreview')?.classList.add('hidden'); 
    document.getElementById('profileBannerPreview')?.classList.add('hidden'); 
    setTxt('sidebarUserName', 'Usuário'); 
    setTxt('sidebarUserEmail', 'email@exemplo.com'); 
    const sAvatar = document.getElementById('sidebarAvatar'); if (sAvatar) sAvatar.innerHTML = '<span>U</span>'; 
    setVal('themeColorPicker', '#e50914'); 
}

function updateUserAvatarUI(data = {}) {
    const un = data.name || getUserCache('name') || '', ub = data.bio || getUserCache('bio') || '', ug = data.favGenre || getUserCache('fav_genre') || '', av = data.photo || getUserCache('avatar') || '', bn = data.banner || getUserCache('banner') || '';
    const user = auth.currentUser; const letter = un ? un.charAt(0).toUpperCase() : (user ? user.email.charAt(0).toUpperCase() : 'U');
    
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    if (un) { setTxt('profileNameDisplay', un); const pName = document.getElementById('profileNameInput'); if (pName) pName.value = un; setTxt('sidebarUserName', un); } 
    else if (user) { const name = user.email.split('@')[0]; setTxt('sidebarUserName', name); setTxt('profileNameDisplay', name); }
    if (user) setTxt('sidebarUserEmail', user.email);
    if (ub) { setTxt('profileBioDisplay', `"${ub}"`); const pBio = document.getElementById('profileBioInput'); if (pBio) pBio.value = ub; }
    if (ug) { const pGenre = document.getElementById('profileFavGenreInput'); if (pGenre) pGenre.value = ug; }
    if (bn) { const bImg = document.getElementById('profileBannerImg'); if (bImg) bImg.src = bn; const bPrev = document.getElementById('profileBannerPreview'); if (bPrev) { bPrev.src = bn; bPrev.classList.remove('hidden'); } }
    
    const sa = document.getElementById('sidebarAvatar'); if (sa) sa.innerHTML = '';
    if (av) { 
        const aImg = document.getElementById('avatarImg'); if (aImg) { aImg.src = av; aImg.classList.remove('hidden'); }
        document.getElementById('avatarText')?.classList.add('hidden'); 
        const abImg = document.getElementById('profileAvatarBigImg'); if (abImg) { abImg.src = av; abImg.classList.remove('hidden'); }
        document.getElementById('profileAvatarBigText')?.classList.add('hidden'); 
        const pPhoto = document.getElementById('profilePhotoPreview'); if (pPhoto) { pPhoto.src = av; pPhoto.classList.remove('hidden'); }
        if (sa) { const img = document.createElement('img'); img.src = av; sa.appendChild(img); }
    } else { 
        setTxt('avatarText', letter); setTxt('profileAvatarBigText', letter); 
        if (sa) sa.innerHTML = `<span>${letter}</span>`; 
    }
}

async function handleLogout() { 
    try { 
        currentUserUid = null; 
        await signOut(auth); 
        resetProfileUI(); 
        document.documentElement.style.setProperty('--primary-color', '#e50914'); 
        closeModal('profileModal'); 
        closeSidebar(); 
        activeItem = null; 
        mediaCatalog = []; 
        isAdmin = false; 
        renderApp();
        showMsg('Saiu! 👋', 'success'); 
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); } 
}
const btnLogout = document.getElementById('btnLogout'); if (btnLogout) btnLogout.onclick = handleLogout;

// ========== AUTH ==========
const toggleAuth = document.getElementById('toggleAuthMode');
if (toggleAuth) {
    toggleAuth.onclick = () => { 
        isSignUpMode = !isSignUpMode; 
        const sub = document.getElementById('authSubtitle'); if (sub) sub.innerText = isSignUpMode ? 'Crie sua conta gratuita' : 'Entre na sua conta para continuar'; 
        const btn = document.getElementById('btnAuthSubmit'); if (btn) btn.innerText = isSignUpMode ? 'Criar Conta' : 'Entrar na Conta'; 
        toggleAuth.innerHTML = isSignUpMode ? 'Já tem conta? <span style="color:var(--primary-color)">Entrar</span>' : 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>'; 
    };
}

const authForm = document.getElementById('authForm');
if (authForm) {
    authForm.onsubmit = async (e) => { 
        e.preventDefault(); if (authProcessing) return; 
        authProcessing = true; 
        const sb = document.getElementById('btnAuthSubmit'); const ot = sb ? sb.innerText : ''; 
        if (sb) { sb.innerText = '⏳ Aguarde...'; sb.disabled = true; }
        const email = document.getElementById('authEmail')?.value.trim().toLowerCase(); 
        const pass = document.getElementById('authPassword')?.value; 
        if (!email || !pass || pass.length < 6) { 
            showMsg('Preencha! Senha mín 6', 'error'); 
            authProcessing = false; 
            if (sb) { sb.innerText = ot; sb.disabled = false; }
            return; 
        } 
        try { 
            if (isSignUpMode) { 
                const cred = await createUserWithEmailAndPassword(auth, email, pass); 
                await set(ref(rtdb, "users/" + cred.user.uid), { name: email.split('@')[0], bio: '', favGenre: 'Ação', photo: '', banner: '', themeColor: '#e50914', createdAt: Date.now() }); 
                showMsg('Conta criada! ✅', 'success'); 
            } else { 
                await signInWithEmailAndPassword(auth, email, pass); 
                showMsg('Bem-vindo! 🎬', 'success'); 
            } 
            closeModal('authOverlay'); 
        } catch (err) { showMsg(translateAuthError(err.code), 'error'); } 
        authProcessing = false; 
        if (sb) { sb.innerText = ot; sb.disabled = false; }
    };
}

// ========== MODALS ==========
document.getElementById('btnOpenProfile')?.addEventListener('click', () => openModal('profileModal'));
document.getElementById('btnCloseProfile')?.addEventListener('click', () => closeModal('profileModal'));
document.getElementById('btnCloseCreator')?.addEventListener('click', () => closeModal('creatorModal'));

// ========== INIT ==========
clearLegacyCache();
renderGenreSelector();

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUid = user.uid; resetProfileUI(); closeModal('authOverlay');
        const emailDisp = document.getElementById('profileEmailDisplay'); if (emailDisp) emailDisp.innerText = user.email;
        isAdmin = user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
        ['profileAdminBadge', 'sidebarAdminItem', 'sidebarCreatorItem', 'sidebarSuggestionsAdminItem', 'sidebarStorageItem'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !isAdmin));
        loadUserProfile(user); loadCatalog();
    } else {
        currentUserUid = null; isAdmin = false; resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        openModal('authOverlay');
        ['sidebarAdminItem', 'sidebarCreatorItem', 'sidebarSuggestionsAdminItem', 'sidebarStorageItem', 'profileAdminBadge'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        isSignUpMode = false;
        const sub = document.getElementById('authSubtitle'); if (sub) sub.innerText = 'Entre na sua conta para continuar';
        const btn = document.getElementById('btnAuthSubmit'); if (btn) btn.innerText = 'Entrar na Conta';
        if (toggleAuth) toggleAuth.innerHTML = 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>';
    }
});

// ========== TV D-PAD ==========
document.addEventListener('keydown', (e) => {
    if (isPlayerOpen()) return;
    if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009) {
        const modals = ['detailsModal', 'profileModal', 'adminModal', 'creatorModal', 'suggestionModal', 'suggestionsAdminModal', 'storageModal', 'cropperModal'];
        for (const id of modals) { const m = document.getElementById(id); if (m && !m.classList.contains('hidden')) { closeModal(id); e.preventDefault(); return; } }
        if (document.getElementById('sidebarMenu')?.classList.contains('active')) { closeSidebar(); e.preventDefault(); }
    }
});

