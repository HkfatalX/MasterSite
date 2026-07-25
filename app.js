import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
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

// Player
let currentVideoUrl = '';
let currentSources = [];
let currentSourceIndex = 0;
let currentPlayerMeta = { mainTitle: '', subTitle: '' };
let playerErrorTimer = null;
let isStretchMode = false;

// Builders
let movieSourcesBuilder = [];
let episodeSourcesBuilder = [];

// Audio
let audioCtx = null;
let audioGainNode = null;
let boostedElements = new WeakSet();
let audioBoostLevel = 100;
let overlayCleanerInterval = null;

// ═══════════════════════════════════════════════════════════════
// PROVIDER ADAPTERS
// ═══════════════════════════════════════════════════════════════
const PROVIDER_ADAPTERS = {
    mixdrop: { name: 'MixDrop', color: '#00c6ff', icon: '🎬', errorLoadMs: 15000,
        formatUrl(url) { let f = url.trim(); if (f.includes('/f/')) f = f.replace('/f/', '/e/'); else if (!f.includes('/e/')) { const m = f.match(/(?:mixdrop\.[a-z]+)\/(?:e\/|f\/)?([a-zA-Z0-9]+)/); if (m?.[1]) f = `https://mixdrop.ag/e/${m[1]}`; } return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-popups-to-escape-sandbox'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    },
    streamtape: { name: 'StreamTape', color: '#f5a623', icon: '📼', errorLoadMs: 15000,
        formatUrl(url) { let f = url.trim(); if (f.includes('/v/')) f = f.replace('/v/', '/e/'); else if (!f.includes('/e/')) { const m = f.match(/streamtape\.[a-z]+\/(?:v|e)\/([a-zA-Z0-9]+)/); if (m?.[1]) f = `https://streamtape.com/e/${m[1]}`; } return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    },
    filemoon: { name: 'FileMoon', color: '#8e44ad', icon: '🌙', errorLoadMs: 20000,
        formatUrl(url) { let f = url.trim(); if (!f.includes('/e/') && !f.includes('/embed')) { const m = f.match(/filemoon\.[a-z]+\/(?:d\/|e\/)?([a-zA-Z0-9]+)/); if (m?.[1]) f = `https://filemoon.sx/e/${m[1]}`; } return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    },
    voe: { name: 'VOE', color: '#ff4757', icon: '⚡', errorLoadMs: 20000,
        formatUrl(url) { return url.trim(); },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    },
    doodstream: { name: 'DoodStream', color: '#f39c12', icon: '🔥', errorLoadMs: 25000,
        formatUrl(url) { let f = url.trim(); if (f.includes('/d/')) f = f.replace('/d/', '/e/'); else if (!f.includes('/e/')) { const m = f.match(/(?:dood[a-z0-9]*\.[a-z]+)\/(?:d\/|e\/)?([a-zA-Z0-9]+)/); if (m?.[1]) { const dm = f.match(/(https?:\/\/[^\/]+)/); f = `${dm?.[1] || 'https://dood.li'}/e/${m[1]}`; } } return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    },
    mp4upload: { name: 'Mp4Upload', color: '#3498db', icon: '📤', errorLoadMs: 15000,
        formatUrl(url) { let f = url.trim(); if (!f.includes('/embed')) { const m = f.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/); if (m?.[1]) f = `https://www.mp4upload.com/embed-${m[1]}.html`; } return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    },
    okru: { name: 'OK.ru', color: '#ee8208', icon: '📡', errorLoadMs: 15000,
        formatUrl(url) { let f = url.trim(); const m = f.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/); if (m?.[1]) f = `https://ok.ru/videoembed/${m[1]}`; return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-forms'); return i; }
    },
    drive: { name: 'Google Drive', color: '#4285f4', icon: '💾', errorLoadMs: 15000,
        formatUrl(url) { let f = url.trim(); const m = f.match(/\/d\/([a-zA-Z0-9_-]+)/); if (m?.[1]) f = `https://drive.google.com/file/d/${m[1]}/preview`; else if (f.includes('open?id=')) { const m2 = f.match(/id=([a-zA-Z0-9_-]+)/); if (m2?.[1]) f = `https://drive.google.com/file/d/${m2[1]}/preview`; } return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation'); return i; }
    },
    yourupload: { name: 'YourUpload', color: '#27ae60', icon: '⬆️', errorLoadMs: 15000,
        formatUrl(url) { let f = url.trim(); if (!f.includes('/embed/')) { const m = f.match(/yourupload\.com\/(?:watch|embed)\/([a-zA-Z0-9]+)/); if (m?.[1]) f = `https://www.yourupload.com/embed/${m[1]}`; } return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    },
    youtube: { name: 'YouTube', color: '#ff0000', icon: '▶️', errorLoadMs: 10000,
        formatUrl(url) { let f = url.trim(); const m = f.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/); if (m?.[1]) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`; return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups'); return i; }
    },
    vimeo: { name: 'Vimeo', color: '#17d5ff', icon: '🎥', errorLoadMs: 10000,
        formatUrl(url) { let f = url.trim(); const m = f.match(/vimeo\.com\/(?:video\/)?(\d+)/); if (m?.[1]) f = `https://player.vimeo.com/video/${m[1]}?autoplay=1`; return f; },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation'); return i; }
    },
    direct: { name: 'Vídeo Direto', color: '#4caf50', icon: '📹', errorLoadMs: 20000,
        formatUrl(url) { return url.trim(); },
        createElement(url) { const v = document.createElement('video'); v.src = url; v.controls = true; v.autoplay = true; v.playsInline = true; return v; }
    },
    other: { name: 'Outro', color: '#888', icon: '🔗', errorLoadMs: 20000,
        formatUrl(url) { return url.trim(); },
        createElement(url) { const i = document.createElement('iframe'); i.src = url; i.setAttribute('allowfullscreen','true'); i.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media'); i.setAttribute('scrolling','no'); i.setAttribute('frameborder','0'); i.setAttribute('referrerpolicy','no-referrer'); return i; }
    }
};

function getAdapter(type) { return PROVIDER_ADAPTERS[type] || PROVIDER_ADAPTERS.other; }
function detectSourceType(url) { if (!url) return 'other'; const u = url.toLowerCase(); if (u.includes('mixdrop')) return 'mixdrop'; if (u.includes('streamtape')) return 'streamtape'; if (u.includes('filemoon')) return 'filemoon'; if (u.includes('voe.sx')||u.includes('voe.')) return 'voe'; if (u.includes('dood')||u.includes('d0000d')||u.includes('dooood')) return 'doodstream'; if (u.includes('mp4upload')) return 'mp4upload'; if (u.includes('ok.ru')) return 'okru'; if (u.includes('drive.google')) return 'drive'; if (u.includes('yourupload')) return 'yourupload'; if (u.includes('youtube.com')||u.includes('youtu.be')) return 'youtube'; if (u.includes('vimeo.com')) return 'vimeo'; if (/\.(mp4|m3u8|webm)(\?|$)/i.test(u)) return 'direct'; return 'other'; }
function sourceTypeLabel(type) { return getAdapter(type).name; }
function normalizeSources(item) { if (Array.isArray(item.videoSources) && item.videoSources.length > 0) return item.videoSources; if (item.videoUrl?.trim()) { const t = detectSourceType(item.videoUrl); return [{ type: t, label: sourceTypeLabel(t), url: item.videoUrl.trim() }]; } return []; }
function normalizeEpisodeSources(ep) { if (Array.isArray(ep.videoSources) && ep.videoSources.length > 0) return ep.videoSources; if (ep.videoUrl?.trim()) { const t = detectSourceType(ep.videoUrl); return [{ type: t, label: sourceTypeLabel(t), url: ep.videoUrl.trim() }]; } return []; }

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function isTVDevice() { return /smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(navigator.userAgent.toLowerCase()); }
function isTV() { return isTVDevice() || (window.innerWidth >= 1920 && !('ontouchstart' in window)); }
(function setupTV() { if (isTV()) document.body.classList.add('tv-mode'); window.addEventListener('resize', () => document.body.classList.toggle('tv-mode', isTV())); })();

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); document.body.classList.add('modal-open'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); document.body.classList.remove('modal-open'); }
function normalizeText(t) { return t ? t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim() : ''; }
function getPosterUrl(i) { return i.coverUrl || i.backdropUrl || ''; }
function getBackdropUrl(i) { return i.backdropUrl || i.coverUrl || ''; }
function getItemGenres(i) { if (Array.isArray(i.genres) && i.genres.length) return i.genres; return i.category ? [i.category] : []; }
function itemMatchesCategory(i, c) { if (c === "Todos") return true; if (c === "Filmes") return i.type === "movie"; if (c === "Séries") return i.type === "serie"; return getItemGenres(i).includes(c); }
function showMsg(text, type) { const m = document.getElementById('msg'); if (!m) return; m.innerText = text; m.className = type === 'success' ? 'msg-success' : type === 'info' ? 'msg-info' : 'msg-error'; m.classList.remove('hidden'); setTimeout(() => m.classList.add('hidden'), 4000); }
function isValidImageUrl(url) { if (!url) return false; if (url.includes(window.location.origin)) return false; return url.startsWith('http') || url.startsWith('data:image'); }
function formatBytes(b) { if (b === 0) return '0 B'; const k = 1024; const s = ['B','KB','MB','GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i]; }
function estimateJsonBytes(obj) { try { return new Blob([JSON.stringify(obj)]).size; } catch { return JSON.stringify(obj).length * 2; } }
function timeAgo(ts) { const d = Date.now() - ts; const min = Math.floor(d / 60000); if (min < 1) return 'agora'; if (min < 60) return `${min}m`; const h = Math.floor(min / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; }
function translateAuthError(c) { return ({ 'auth/email-already-in-use':'E-mail já cadastrado!','auth/invalid-email':'E-mail inválido.','auth/weak-password':'Senha fraca (mín 6).','auth/user-not-found':'Conta não encontrada.','auth/wrong-password':'Senha incorreta.','auth/invalid-credential':'E-mail ou senha incorretos.','auth/too-many-requests':'Muitas tentativas.','auth/network-request-failed':'Sem internet.' })[c] || `Erro: ${c}`; }

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════
function getUserCacheKey(k) { return currentUserUid ? `mfx_${currentUserUid}_${k}` : null; }
function setUserCache(k, v) { const key = getUserCacheKey(k); if (key && v) localStorage.setItem(key, v); }
function getUserCache(k) { const key = getUserCacheKey(k); return key ? localStorage.getItem(key) : null; }
function clearLegacyCache() { ['masterflix_user_name','masterflix_user_bio','masterflix_user_fav_genre','masterflix_user_avatar','masterflix_user_banner'].forEach(k => localStorage.removeItem(k)); }
function applyUserTheme(c) { if (!c || isTVDevice()) return; document.documentElement.style.setProperty('--primary-color', c); localStorage.setItem('masterflix_theme_color', c); if (currentUserUid) setUserCache('theme_color', c); }
if (!isTVDevice()) { const sc = localStorage.getItem('masterflix_theme_color'); if (sc) document.documentElement.style.setProperty('--primary-color', sc); }
window.onscroll = () => { const h = document.getElementById('mainHeader'); if (h) h.classList.toggle('scrolled', window.scrollY > 50); };

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════
function openSidebar() { document.getElementById('sidebarMenu')?.classList.add('active'); document.getElementById('sidebarOverlay')?.classList.add('active'); document.getElementById('menuToggleBtn')?.classList.add('active'); document.body.classList.add('modal-open'); }
function closeSidebar() { document.getElementById('sidebarMenu')?.classList.remove('active'); document.getElementById('sidebarOverlay')?.classList.remove('active'); document.getElementById('menuToggleBtn')?.classList.remove('active'); document.body.classList.remove('modal-open'); }
document.getElementById('menuToggleBtn')?.addEventListener('click', () => document.getElementById('sidebarMenu')?.classList.contains('active') ? closeSidebar() : openSidebar());
document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeSidebar);
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

document.querySelectorAll('.sidebar-item').forEach(item => {
    item.onclick = () => {
        const a = item.dataset.nav;
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        if (['home','movies','series','continue'].includes(a)) item.classList.add('active');
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

// ═══════════════════════════════════════════════════════════════
// GENRE
// ═══════════════════════════════════════════════════════════════
function renderGenreSelector() {
    const c = document.getElementById('genreSelectorContainer'); if (!c) return; c.innerHTML = '';
    AVAILABLE_GENRES.forEach(g => { const t = document.createElement('div'); t.className = 'genre-tag'; if (selectedGenres.includes(g)) t.classList.add('selected'); t.textContent = g; t.onclick = () => { const i = selectedGenres.indexOf(g); if (i >= 0) selectedGenres.splice(i, 1); else selectedGenres.push(g); renderGenreSelector(); }; c.appendChild(t); });
    const ct = document.getElementById('genreCounter'); if (ct) { ct.textContent = selectedGenres.length === 0 ? '⚠️ Selecione ao menos 1' : `✓ ${selectedGenres.length}: ${selectedGenres.join(', ')}`; ct.style.color = selectedGenres.length === 0 ? '#ff9800' : 'var(--primary-color)'; }
}

// ═══════════════════════════════════════════════════════════════
// MOVIE SOURCES BUILDER
// ═══════════════════════════════════════════════════════════════
function renderMovieSources() {
    const container = document.getElementById('movieSourcesList'); if (!container) return; container.innerHTML = '';
    if (movieSourcesBuilder.length === 0) { container.innerHTML = '<div class="source-empty-state">Nenhuma fonte. Clique em <strong>+ Adicionar Fonte</strong>.</div>'; return; }
    const tmpl = document.getElementById('videoSourceItemTemplate');
    movieSourcesBuilder.forEach((src, idx) => {
        const clone = tmpl.content.cloneNode(true); const card = clone.querySelector('.source-item-card');
        card.querySelector('.source-item-badge').textContent = `Fonte ${idx + 1}`;
        const ts = card.querySelector('.source-type-select'); ts.value = src.type || '';
        const ti = card.querySelector('.source-title-input'); ti.value = src.label || '';
        const ui = card.querySelector('.source-url-input'); ui.value = src.url || '';
        const usedTypes = movieSourcesBuilder.filter((_, i) => i !== idx).map(s => s.type).filter(t => t && t !== 'other');
        Array.from(ts.options).forEach(opt => { if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) { opt.disabled = true; if (!opt.text.includes('(já)')) opt.text += ' (já)'; } });
        if (src.type) { const p = document.createElement('div'); p.className = 'source-preview-tag'; const ad = getAdapter(src.type); p.textContent = `${ad.icon} ${ad.name}`; card.appendChild(p); }
        ts.onchange = () => { const nt = ts.value; if (nt && nt !== 'other' && movieSourcesBuilder.some((s, i) => i !== idx && s.type === nt)) { showMsg(`Já existe "${sourceTypeLabel(nt)}"!`, 'error'); ts.value = src.type || ''; return; } movieSourcesBuilder[idx].type = nt; if (!movieSourcesBuilder[idx].label && nt) movieSourcesBuilder[idx].label = sourceTypeLabel(nt); renderMovieSources(); };
        ti.oninput = () => { movieSourcesBuilder[idx].label = ti.value; };
        ui.oninput = () => { movieSourcesBuilder[idx].url = ui.value; if (!movieSourcesBuilder[idx].type && ui.value) { const d = detectSourceType(ui.value); if (d !== 'other' && !movieSourcesBuilder.some((s, i) => i !== idx && s.type === d)) { movieSourcesBuilder[idx].type = d; if (!movieSourcesBuilder[idx].label) movieSourcesBuilder[idx].label = sourceTypeLabel(d); renderMovieSources(); } } };
        card.querySelector('[data-action="remove-source"]').onclick = () => { movieSourcesBuilder.splice(idx, 1); renderMovieSources(); };
        container.appendChild(card);
    });
}
document.getElementById('btnAddMovieSource')?.addEventListener('click', () => { movieSourcesBuilder.push({ type: '', label: '', url: '' }); renderMovieSources(); });

// ═══════════════════════════════════════════════════════════════
// EPISODE SOURCES BUILDER
// ═══════════════════════════════════════════════════════════════
function ensureEpSources(si, ei) { if (!episodeSourcesBuilder[si]) episodeSourcesBuilder[si] = []; if (!episodeSourcesBuilder[si][ei]) episodeSourcesBuilder[si][ei] = []; }
function renderEpisodeSources(si, ei, el) {
    if (!el) return; el.innerHTML = '';
    const sources = (episodeSourcesBuilder[si]?.[ei]) || []; const tmpl = document.getElementById('videoSourceItemTemplate');
    if (!sources.length) { el.innerHTML = '<div class="source-empty-state" style="font-size:11px">Nenhuma fonte.</div>'; return; }
    sources.forEach((src, sidx) => {
        const clone = tmpl.content.cloneNode(true); const card = clone.querySelector('.source-item-card');
        card.querySelector('.source-item-badge').textContent = `Fonte ${sidx + 1}`;
        const ts = card.querySelector('.source-type-select'); ts.value = src.type || '';
        const ti = card.querySelector('.source-title-input'); ti.value = src.label || '';
        const ui = card.querySelector('.source-url-input'); ui.value = src.url || '';
        const usedTypes = sources.filter((_, i) => i !== sidx).map(s => s.type).filter(t => t && t !== 'other');
        Array.from(ts.options).forEach(opt => { if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) opt.disabled = true; });
        ts.onchange = () => { const nt = ts.value; if (nt && nt !== 'other' && sources.some((s, i) => i !== sidx && s.type === nt)) { showMsg(`Duplicado!`, 'error'); ts.value = src.type || ''; return; } episodeSourcesBuilder[si][ei][sidx].type = nt; if (!episodeSourcesBuilder[si][ei][sidx].label && nt) episodeSourcesBuilder[si][ei][sidx].label = sourceTypeLabel(nt); renderEpisodeSources(si, ei, el); };
        ti.oninput = () => { episodeSourcesBuilder[si][ei][sidx].label = ti.value; };
        ui.oninput = () => { episodeSourcesBuilder[si][ei][sidx].url = ui.value; };
        card.querySelector('[data-action="remove-source"]').onclick = () => { episodeSourcesBuilder[si][ei].splice(sidx, 1); renderEpisodeSources(si, ei, el); };
        el.appendChild(card);
    });
}

// ═══════════════════════════════════════════════════════════════
// CROPPER
// ═══════════════════════════════════════════════════════════════
window.triggerCropModal = function (inputId, previewId, ar) {
    const fi = document.getElementById(inputId); currentTargetPreview = document.getElementById(previewId); if (!fi) return;
    fi.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { const tmp = new Image(); tmp.onload = () => { if (tmp.naturalWidth <= 800 && tmp.naturalHeight <= 800) { if (currentTargetPreview) { currentTargetPreview.src = ev.target.result; currentTargetPreview.classList.remove('hidden'); } fi.value = ""; return; } const cropImg = document.getElementById('cropperImage'); if (cropImg) cropImg.src = ev.target.result; if (!document.getElementById('profileModal')?.classList.contains('hidden')) { previousModal = 'profileModal'; closeModal('profileModal'); } else if (!document.getElementById('creatorModal')?.classList.contains('hidden')) { previousModal = 'creatorModal'; closeModal('creatorModal'); } openModal('cropperModal'); if (cropperInstance) cropperInstance.destroy(); cropperInstance = new Cropper(cropImg, { aspectRatio: ar || NaN, viewMode: 1, autoCropArea: 1, responsive: true, crop() { const cv = cropperInstance.getCroppedCanvas({ width: 800 }); if (cv) { const u = cv.toDataURL('image/jpeg', 0.9); ['prevMobile','prevPC','prevTV'].forEach(id => { const el = document.getElementById(id); if (el) el.src = u; }); } } }); }; tmp.src = ev.target.result; }; reader.readAsDataURL(file); }; fi.click();
};
document.getElementById('btnConfirmCrop')?.addEventListener('click', () => { if (!cropperInstance) return; const cv = cropperInstance.getCroppedCanvas({ width: 1200 }); if (cv && currentTargetPreview) { currentTargetPreview.src = cv.toDataURL('image/jpeg', 0.92); currentTargetPreview.classList.remove('hidden'); } closeModal('cropperModal'); if (previousModal) openModal(previousModal); cropperInstance?.destroy(); });
document.getElementById('btnCloseCropper')?.addEventListener('click', () => { closeModal('cropperModal'); if (previousModal) openModal(previousModal); cropperInstance?.destroy(); });

// ═══════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════
const searchBox = document.getElementById('searchBox'), searchInput = document.getElementById('searchInput'), searchDropdown = document.getElementById('searchResultsDropdown');
document.getElementById('searchIconBtn')?.addEventListener('click', (e) => { e.stopPropagation(); if (searchBox?.classList.contains('active')) { if (!searchInput?.value.trim()) searchBox.classList.remove('active'); } else { searchBox?.classList.add('active'); setTimeout(() => searchInput?.focus(), 250); } });
searchInput?.addEventListener('input', () => { const v = searchInput.value.trim(); if (v) { searchBox?.classList.add('has-text'); renderSearchDropdown(v); } else { searchBox?.classList.remove('has-text'); searchDropdown?.classList.remove('visible'); } });
document.getElementById('searchClearBtn')?.addEventListener('click', (e) => { e.stopPropagation(); if (searchInput) searchInput.value = ''; searchBox?.classList.remove('has-text'); searchDropdown?.classList.remove('visible'); searchInput?.focus(); });
function smartSearch(q) { const nq = normalizeText(q); if (!nq) return []; const sc = []; mediaCatalog.forEach(i => { const t = normalizeText(i.title); if (!t) return; let s = 0; if (t === nq) s = 10000; else if (t.startsWith(nq)) s = 1000 - t.length; else if (t.includes(nq)) s = 100 - t.length; else { const words = nq.split(' ').filter(w => w); const mc = words.filter(w => t.includes(w)).length; if (mc) s = mc * 20; } if (s > 0) sc.push({ item: i, score: s }); }); sc.sort((a, b) => b.score - a.score); return sc.slice(0, 10).map(s => s.item); }
function highlightMatch(t, q) { const nt = normalizeText(t), nq = normalizeText(q), i = nt.indexOf(nq); if (i === -1) return t; return t.substring(0, i) + '<mark>' + t.substring(i, i + q.length) + '</mark>' + t.substring(i + q.length); }
function renderSearchDropdown(query) { if (!searchDropdown) return; const results = smartSearch(query); searchDropdown.innerHTML = ''; if (!results.length) { searchDropdown.innerHTML = `<div class="search-no-results"><span class="search-empty-icon">🔍</span><div>Nenhum resultado</div></div>`; } else { searchDropdown.innerHTML = `<div class="search-results-header">🔍 ${results.length} resultado(s)</div>`; results.forEach(item => { const d = document.createElement('div'); d.className = 'search-result-item'; d.tabIndex = 0; const p = getPosterUrl(item); const tl = item.type === 'movie' ? 'Filme' : 'Série'; const gs = getItemGenres(item); d.innerHTML = `<img class="search-result-thumb" src="${p}" loading="lazy" onerror="this.style.display='none'"><div class="search-result-info"><div class="search-result-title">${highlightMatch(item.title, query)}</div><div class="search-result-meta"><span class="type-badge">${tl}</span>${item.year ? '<span>' + item.year + '</span>' : ''}${gs.length ? '<span>' + gs.slice(0, 2).join(', ') + '</span>' : ''}</div></div>`; d.onclick = () => { searchDropdown.classList.remove('visible'); searchInput.value = ''; searchBox?.classList.remove('has-text'); window.location.hash = `#/midia/${item.id}`; openDetails(item); }; d.onkeydown = (e) => { if (e.key === 'Enter') d.click(); }; searchDropdown.appendChild(d); }); } searchDropdown.classList.add('visible'); }
document.addEventListener('click', (e) => { const w = document.getElementById('searchWrapper'); if (w && !w.contains(e.target)) { searchDropdown?.classList.remove('visible'); if (!searchInput?.value.trim()) searchBox?.classList.remove('active'); } });

// ═══════════════════════════════════════════════════════════════
// HASH / MEDIA TYPE / SEASONS
// ═══════════════════════════════════════════════════════════════
function handleHashRouting() { const h = window.location.hash; if (h.startsWith('#/midia/')) { const i = mediaCatalog.find(m => m.id === h.replace('#/midia/', '')); if (i) openDetails(i); } }
window.addEventListener('hashchange', handleHashRouting);
document.getElementById('mediaType')?.addEventListener('change', (e) => { const t = e.target.value; document.getElementById('movieFileArea')?.classList.toggle('hidden', t !== 'movie'); document.getElementById('seriesBuilderArea')?.classList.toggle('hidden', t === 'movie'); const lbl = document.getElementById('mediaDurationLabel'); if (lbl) lbl.innerText = t === 'movie' ? "Duração (Ex: 2h 10m)" : "Duração Média (Ex: 45m/ep)"; if (t === 'serie' && !seasonsBuilder.length) addSeason(); });
function renderSeasonsBuilder() { const c = document.getElementById('seasonsList'); if (!c) return; c.innerHTML = ''; seasonsBuilder.forEach((s, si) => { const d = document.createElement('div'); d.style.cssText = "background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin-top:14px;"; d.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:10px;"><strong style="color:var(--primary-color);">T${si + 1}</strong><button type="button" class="btn-secondary" style="font-size:11px">+ EP</button></div><div class="input-group"><label>Foto Temporada</label><div class="file-upload-box" id="sCB_${si}"><span class="file-upload-label">📁</span><input type="file" id="seasonCoverFile_${si}" accept="image/*" class="hidden"><img id="seasonCoverPrev_${si}" src="${s.seasonCoverUrl || ''}" class="file-preview-img ${s.seasonCoverUrl ? '' : 'hidden'}"></div></div><div id="epLB_${si}"></div>`; c.appendChild(d); d.querySelector('.btn-secondary').onclick = () => { const ei = seasonsBuilder[si].episodes.length; seasonsBuilder[si].episodes.push({ title: `Episódio ${ei + 1}`, duration: '45m', thumbUrl: '' }); ensureEpSources(si, ei); renderSeasonsBuilder(); }; d.querySelector(`#sCB_${si}`).onclick = () => triggerCropModal(`seasonCoverFile_${si}`, `seasonCoverPrev_${si}`, 16/9); const el = d.querySelector(`#epLB_${si}`); (s.episodes || []).forEach((ep, ei) => { ensureEpSources(si, ei); const ed = document.createElement('div'); ed.style.cssText = "background:#111;padding:12px;margin-top:10px;border-radius:8px;"; ed.innerHTML = `<strong style="font-size:10px;color:#888;">EP ${ei + 1}</strong><div class="input-group"><label>Título</label><input type="text" id="epTitle_${si}_${ei}" value="${ep.title || ''}"></div><div class="input-group"><label>Duração</label><input type="text" id="epDuration_${si}_${ei}" value="${ep.duration || ''}"></div><div class="input-group"><label>Thumb</label><div class="file-upload-box" id="eTB_${si}_${ei}"><span class="file-upload-label">📸</span><input type="file" id="epThumbFile_${si}_${ei}" accept="image/*" class="hidden"><img id="epThumbPrev_${si}_${ei}" src="${ep.thumbUrl || ''}" class="file-preview-img ${ep.thumbUrl ? '' : 'hidden'}"></div></div><div class="input-group"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><label style="margin-bottom:0">🎞️ Fontes</label><button type="button" class="btn-secondary" style="font-size:10px">+ Fonte</button></div><div id="eSC_${si}_${ei}"></div></div>`; el.appendChild(ed); ed.querySelector(`#eTB_${si}_${ei}`).onclick = () => triggerCropModal(`epThumbFile_${si}_${ei}`, `epThumbPrev_${si}_${ei}`, 16/9); ed.querySelectorAll('.btn-secondary')[0].onclick = () => { ensureEpSources(si, ei); episodeSourcesBuilder[si][ei].push({ type: '', label: '', url: '' }); renderEpisodeSources(si, ei, ed.querySelector(`#eSC_${si}_${ei}`)); }; renderEpisodeSources(si, ei, ed.querySelector(`#eSC_${si}_${ei}`)); }); }); }
function addSeason() { const si = seasonsBuilder.length; seasonsBuilder.push({ seasonNumber: si + 1, seasonCoverUrl: '', episodes: [{ title: 'Episódio 1', duration: '45m', thumbUrl: '' }] }); if (!episodeSourcesBuilder[si]) episodeSourcesBuilder[si] = []; if (!episodeSourcesBuilder[si][0]) episodeSourcesBuilder[si][0] = []; renderSeasonsBuilder(); }
document.getElementById('btnAddSeasonBtn')?.addEventListener('click', addSeason);

// ═══════════════════════════════════════════════════════════════
// CATALOG / CONTINUE / RENDER
// ═══════════════════════════════════════════════════════════════
async function loadCatalog() { try { const snap = await get(ref(rtdb, "catalog")); mediaCatalog = []; if (snap.exists()) { const d = snap.val(); for (let k in d) { const i = { id: k, ...d[k] }; if (!Array.isArray(i.genres)) i.genres = i.category ? [i.category] : []; mediaCatalog.push(i); } } renderApp(); renderAdminCatalogList(); handleHashRouting(); } catch (e) { showMsg('Erro: ' + e.message, 'error'); } }
function getContinueList() { if (!currentUserUid) return []; try { return JSON.parse(localStorage.getItem(`mfx_${currentUserUid}_continue`) || '[]'); } catch { return []; } }
function saveContinueList(list) { if (currentUserUid) localStorage.setItem(`mfx_${currentUserUid}_continue`, JSON.stringify(list)); }
function cleanExpiredContinue() { let list = getContinueList(); const now = Date.now(); const b = list.length; list = list.filter(i => (now - (i.lastWatched || 0)) < CONTINUE_EXPIRE_MS); if (list.length !== b) saveContinueList(list); return list; }
function saveContinueWatching(mi, extra = '', episodeInfo = null) { if (!currentUserUid) return; let cl = getContinueList(); cl = cl.filter(i => i.id !== mi.id); cl.unshift({ id: mi.id, title: mi.title, type: mi.type, coverUrl: getBackdropUrl(mi) || getPosterUrl(mi), duration: mi.duration || extra, lastWatched: Date.now(), episodeInfo }); if (cl.length > 30) cl.pop(); saveContinueList(cl); renderContinueWatching(); }
function removeContinueItem(id) { saveContinueList(getContinueList().filter(i => i.id !== id)); renderContinueWatching(); }
function getContinueInfo(id) { return getContinueList().find(i => i.id === id) || null; }
function renderContinueWatching() { const cr = document.getElementById('continueRow'), cc = document.getElementById('continueCarousel'); if (!cr || !cc) return; cc.innerHTML = ''; if (!currentUserUid) { cr.classList.add('hidden'); return; } let list = cleanExpiredContinue(); if (selectedCategory === "Filmes") list = list.filter(i => i.type === 'movie'); else if (selectedCategory === "Séries") list = list.filter(i => i.type === 'serie'); else if (selectedCategory !== "Todos") list = list.filter(i => { const o = mediaCatalog.find(m => m.id === i.id); return o && getItemGenres(o).includes(selectedCategory); }); if (!list.length) { cr.classList.add('hidden'); return; } cr.classList.remove('hidden'); list.forEach(item => { const card = document.createElement('div'); card.className = 'continue-card'; card.tabIndex = 0; const epText = item.episodeInfo ? `<div class="continue-ep-badge">▶ ${item.episodeInfo}</div>` : ''; card.innerHTML = `<img src="${item.coverUrl || ''}" loading="lazy"><button class="continue-remove-btn" aria-label="Remover">✕</button><div class="continue-play-icon">▶</div><div class="continue-info"><div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</div>${epText}<div class="continue-duration">${item.lastWatched ? '🕐 ' + timeAgo(item.lastWatched) : ''}</div></div>`; card.querySelector('.continue-remove-btn').onclick = (e) => { e.stopPropagation(); removeContinueItem(item.id); }; card.onclick = () => { const o = mediaCatalog.find(m => m.id === item.id); if (o) openDetails(o); }; cc.appendChild(card); }); }
function renderApp() { const mc = document.getElementById('moviesCarousel'), sc = document.getElementById('seriesCarousel'), mr = document.getElementById('moviesRow'), sr = document.getElementById('seriesRow'); if (!mc || !sc) return; mc.innerHTML = ''; sc.innerHTML = ''; mr.classList.toggle('hidden', selectedCategory === "Séries"); sr.classList.toggle('hidden', selectedCategory === "Filmes"); mediaCatalog.forEach(item => { if (!itemMatchesCategory(item, selectedCategory)) return; const card = document.createElement('div'); card.className = 'media-card'; card.tabIndex = 0; const ps = getPosterUrl(item); const gs = getItemGenres(item); const tg = gs.length ? gs[0] : (item.type === 'movie' ? 'Filme' : 'Série'); if (ps) card.innerHTML = `<img class="media-card-poster" src="${ps}" loading="lazy" onerror="this.style.display='none'"><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`; else card.innerHTML = `<div class="media-card-poster-fallback">🎬</div><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`; card.onclick = () => { window.location.hash = `#/midia/${item.id}`; openDetails(item); }; if (item.type === 'movie') mc.appendChild(card); else sc.appendChild(card); }); renderContinueWatching(); if (mediaCatalog.length && !activeItem) setHero(mediaCatalog[0]); }
function setHero(item) { activeItem = item; document.getElementById('heroTitle').innerText = item.title; document.getElementById('heroDesc').innerText = item.description || ''; const gs = getItemGenres(item); const tl = item.type === 'movie' ? '🎬 FILME' : '📺 SÉRIE'; document.getElementById('heroMeta').innerHTML = `<strong>${tl}</strong>${item.year ? ` <span class="dot">•</span> ${item.year}` : ''}${item.duration ? ` <span class="dot">•</span> ⏱️ ${item.duration}` : ''}${gs.length ? ` <span class="dot">•</span> ${gs.slice(0, 3).join(', ')}` : ''}`; const bd = getBackdropUrl(item); if (bd) document.getElementById('heroBackdrop').style.backgroundImage = `url('${bd}')`; document.getElementById('heroPlayBtn').onclick = () => { if (item.type === 'movie') { saveContinueWatching(item, item.duration || ''); initiatePlay(normalizeSources(item), item.title, 'Filme'); } else openDetails(item); }; document.getElementById('heroInfoBtn').onclick = () => openDetails(item); }

// ═══════════════════════════════════════════════════════════════
// DETAILS
// ═══════════════════════════════════════════════════════════════
function openDetails(item) { activeItem = item; const bd = getBackdropUrl(item), ba = document.getElementById('detailBackdropArea'); if (ba) { if (bd) ba.style.backgroundImage = `url('${bd}')`; else ba.style.background = '#1a1a1a'; } const ps = getPosterUrl(item), dp = document.getElementById('detailPoster'); if (dp) { if (ps) { dp.src = ps; dp.style.display = 'block'; } else dp.style.display = 'none'; } document.getElementById('detailTitle').innerText = item.title; document.getElementById('detailMeta').innerText = `${item.type === 'movie' ? 'FILME' : 'SÉRIE'} • ${item.year || ''}${item.duration ? ' • ⏱️ ' + item.duration : ''}`; const gd = document.getElementById('detailGenres'); if (gd) { gd.innerHTML = ''; getItemGenres(item).forEach(g => { const b = document.createElement('span'); b.style.cssText = 'padding:5px 14px;background:rgba(229,9,20,0.12);border:1px solid rgba(229,9,20,0.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary-color);text-transform:uppercase'; b.textContent = g; gd.appendChild(b); }); } document.getElementById('detailDesc').innerText = item.description || ''; const ci = getContinueInfo(item.id); const ca = document.getElementById('detailsContentArea'); if (item.type === 'movie') { document.getElementById('detailMovieArea')?.classList.remove('hidden'); document.getElementById('detailSerieArea')?.classList.add('hidden'); const bp = document.getElementById('btnPlayMovieFile'); bp.innerText = ci ? '▶ Continuar Assistindo' : '▶ Assistir Filme'; bp.onclick = () => { saveContinueWatching(item, item.duration || ''); closeModal('detailsModal'); initiatePlay(normalizeSources(item), item.title, 'Filme'); }; openModal('detailsModal'); if (ca) ca.scrollTop = 0; } else { document.getElementById('detailMovieArea')?.classList.add('hidden'); document.getElementById('detailSerieArea')?.classList.remove('hidden'); const tabs = document.getElementById('seasonTabs'); tabs.innerHTML = ''; let rsi = 0, rei = -1; if (ci?.episodeInfo) { const match = ci.episodeInfo.match(/T(\d+)\s*E(\d+)/i); if (match) { rsi = parseInt(match[1]) - 1; rei = parseInt(match[2]) - 1; } } (item.seasons || []).forEach((s, idx) => { const tab = document.createElement('div'); tab.className = `season-tab ${idx === rsi ? 'active' : ''}`; tab.innerText = `T${idx + 1}`; tab.tabIndex = 0; tab.onclick = () => { document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); if (s.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${s.seasonCoverUrl}')`; else if (ba) ba.style.backgroundImage = bd ? `url('${bd}')` : ''; renderEpList(s.episodes || [], idx, s, item, idx === rsi ? rei : -1); }; tabs.appendChild(tab); }); if (item.seasons?.length) { const ti = item.seasons[rsi] ? rsi : 0; const ts = item.seasons[ti]; if (ts.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${ts.seasonCoverUrl}')`; renderEpList(ts.episodes || [], ti, ts, item, ti === rsi ? rei : -1); } openModal('detailsModal'); if (ca) ca.scrollTop = 0; } }
function renderEpList(eps, si, sd, ser, rei) { const c = document.getElementById('episodesListContainer'); if (!c) return; c.innerHTML = ''; const fi = sd?.seasonCoverUrl?.trim() || getBackdropUrl(ser) || getPosterUrl(ser) || ''; eps.forEach((ep, idx) => { const d = document.createElement('div'); d.className = 'episode-card'; d.tabIndex = 0; const th = ep.thumbUrl?.trim() || fi; const dur = ep.duration ? `<span style="color:#888;font-size:10px;margin-left:6px">⏱️ ${ep.duration}</span>` : ''; const lbl = `T${si + 1} E${idx + 1}`; const isR = idx === rei; const rb = isR ? `<div class="ep-resume-badge">⏳ Onde parou</div>` : ''; d.onclick = () => { closeModal('detailsModal'); saveContinueWatching(activeItem, ep.duration || '', `${lbl} - ${ep.title || ''}`); initiatePlay(normalizeEpisodeSources(ep), activeItem.title, `${lbl} - ${ep.title}`); }; d.innerHTML = `<div class="episode-thumb"><img src="${th}" loading="lazy" onerror="this.src='${fi}'"><div class="ep-play-overlay"><span>▶</span></div></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">${lbl} - ${ep.title || 'Sem Título'}${dur}</div><span style="font-size:11px;color:var(--primary-color);font-weight:700">▶ ${isR ? 'Continuar' : 'Assistir'}</span>${rb}</div>`; if (isR) { d.style.border = '1.5px solid rgba(255,202,40,0.35)'; d.style.background = 'rgba(255,202,40,0.04)'; } c.appendChild(d); }); if (rei >= 0) setTimeout(() => { const cards = c.querySelectorAll('.episode-card'); if (cards[rei]) cards[rei].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150); }
document.getElementById('btnCloseDetails')?.addEventListener('click', () => { window.location.hash = ''; closeModal('detailsModal'); });

// ═══════════════════════════════════════════════════════════════
// PLAYER SYSTEM — NOVA UI + FULLSCREEN 100%
// ═══════════════════════════════════════════════════════════════
const playerBox = document.getElementById('playerModalBox'), playerTopbar = document.getElementById('playerTopbar'), playerBottombar = document.getElementById('playerBottombar'), playerContainer = document.getElementById('playerContainerView'), playerLoading = document.getElementById('playerLoading');

function isPlayerOpen() { return !document.getElementById('playerModal')?.classList.contains('hidden'); }
function isInFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

function showPlayerControls() {
    if (!isPlayerOpen()) return;
    playerTopbar?.classList.remove('is-hidden');
    playerBottombar?.classList.remove('is-hidden');
    playerBox?.classList.remove('cursor-hidden');
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
    controlsHideTimer = setTimeout(() => {
        playerTopbar?.classList.add('is-hidden');
        playerBottombar?.classList.add('is-hidden');
    }, 4000);
    if (!('ontouchstart' in window)) {
        cursorHideTimer = setTimeout(() => playerBox?.classList.add('cursor-hidden'), 3500);
    }
}

playerBox?.addEventListener('mousemove', showPlayerControls);
playerBox?.addEventListener('touchstart', showPlayerControls, { passive: true });
playerBox?.addEventListener('click', (e) => {
    // Se clicar num botão, não faz nada especial
    if (e.target.closest('button, .audio-boost-pill, .player-source-btn')) return;
    // Se controles visíveis, esconde; se escondidos, mostra
    if (playerTopbar?.classList.contains('is-hidden')) showPlayerControls();
    else { playerTopbar?.classList.add('is-hidden'); playerBottombar?.classList.add('is-hidden'); }
});

['fullscreenchange','webkitfullscreenchange'].forEach(e => document.addEventListener(e, () => {
    if (isPlayerOpen()) {
        showPlayerControls();
        // Atualiza ícone do botão fullscreen
        const btn = document.getElementById('btnToggleFullscreen');
        if (btn) btn.innerHTML = isInFullscreen() ? '⤢' : '⛶';
    }
}));

document.getElementById('btnToggleFullscreen')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        if (!isInFullscreen()) {
            if (playerBox?.requestFullscreen) await playerBox.requestFullscreen();
            else if (playerBox?.webkitRequestFullscreen) await playerBox.webkitRequestFullscreen();
            // Tenta bloquear orientação em landscape no mobile
            if (screen.orientation?.lock) {
                try { await screen.orientation.lock('landscape'); } catch {}
            }
        } else {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
            if (screen.orientation?.unlock) {
                try { screen.orientation.unlock(); } catch {}
            }
        }
    } catch (err) { console.warn('Fullscreen error:', err); }
    showPlayerControls();
});

document.getElementById('btnToggleStretch')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isStretchMode = !isStretchMode;
    playerContainer?.classList.toggle('stretch-mode', isStretchMode);
    const btn = document.getElementById('btnToggleStretch');
    if (btn) { btn.classList.toggle('active', isStretchMode); btn.innerHTML = isStretchMode ? '⇲' : '⇱'; }
    showMsg(isStretchMode ? '📐 Modo Esticar (cortar bordas)' : '🖼️ Modo Ajustar (mostrar tudo)', 'success');
    showPlayerControls();
});

document.getElementById('btnReloadPlayer')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentVideoUrl) { playSourceByIndex(currentSourceIndex); showMsg('Recarregando...', 'success'); }
});

const _origOpen = window.open;
window.open = function (...a) {
    if (isPlayerOpen() && isInFullscreen()) try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); } catch {}
    return _origOpen.apply(this, a);
};

function initiatePlay(sources, mainTitle, subTitle) {
    if (!sources?.length) { showMsg('Nenhum link!', 'error'); return; }
    currentSources = sources.slice();
    currentPlayerMeta = { mainTitle, subTitle };
    openModal('playerModal');
    document.getElementById('btnChangeSource')?.classList.toggle('hidden', currentSources.length <= 1);
    if (currentSources.length === 1) { currentSourceIndex = 0; playSourceByIndex(0); }
    else showSourceSelector();
}

function showSourceSelector() {
    const selector = document.getElementById('playerSourceSelector'), list = document.getElementById('playerSourceList');
    if (!selector || !list) return;
    hidePlayerError();
    playerLoading?.classList.add('hidden');
    document.getElementById('playerTitleDisplay').innerText = currentPlayerMeta.mainTitle || 'Escolha uma fonte';
    document.getElementById('playerSubDisplay').innerText = currentPlayerMeta.subTitle || 'MasterFlix';
    document.getElementById('playerProviderBadge')?.classList.add('hidden');
    document.getElementById('playerSourceSelectorSub').textContent = `${currentSources.length} fontes disponíveis`;
    list.innerHTML = '';
    currentSources.forEach((src, idx) => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'player-source-btn'; btn.tabIndex = 0;
        if (idx === currentSourceIndex && currentVideoUrl) btn.classList.add('current');
        const ad = getAdapter(src.type);
        const title = src.label || ad.name;
        const short = src.url ? (src.url.length > 55 ? src.url.substring(0, 55) + '…' : src.url) : '';
        const ct = (idx === currentSourceIndex && currentVideoUrl) ? '<span class="current-tag">Atual</span>' : '';
        btn.innerHTML = `<div class="source-btn-top"><span class="source-btn-title">${ad.icon} ${title}${ct}</span><span class="source-btn-type" style="color:${ad.color}">${ad.name}</span></div><div class="source-btn-url">${short}</div>`;
        btn.onclick = () => { hideSourceSelector(); currentSourceIndex = idx; playSourceByIndex(idx); };
        list.appendChild(btn);
    });
    selector.classList.remove('hidden');
    showPlayerControls();
    setTimeout(() => list.querySelector('.player-source-btn')?.focus(), 100);
}

function hideSourceSelector() { document.getElementById('playerSourceSelector')?.classList.add('hidden'); }
document.getElementById('btnCancelSourceSelection')?.addEventListener('click', () => currentVideoUrl ? hideSourceSelector() : closePlayer());
document.getElementById('btnChangeSource')?.addEventListener('click', (e) => { e.stopPropagation(); showSourceSelector(); });

function playSourceByIndex(idx) {
    const src = currentSources[idx];
    if (!src?.url) { showMsg('Link inválido!', 'error'); return; }
    const ad = getAdapter(src.type);
    const finalUrl = ad.formatUrl(src.url);
    currentVideoUrl = finalUrl;
    currentSourceIndex = idx;

    document.getElementById('playerTitleDisplay').innerText = currentPlayerMeta.mainTitle || 'Assistindo';
    document.getElementById('playerSubDisplay').innerText = currentPlayerMeta.subTitle || 'MasterFlix';
    const badge = document.getElementById('playerProviderBadge');
    if (badge) {
        badge.innerHTML = `${ad.icon} ${src.label || ad.name}`;
        badge.style.background = `${ad.color}30`;
        badge.style.borderColor = `${ad.color}80`;
        badge.classList.remove('hidden');
    }

    playerLoading?.classList.remove('hidden');
    document.getElementById('playerLoadingText').textContent = `Carregando ${ad.name}...`;
    document.getElementById('playerLoadingSub').textContent = `Adaptador otimizado`;
    hidePlayerError();
    hideSourceSelector();

    // Remove player antigo
    playerContainer?.querySelectorAll('iframe, video').forEach(el => el.remove());

    // Reset stretch
    if (isStretchMode) { isStretchMode = false; playerContainer?.classList.remove('stretch-mode'); const btn = document.getElementById('btnToggleStretch'); if (btn) { btn.classList.remove('active'); btn.innerHTML = '⇱'; } }

    // Reset audio
    const booster = document.getElementById('audioBoostSlider'); if (booster) booster.value = 100;
    setAudioBoost(100);

    // Cria elemento
    const el = ad.createElement(finalUrl);

    // Eventos
    el.addEventListener('load', () => {
        setTimeout(() => playerLoading?.classList.add('hidden'), 400);
        clearTimeout(playerErrorTimer);
        setTimeout(() => scanAndBoostAudio(), 1500);
    });
    if (el.tagName === 'VIDEO') {
        el.addEventListener('canplay', () => { setTimeout(() => playerLoading?.classList.add('hidden'), 200); clearTimeout(playerErrorTimer); });
        el.addEventListener('error', () => showPlayerError('Vídeo não disponível.', ad.name));
    }

    playerContainer?.appendChild(el);

    // Timeout de erro
    clearTimeout(playerErrorTimer);
    playerErrorTimer = setTimeout(() => playerLoading?.classList.add('hidden'), ad.errorLoadMs);

    startOverlayCleaner();
    showPlayerControls();

    // Tip
    setTimeout(() => {
        const tip = document.getElementById('playerTip');
        if (tip && isPlayerOpen()) { tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 4000); }
    }, 2500);

    // Scan audio periódico
    const si = setInterval(() => { if (!isPlayerOpen()) { clearInterval(si); return; } scanAndBoostAudio(); }, 5000);
}

function showPlayerError(desc, name) {
    document.getElementById('playerErrorTitle').textContent = `Falha em ${name || 'reprodução'}`;
    document.getElementById('playerErrorDesc').textContent = desc || 'Tente outra fonte.';
    document.getElementById('btnErrorTryAnother').style.display = currentSources.length > 1 ? '' : 'none';
    document.getElementById('playerErrorScreen').classList.remove('hidden');
    playerLoading?.classList.add('hidden');
}
function hidePlayerError() { document.getElementById('playerErrorScreen')?.classList.add('hidden'); }
document.getElementById('btnErrorTryAnother')?.addEventListener('click', () => { hidePlayerError(); showSourceSelector(); });
document.getElementById('btnErrorReload')?.addEventListener('click', () => { hidePlayerError(); playSourceByIndex(currentSourceIndex); });

// Audio Booster
function initAudioContext() { if (audioCtx) return; try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioGainNode = audioCtx.createGain(); audioGainNode.connect(audioCtx.destination); audioGainNode.gain.value = 1.0; } catch {} }
function boostMediaElement(el) { if (!audioCtx || !audioGainNode || boostedElements.has(el)) return; try { audioCtx.createMediaElementSource(el).connect(audioGainNode); boostedElements.add(el); } catch {} }
function scanAndBoostAudio() { if (!audioCtx) return; document.querySelectorAll('video, audio').forEach(el => boostMediaElement(el)); try { const iframe = document.querySelector('#playerContainerView iframe'); if (iframe?.contentDocument) iframe.contentDocument.querySelectorAll('video, audio').forEach(el => boostMediaElement(el)); } catch {} }
function setAudioBoost(pct) {
    audioBoostLevel = pct; initAudioContext();
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    if (audioGainNode) audioGainNode.gain.value = pct / 100;
    scanAndBoostAudio();
    const icon = document.getElementById('audioBoostIcon'), val = document.getElementById('audioBoostValue');
    if (val) val.textContent = pct + '%';
    // Atualiza gradiente do slider
    const slider = document.getElementById('audioBoostSlider');
    if (slider) {
        const percent = ((pct - 100) / 400) * 100;
        slider.style.background = `linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) ${percent}%, rgba(255,255,255,0.2) ${percent}%)`;
    }
    if (icon && val) {
        if (pct <= 100) { icon.textContent = '🔈'; val.style.color = '#aaa'; }
        else if (pct <= 200) { icon.textContent = '🔊'; val.style.color = '#fff'; }
        else if (pct <= 350) { icon.textContent = '🔊'; val.style.color = '#ff9800'; }
        else { icon.textContent = '🔊'; val.style.color = '#ff5252'; }
    }
}
document.getElementById('audioBoostSlider')?.addEventListener('input', (e) => setAudioBoost(parseInt(e.target.value)));
document.getElementById('audioBoostIcon')?.addEventListener('click', () => { const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = audioBoostLevel > 100 ? 100 : 200; setAudioBoost(parseInt(sl.value)); } });

function startOverlayCleaner() { if (overlayCleanerInterval) return; overlayCleanerInterval = setInterval(() => { if (!isPlayerOpen()) return; try { const iframe = document.querySelector('#playerContainerView iframe'); if (!iframe?.contentDocument) return; const doc = iframe.contentDocument; doc.querySelectorAll('div, aside, section, span').forEach(el => { const s = doc.defaultView?.getComputedStyle(el); if (!s) return; const isOv = (s.position === 'fixed' || s.position === 'absolute') && (parseInt(s.zIndex) || 0) > 100; if (isOv && el.offsetWidth > iframe.clientWidth * 0.6 && el.offsetHeight > iframe.clientHeight * 0.4 && !el.querySelector('video')) { el.style.display = 'none'; el.style.pointerEvents = 'none'; } }); } catch {} }, 2000); }
function stopOverlayCleaner() { if (overlayCleanerInterval) { clearInterval(overlayCleanerInterval); overlayCleanerInterval = null; } }

function closePlayer() {
    clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer); clearTimeout(playerErrorTimer);
    if (isInFullscreen()) { try { document.exitFullscreen(); } catch {} try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch {} }
    playerContainer?.querySelectorAll('iframe, video').forEach(el => el.remove());
    isStretchMode = false;
    playerContainer?.classList.remove('stretch-mode');
    playerLoading?.classList.remove('hidden');
    hideSourceSelector(); hidePlayerError();
    closeModal('playerModal');
    playerBox?.classList.remove('cursor-hidden');
    playerTopbar?.classList.remove('is-hidden');
    playerBottombar?.classList.remove('is-hidden');
    stopOverlayCleaner();
    currentVideoUrl = ''; currentSources = []; currentSourceIndex = 0;
    document.getElementById('playerProviderBadge')?.classList.add('hidden');
    document.getElementById('btnChangeSource')?.classList.add('hidden');
    const btnStretch = document.getElementById('btnToggleStretch'); if (btnStretch) { btnStretch.classList.remove('active'); btnStretch.innerHTML = '⇱'; }
    renderContinueWatching();
    if (audioGainNode) audioGainNode.gain.value = 1.0;
    const b = document.getElementById('audioBoostSlider'); if (b) b.value = 100;
    setAudioBoost(100);
}
document.getElementById('btnClosePlayer')?.addEventListener('click', (e) => { e.stopPropagation(); closePlayer(); });

document.addEventListener('keydown', (e) => {
    if (!isPlayerOpen()) return;
    if (e.key === 'Escape') { closePlayer(); return; }
    if (e.key === 'f' || e.key === 'F') document.getElementById('btnToggleFullscreen')?.click();
    if (e.key === 's' || e.key === 'S') document.getElementById('btnToggleStretch')?.click();
    if (e.key === 'r' || e.key === 'R') document.getElementById('btnReloadPlayer')?.click();
    if (e.key === 'c' || e.key === 'C') document.getElementById('btnChangeSource')?.click();
    if (e.key === 'ArrowUp') { e.preventDefault(); const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = Math.min(500, parseInt(sl.value) + 25); setAudioBoost(parseInt(sl.value)); } }
    if (e.key === 'ArrowDown') { e.preventDefault(); const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = Math.max(100, parseInt(sl.value) - 25); setAudioBoost(parseInt(sl.value)); } }
    showPlayerControls();
});

// ═══════════════════════════════════════════════════════════════
// FORM SUBMIT
// ═══════════════════════════════════════════════════════════════
document.getElementById('mediaForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedGenres.length) { showMsg('Selecione gênero!', 'error'); return; }
    const editId = document.getElementById('editMediaId')?.value;
    const type = document.getElementById('mediaType')?.value;
    let cv = document.getElementById('mediaCoverPreview')?.src || '';
    let bd = document.getElementById('mediaBackdropPreview')?.src || '';
    if (!isValidImageUrl(cv) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) cv = ex.coverUrl; }
    if (!isValidImageUrl(bd) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) bd = ex.backdropUrl; }
    let payload = { type, genres: [...selectedGenres], category: selectedGenres[0], title: document.getElementById('mediaTitle')?.value.trim() || '', year: document.getElementById('mediaYear')?.value.trim() || '', duration: document.getElementById('mediaDuration')?.value.trim() || '', description: document.getElementById('mediaDesc')?.value.trim() || '', coverUrl: isValidImageUrl(cv) ? cv : '', backdropUrl: isValidImageUrl(bd) ? bd : '' };
    if (type === 'movie') {
        const vs = movieSourcesBuilder.filter(s => s.url?.trim());
        if (!vs.length) { showMsg('Adicione 1 fonte!', 'error'); return; }
        const ut = vs.map(s => s.type).filter(t => t && t !== 'other');
        const dup = ut.find((t, i) => ut.indexOf(t) !== i);
        if (dup) { showMsg(`Duplicado: ${sourceTypeLabel(dup)}`, 'error'); return; }
        payload.videoSources = vs.map(s => ({ type: s.type || 'other', label: s.label || sourceTypeLabel(s.type) || 'Fonte', url: s.url.trim() }));
        payload.videoUrl = payload.videoSources[0].url;
    } else {
        const us = [];
        for (let si = 0; si < seasonsBuilder.length; si++) {
            const s = seasonsBuilder[si];
            let sc = document.getElementById(`seasonCoverPrev_${si}`)?.src || s.seasonCoverUrl || '';
            if (!isValidImageUrl(sc)) sc = '';
            const ue = [];
            for (let ei = 0; ei < (s.episodes || []).length; ei++) {
                let et = document.getElementById(`epThumbPrev_${si}_${ei}`)?.src || s.episodes[ei].thumbUrl || '';
                if (!isValidImageUrl(et)) et = '';
                const epS = (episodeSourcesBuilder[si]?.[ei] || []).filter(src => src.url?.trim());
                const epUT = epS.map(s => s.type).filter(t => t && t !== 'other');
                const epD = epUT.find((t, i) => epUT.indexOf(t) !== i);
                if (epD) { showMsg(`T${si+1}E${ei+1}: duplicado "${sourceTypeLabel(epD)}"`, 'error'); return; }
                ue.push({ title: document.getElementById(`epTitle_${si}_${ei}`)?.value?.trim() || `Episódio ${ei + 1}`, duration: document.getElementById(`epDuration_${si}_${ei}`)?.value?.trim() || '', thumbUrl: et, videoSources: epS.map(src => ({ type: src.type || 'other', label: src.label || sourceTypeLabel(src.type) || 'Fonte', url: src.url.trim() })), videoUrl: epS.length ? epS[0].url.trim() : '' });
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
        document.getElementById('mediaForm').reset();
        seasonsBuilder = []; episodeSourcesBuilder = []; movieSourcesBuilder = []; selectedGenres = [];
        renderMovieSources();
        await loadCatalog();
    } catch (err) { showMsg('Erro: ' + err.message, 'error'); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════
window.editMedia = (id) => {
    const i = mediaCatalog.find(m => m.id === id); if (!i) return;
    document.getElementById('editMediaId').value = i.id;
    const ts = document.getElementById('mediaType'); ts.value = i.type; ts.disabled = true; ts.dispatchEvent(new Event('change'));
    selectedGenres = Array.isArray(i.genres) && i.genres.length ? [...i.genres] : (i.category ? [i.category] : []);
    renderGenreSelector();
    document.getElementById('mediaTitle').value = i.title || '';
    document.getElementById('mediaYear').value = i.year || '';
    document.getElementById('mediaDuration').value = i.duration || '';
    document.getElementById('mediaDesc').value = i.description || '';
    if (i.coverUrl) { const img = document.getElementById('mediaCoverPreview'); if (img) { img.src = i.coverUrl; img.classList.remove('hidden'); } }
    if (i.backdropUrl) { const img = document.getElementById('mediaBackdropPreview'); if (img) { img.src = i.backdropUrl; img.classList.remove('hidden'); } }
    document.getElementById('creatorTitle').innerText = "Editar";
    if (i.type === 'movie') { movieSourcesBuilder = normalizeSources(i).map(s => ({ ...s })); renderMovieSources(); }
    if (i.type === 'serie') {
        seasonsBuilder = JSON.parse(JSON.stringify(i.seasons || []));
        episodeSourcesBuilder = [];
        seasonsBuilder.forEach((s, si) => { episodeSourcesBuilder[si] = []; (s.episodes || []).forEach((ep, ei) => { episodeSourcesBuilder[si][ei] = normalizeEpisodeSources(ep).map(src => ({ ...src })); }); });
        renderSeasonsBuilder();
    }
    closeModal('adminModal'); openModal('creatorModal');
};
window.deleteMedia = async (id) => { if (confirm("Apagar?")) { try { await remove(ref(rtdb, "catalog/" + id)); showMsg('Removido!', 'success'); loadCatalog(); } catch { showMsg('Erro', 'error'); } } };

function renderAdminCatalogList() {
    const c = document.getElementById('adminCatalogList'); if (!c) return;
    const sv = normalizeText(document.getElementById('adminSearchInput')?.value || ''); c.innerHTML = '';
    mediaCatalog.forEach(i => { if (sv && !normalizeText(i.title).includes(sv)) return; const d = document.createElement('div'); d.className = 'admin-item'; d.innerHTML = `<div><strong>${i.title}</strong><div style="font-size:10px;color:#888">${i.type === 'movie' ? 'Filme' : 'Série'}${i.year ? ' • ' + i.year : ''}</div></div><div style="display:flex;gap:6px"><button class="btn-secondary" onclick="editMedia('${i.id}')">✏️</button><button class="btn-danger" onclick="deleteMedia('${i.id}')">🗑️</button></div>`; c.appendChild(d); });
}
document.getElementById('adminSearchInput')?.addEventListener('input', renderAdminCatalogList);
document.getElementById('btnCloseAdmin')?.addEventListener('click', () => closeModal('adminModal'));
document.getElementById('btnAddNewFromAdmin')?.addEventListener('click', () => { closeModal('adminModal'); openCreator(); });

function openCreator() {
    document.getElementById('editMediaId').value = '';
    document.getElementById('mediaForm')?.reset();
    const ts = document.getElementById('mediaType'); ts.disabled = false; ts.dispatchEvent(new Event('change'));
    document.getElementById('mediaCoverPreview')?.classList.add('hidden');
    document.getElementById('mediaBackdropPreview')?.classList.add('hidden');
    document.getElementById('creatorTitle').innerText = 'Publicar';
    seasonsBuilder = []; episodeSourcesBuilder = []; movieSourcesBuilder = []; selectedGenres = [];
    renderGenreSelector(); renderMovieSources();
    document.getElementById('seasonsList').innerHTML = '';
    openModal('creatorModal');
}

// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnCloseSuggestion')?.addEventListener('click', () => closeModal('suggestionModal'));
document.getElementById('btnSendSuggestion')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return showMsg('Login!', 'error');
    const text = document.getElementById('suggestionText')?.value.trim();
    const type = document.getElementById('suggestionType')?.value;
    if (!text || text.length < 5) return showMsg('Escreva mais!', 'error');
    try { await set(push(ref(rtdb, "suggestions")), { userId: user.uid, userEmail: user.email, userName: getUserCache('name') || user.email.split('@')[0], text, type, timestamp: Date.now() }); document.getElementById('suggestionText').value = ''; showMsg('Enviado!', 'success'); closeModal('suggestionModal'); }
    catch { showMsg('Erro', 'error'); }
});

document.getElementById('btnCloseSuggestionsAdmin')?.addEventListener('click', () => { exitSelectMode(); closeModal('suggestionsAdminModal'); });
async function loadSuggestionsAdmin() { try { const snap = await get(ref(rtdb, "suggestions")); allSuggestions = []; if (snap.exists()) { const d = snap.val(); for (let k in d) allSuggestions.push({ id: k, ...d[k] }); } allSuggestions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); document.getElementById('suggestionsCountText').textContent = `${allSuggestions.length} item(s)`; renderSuggestionsList(); } catch {} }
function renderSuggestionsList() { const c = document.getElementById('suggestionsAdminList'); if (!c) return; c.innerHTML = ''; if (!allSuggestions.length) { c.innerHTML = '<p style="text-align:center;color:#666;padding:30px">Vazio.</p>'; return; } allSuggestions.forEach(s => { const d = document.createElement('div'); d.className = 'suggestion-box'; const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString('pt-BR') : '?'; const cb = suggestionsSelectMode ? `<input type="checkbox" class="suggestion-checkbox" data-id="${s.id}" ${selectedSuggestionIds.has(s.id) ? 'checked' : ''}>` : ''; const del = !suggestionsSelectMode ? `<button class="btn-danger" onclick="deleteSingleSuggestion('${s.id}')">🗑️</button>` : ''; const badge = s.type === 'bug' ? '🐛 BUG' : '💡 SUG'; d.innerHTML = `<div class="sg-header"><div style="display:flex;align-items:center;gap:8px">${cb}<div><div class="sg-user">${s.userName || '?'} ${badge}</div><div class="sg-email">${s.userEmail || ''}</div></div></div><div style="display:flex;align-items:center;gap:6px"><span class="sg-date">${date}</span>${del}</div></div><div class="sg-text">${s.text}</div>`; if (suggestionsSelectMode) { const chk = d.querySelector('.suggestion-checkbox'); if (chk) chk.onchange = () => { if (chk.checked) selectedSuggestionIds.add(s.id); else selectedSuggestionIds.delete(s.id); }; } c.appendChild(d); }); }
function enterSelectMode() { suggestionsSelectMode = true; selectedSuggestionIds.clear(); document.getElementById('btnToggleSelectMode')?.classList.add('hidden'); document.getElementById('btnDeleteSelectedSuggestions')?.classList.remove('hidden'); document.getElementById('btnSelectAllSuggestions')?.classList.remove('hidden'); document.getElementById('btnCancelSelectMode')?.classList.remove('hidden'); renderSuggestionsList(); }
function exitSelectMode() { suggestionsSelectMode = false; selectedSuggestionIds.clear(); document.getElementById('btnToggleSelectMode')?.classList.remove('hidden'); document.getElementById('btnDeleteSelectedSuggestions')?.classList.add('hidden'); document.getElementById('btnSelectAllSuggestions')?.classList.add('hidden'); document.getElementById('btnCancelSelectMode')?.classList.add('hidden'); renderSuggestionsList(); }
document.getElementById('btnToggleSelectMode')?.addEventListener('click', enterSelectMode);
document.getElementById('btnCancelSelectMode')?.addEventListener('click', exitSelectMode);
document.getElementById('btnSelectAllSuggestions')?.addEventListener('click', () => { if (selectedSuggestionIds.size === allSuggestions.length) selectedSuggestionIds.clear(); else allSuggestions.forEach(s => selectedSuggestionIds.add(s.id)); renderSuggestionsList(); });
document.getElementById('btnDeleteSelectedSuggestions')?.addEventListener('click', async () => { if (!selectedSuggestionIds.size || !confirm(`Apagar ${selectedSuggestionIds.size}?`)) return; try { for (let id of selectedSuggestionIds) await remove(ref(rtdb, "suggestions/" + id)); showMsg('OK!', 'success'); exitSelectMode(); loadSuggestionsAdmin(); } catch {} });
window.deleteSingleSuggestion = async (id) => { if (!confirm('Apagar?')) return; try { await remove(ref(rtdb, "suggestions/" + id)); loadSuggestionsAdmin(); } catch {} };

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnCloseStorage')?.addEventListener('click', () => closeModal('storageModal'));
async function loadStorageInfo() {
    const c = document.getElementById('storageContent'); if (!c) return;
    c.innerHTML = '<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto 14px;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando...</p></div>';
    try {
        const [cs, us, ss] = await Promise.all([get(ref(rtdb, "catalog")).catch(() => null), get(ref(rtdb, "users")).catch(() => null), get(ref(rtdb, "suggestions")).catch(() => null)]);
        const cd = cs?.exists() ? cs.val() : {}, ud = us?.exists() ? us.val() : {}, sd = ss?.exists() ? ss.val() : {};
        const cb = estimateJsonBytes(cd), ub = estimateJsonBytes(ud), sb = estimateJsonBytes(sd), tb = cb + ub + sb;
        const cc = Object.keys(cd).length, uc = Object.keys(ud).length, scc = Object.keys(sd).length;
        let mc = 0, sc2 = 0, te = 0;
        Object.values(cd).forEach(i => { if (i.type === 'movie') mc++; else { sc2++; (i.seasons || []).forEach(s => te += (s.episodes || []).length); } });
        const pct = Math.min(100, (tb / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100);
        const free = FIREBASE_RTDB_FREE_LIMIT_BYTES - tb;
        let bc = '#4caf50', st = '✅ Saudável';
        if (pct > 50) bc = '#8bc34a';
        if (pct > 70) { bc = '#ff9800'; st = '⚠️ Atenção'; }
        if (pct > 85) { bc = '#ff5722'; st = '🔴 Crítico'; }
        c.innerHTML = `<div style="text-align:center;margin-bottom:20px"><div style="font-size:38px;font-weight:900;color:${bc}">${pct.toFixed(1)}%</div><div style="font-size:14px;font-weight:800;margin-top:4px">${st}</div></div><div style="margin-bottom:22px"><div class="storage-bar-outer"><div class="storage-bar-inner" style="width:${Math.max(2,pct)}%;background:${bc}"></div></div><div class="storage-info"><span>${formatBytes(tb)} usado</span><span>${formatBytes(free)} livre</span></div></div><div style="display:flex;gap:10px;margin-bottom:22px"><div class="storage-icon-card"><span class="sto-icon">🎬</span><div class="sto-count">${mc}</div><div class="sto-label">Filmes</div></div><div class="storage-icon-card"><span class="sto-icon">📺</span><div class="sto-count">${sc2}</div><div class="sto-label">Séries</div></div><div class="storage-icon-card"><span class="sto-icon">🎞️</span><div class="sto-count">${te}</div><div class="sto-label">Episódios</div></div></div><div class="storage-detail-item"><span class="storage-label">Catálogo (${cc})</span><span class="storage-value">${formatBytes(cb)}</span></div><div class="storage-detail-item"><span class="storage-label">Usuários (${uc})</span><span class="storage-value">${formatBytes(ub)}</span></div><div class="storage-detail-item"><span class="storage-label">Sugestões (${scc})</span><span class="storage-value">${formatBytes(sb)}</span></div>`;
    } catch (e) { c.innerHTML = `<p style="text-align:center;color:#ff5252">${e.message}</p>`; }
}

// ═══════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    const tc = document.getElementById('themeColorPicker')?.value || '#e50914';
    if (!isTVDevice()) applyUserTheme(tc);
    const n = document.getElementById('profileNameInput')?.value.trim() || '';
    const b = document.getElementById('profileBioInput')?.value.trim() || '';
    const fg = document.getElementById('profileFavGenreInput')?.value || 'Ação';
    const ph = document.getElementById('profilePhotoPreview')?.src || '';
    const bn = document.getElementById('profileBannerPreview')?.src || '';
    const data = { name: n, bio: b, favGenre: fg, photo: isValidImageUrl(ph) ? ph : '', banner: isValidImageUrl(bn) ? bn : '', themeColor: tc };
    try {
        await set(ref(rtdb, "users/" + user.uid), data);
        if (n) setUserCache('name', n); if (b) setUserCache('bio', b); if (fg) setUserCache('fav_genre', fg);
        if (data.photo) setUserCache('avatar', data.photo); if (data.banner) setUserCache('banner', data.banner);
        setUserCache('theme_color', tc);
        updateUserAvatarUI(data);
        showMsg('Salvo! ✅', 'success'); closeModal('profileModal');
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
});

async function loadUserProfile(user) {
    if (!user) return;
    try {
        const s = await get(ref(rtdb, "users/" + user.uid));
        if (s.exists()) {
            const data = s.val();
            if (data.name) setUserCache('name', data.name);
            if (data.bio) setUserCache('bio', data.bio);
            if (data.favGenre) setUserCache('fav_genre', data.favGenre);
            if (data.photo) setUserCache('avatar', data.photo);
            if (data.banner) setUserCache('banner', data.banner);
            if (data.themeColor) setUserCache('theme_color', data.themeColor);
            updateUserAvatarUI(data);
            if (data.themeColor && !isTVDevice()) { applyUserTheme(data.themeColor); const p = document.getElementById('themeColorPicker'); if (p) p.value = data.themeColor; }
        } else updateUserAvatarUI({});
    } catch { updateUserAvatarUI({}); }
}

function resetProfileUI() {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setTxt('avatarText', 'U'); document.getElementById('avatarImg')?.classList.add('hidden'); document.getElementById('avatarText')?.classList.remove('hidden');
    setTxt('profileAvatarBigText', 'U'); document.getElementById('profileAvatarBigImg')?.classList.add('hidden');
    setTxt('profileNameDisplay', 'Usuário'); setVal('profileNameInput', ''); setVal('profileBioInput', ''); setTxt('profileEmailDisplay', '');
    const pB = document.getElementById('profileBannerImg'); if (pB) pB.src = 'https://via.placeholder.com/600x200?text=Banner';
    document.getElementById('profilePhotoPreview')?.classList.add('hidden'); document.getElementById('profileBannerPreview')?.classList.add('hidden');
    setTxt('sidebarUserName', 'Usuário'); setTxt('sidebarUserEmail', 'email@exemplo.com');
    const sa = document.getElementById('sidebarAvatar'); if (sa) sa.innerHTML = '<span>U</span>';
    setVal('themeColorPicker', '#e50914');
}

function updateUserAvatarUI(data = {}) {
    const un = data.name || getUserCache('name') || '', ub = data.bio || getUserCache('bio') || '', ug = data.favGenre || getUserCache('fav_genre') || '', av = data.photo || getUserCache('avatar') || '', bn = data.banner || getUserCache('banner') || '';
    const user = auth.currentUser; const letter = un ? un.charAt(0).toUpperCase() : (user ? user.email.charAt(0).toUpperCase() : 'U');
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    if (un) { setTxt('profileNameDisplay', un); const pN = document.getElementById('profileNameInput'); if (pN) pN.value = un; setTxt('sidebarUserName', un); } else if (user) { const name = user.email.split('@')[0]; setTxt('sidebarUserName', name); setTxt('profileNameDisplay', name); }
    if (user) setTxt('sidebarUserEmail', user.email);
    if (ub) { setTxt('profileBioDisplay', `"${ub}"`); const pB = document.getElementById('profileBioInput'); if (pB) pB.value = ub; }
    if (ug) { const pG = document.getElementById('profileFavGenreInput'); if (pG) pG.value = ug; }
    if (bn) { const bI = document.getElementById('profileBannerImg'); if (bI) bI.src = bn; const bP = document.getElementById('profileBannerPreview'); if (bP) { bP.src = bn; bP.classList.remove('hidden'); } }
    const sa = document.getElementById('sidebarAvatar'); if (sa) sa.innerHTML = '';
    if (av) {
        const aI = document.getElementById('avatarImg'); if (aI) { aI.src = av; aI.classList.remove('hidden'); } document.getElementById('avatarText')?.classList.add('hidden');
        const abI = document.getElementById('profileAvatarBigImg'); if (abI) { abI.src = av; abI.classList.remove('hidden'); } document.getElementById('profileAvatarBigText')?.classList.add('hidden');
        const pP = document.getElementById('profilePhotoPreview'); if (pP) { pP.src = av; pP.classList.remove('hidden'); }
        if (sa) { const img = document.createElement('img'); img.src = av; sa.appendChild(img); }
    } else { setTxt('avatarText', letter); setTxt('profileAvatarBigText', letter); if (sa) sa.innerHTML = `<span>${letter}</span>`; }
}

// Change password from profile
document.getElementById('btnChangePasswordFromProfile')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    try { await sendPasswordResetEmail(auth, user.email); showMsg(`Link enviado para ${user.email}!`, 'success'); }
    catch (e) { showMsg('Erro: ' + e.message, 'error'); }
});

async function handleLogout() {
    try { currentUserUid = null; await signOut(auth); resetProfileUI(); document.documentElement.style.setProperty('--primary-color', '#e50914'); closeModal('profileModal'); closeSidebar(); activeItem = null; mediaCatalog = []; isAdmin = false; renderApp(); showMsg('Saiu! 👋', 'success'); } catch { showMsg('Erro', 'error'); }
}
document.getElementById('btnLogout')?.addEventListener('click', handleLogout);

// ═══════════════════════════════════════════════════════════════
// AUTH: Password toggle
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnTogglePassword')?.addEventListener('click', () => {
    const pw = document.getElementById('authPassword'); if (!pw) return;
    const isPassword = pw.type === 'password';
    pw.type = isPassword ? 'text' : 'password';
    document.getElementById('btnTogglePassword').textContent = isPassword ? '🙈' : '👁️';
});

// ═══════════════════════════════════════════════════════════════
// AUTH: Forgot Password
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnForgotPassword')?.addEventListener('click', () => { closeModal('authOverlay'); openModal('forgotPasswordModal'); });
document.getElementById('btnBackToLogin')?.addEventListener('click', () => { closeModal('forgotPasswordModal'); openModal('authOverlay'); });
document.getElementById('btnCloseForgot')?.addEventListener('click', () => { closeModal('forgotPasswordModal'); openModal('authOverlay'); });
document.getElementById('btnForgotSuccessClose')?.addEventListener('click', () => { closeModal('forgotSuccessModal'); openModal('authOverlay'); });

document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail')?.value.trim().toLowerCase();
    if (!email) { showMsg('Digite seu e-mail!', 'error'); return; }
    const btn = document.getElementById('btnSendResetEmail'); const ot = btn?.innerText;
    if (btn) { btn.innerText = '⏳ Enviando...'; btn.disabled = true; }
    try {
        await sendPasswordResetEmail(auth, email);
        closeModal('forgotPasswordModal');
        document.getElementById('forgotSuccessEmail').textContent = email;
        openModal('forgotSuccessModal');
    } catch (err) { showMsg(translateAuthError(err.code), 'error'); }
    if (btn) { btn.innerText = ot; btn.disabled = false; }
});

// ═══════════════════════════════════════════════════════════════
// AUTH: Login/Signup
// ═══════════════════════════════════════════════════════════════
const toggleAuth = document.getElementById('toggleAuthMode');
if (toggleAuth) toggleAuth.onclick = () => {
    isSignUpMode = !isSignUpMode;
    document.getElementById('authSubtitle').innerText = isSignUpMode ? 'Crie sua conta gratuita' : 'Entre na sua conta para continuar';
    document.getElementById('btnAuthSubmit').innerText = isSignUpMode ? 'Criar Conta' : 'Entrar na Conta';
    toggleAuth.innerHTML = isSignUpMode ? 'Já tem conta? <span style="color:var(--primary-color)">Entrar</span>' : 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>';
    document.getElementById('btnForgotPassword').style.display = isSignUpMode ? 'none' : '';
};

document.getElementById('authForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); if (authProcessing) return;
    authProcessing = true;
    const sb = document.getElementById('btnAuthSubmit'); const ot = sb?.innerText;
    if (sb) { sb.innerText = '⏳ Aguarde...'; sb.disabled = true; }
    const email = document.getElementById('authEmail')?.value.trim().toLowerCase();
    const pass = document.getElementById('authPassword')?.value;
    if (!email || !pass || pass.length < 6) { showMsg('Preencha! Senha mín 6', 'error'); authProcessing = false; if (sb) { sb.innerText = ot; sb.disabled = false; } return; }
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
});

// ═══════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnOpenProfile')?.addEventListener('click', () => openModal('profileModal'));
document.getElementById('btnCloseProfile')?.addEventListener('click', () => closeModal('profileModal'));
document.getElementById('btnCloseCreator')?.addEventListener('click', () => closeModal('creatorModal'));

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
clearLegacyCache();
renderGenreSelector();
renderMovieSources();
setAudioBoost(100);

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUid = user.uid; resetProfileUI(); closeModal('authOverlay');
        document.getElementById('profileEmailDisplay').innerText = user.email;
        isAdmin = user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
        ['profileAdminBadge','sidebarAdminItem','sidebarCreatorItem','sidebarSuggestionsAdminItem','sidebarStorageItem'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !isAdmin));
        loadUserProfile(user); loadCatalog();
    } else {
        currentUserUid = null; isAdmin = false; resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        openModal('authOverlay');
        ['sidebarAdminItem','sidebarCreatorItem','sidebarSuggestionsAdminItem','sidebarStorageItem','profileAdminBadge'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        isSignUpMode = false;
        document.getElementById('authSubtitle').innerText = 'Entre na sua conta para continuar';
        document.getElementById('btnAuthSubmit').innerText = 'Entrar na Conta';
        if (toggleAuth) toggleAuth.innerHTML = 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>';
        document.getElementById('btnForgotPassword').style.display = '';
    }
});

// ═══════════════════════════════════════════════════════════════
// TV D-PAD + ESC
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
    if (isPlayerOpen()) return;
    if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009) {
        const modals = ['forgotPasswordModal','forgotSuccessModal','detailsModal','profileModal','adminModal','creatorModal','suggestionModal','suggestionsAdminModal','storageModal','cropperModal'];
        for (const id of modals) { const m = document.getElementById(id); if (m && !m.classList.contains('hidden')) { closeModal(id); e.preventDefault(); return; } }
        if (document.getElementById('sidebarMenu')?.classList.contains('active')) { closeSidebar(); e.preventDefault(); }
    }
});
