import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, remove, onValue, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const EXCLUSIVE_ADMIN_EMAIL = "raiyuri.freefire@gmail.com";
const AVAILABLE_GENRES = ["Ação","Aventura","Comédia","Drama","Terror","Suspense","Romance","Ficção Científica","Fantasia","Animação","Documentário","Musical","Guerra","Mistério","Crime","Família","Histórico","Faroeste"];
const FIREBASE_RTDB_FREE_LIMIT_BYTES = 1073741824;
const CONTINUE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_ID_KEY = 'mfx_device_id';
const DEVICE_HEARTBEAT_MS = 60000;

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

// Persistência local
setPersistence(auth, browserLocalPersistence).catch(e => console.warn('Persistence:', e));

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let mediaCatalog = [];
let activeItem = null;
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

// ⚠️ CREATOR — Modelo único de dados (sem perder nada!)
let creatorData = {
    type: 'movie',
    movieSources: [],
    seasons: [] // [{ id, seasonNumber, seasonCoverUrl, episodes: [{ id, title, duration, thumbUrl, sources: [...] }] }]
};

// Estado UI (accordion aberto/fechado)
let uiState = {
    openSeasons: new Set(),
    openEpisodes: new Set()
};

// Audio
let audioCtx = null;
let audioGainNode = null;
let boostedElements = new WeakSet();
let audioBoostLevel = 100;
let overlayCleanerInterval = null;

// Devices
let deviceHeartbeatInterval = null;
let deviceListListener = null;

// ═══════════════════════════════════════════════════════════════
// UTILS: IDs únicos
// ═══════════════════════════════════════════════════════════════
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

// ═══════════════════════════════════════════════════════════════
// PROVIDER ADAPTERS (mesmo do anterior)
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
// DEVICE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) { id = 'dev_' + uid() + '_' + Math.random().toString(36).substr(2, 8); localStorage.setItem(DEVICE_ID_KEY, id); }
    return id;
}

function detectDeviceInfo() {
    const ua = navigator.userAgent;
    let type = 'desktop', icon = '💻', name = 'Desktop';
    if (/tablet|ipad/i.test(ua) && !/mobile/i.test(ua)) { type = 'tablet'; icon = '📱'; name = 'Tablet'; }
    else if (/mobile|android|iphone|ipod/i.test(ua)) { type = 'mobile'; icon = '📱'; name = 'Celular'; }
    else if (/smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(ua)) { type = 'tv'; icon = '📺'; name = 'Smart TV'; }

    // Browser
    let browser = 'Navegador';
    if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/edg/i.test(ua)) browser = 'Edge';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    // OS
    let os = 'OS Desconhecido';
    if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/mac/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    return { type, icon, name, browser, os };
}

async function registerCurrentDevice(user) {
    if (!user) return;
    const deviceId = getOrCreateDeviceId();
    const info = detectDeviceInfo();
    const data = {
        deviceId, type: info.type, icon: info.icon, name: info.name,
        browser: info.browser, os: info.os,
        userAgent: navigator.userAgent.substring(0, 200),
        firstLogin: Date.now(),
        lastActive: Date.now()
    };
    try {
        // Verifica se já existe
        const snap = await get(ref(rtdb, `devices/${user.uid}/${deviceId}`));
        if (snap.exists()) {
            data.firstLogin = snap.val().firstLogin || Date.now();
        }
        await set(ref(rtdb, `devices/${user.uid}/${deviceId}`), data);
        startDeviceHeartbeat(user.uid, deviceId);
    } catch (e) { console.warn('registerDevice:', e); }
}

function startDeviceHeartbeat(userId, deviceId) {
    stopDeviceHeartbeat();
    deviceHeartbeatInterval = setInterval(async () => {
        try { await set(ref(rtdb, `devices/${userId}/${deviceId}/lastActive`), Date.now()); } catch {}
    }, DEVICE_HEARTBEAT_MS);
}

function stopDeviceHeartbeat() {
    if (deviceHeartbeatInterval) { clearInterval(deviceHeartbeatInterval); deviceHeartbeatInterval = null; }
}

async function removeDevice(userId, deviceId) {
    try { await remove(ref(rtdb, `devices/${userId}/${deviceId}`)); return true; } catch { return false; }
}

async function removeAllOtherDevices(userId, currentDeviceId) {
    try {
        const snap = await get(ref(rtdb, `devices/${userId}`));
        if (!snap.exists()) return;
        const devices = snap.val();
        for (const did of Object.keys(devices)) {
            if (did !== currentDeviceId) await remove(ref(rtdb, `devices/${userId}/${did}`));
        }
        return true;
    } catch { return false; }
}

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
        else if (a === 'profile') openProfileModal();
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
// CREATOR — TABS
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.creator-tab').forEach(tab => {
    tab.onclick = () => {
        // Antes de trocar de aba, sincroniza inputs da aba atual
        syncCreatorInputsToState();
        document.querySelectorAll('.creator-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.creator-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`[data-tab-content="${tab.dataset.tab}"]`)?.classList.add('active');
    };
});

// ═══════════════════════════════════════════════════════════════
// CREATOR — MOVIE SOURCES
// ═══════════════════════════════════════════════════════════════
function renderMovieSources() {
    const container = document.getElementById('movieSourcesList'); if (!container) return;
    container.innerHTML = '';
    if (creatorData.movieSources.length === 0) {
        container.innerHTML = '<div class="source-empty-state">Nenhuma fonte. Clique em <strong>+ Adicionar Fonte</strong> abaixo.</div>';
        return;
    }
    const tmpl = document.getElementById('videoSourceItemTemplate');
    creatorData.movieSources.forEach((src, idx) => {
        const clone = tmpl.content.cloneNode(true);
        const card = clone.querySelector('.source-item-card');
        card.querySelector('.source-item-badge').textContent = `Fonte ${idx + 1}`;
        const ts = card.querySelector('.source-type-select'); ts.value = src.type || '';
        const ti = card.querySelector('.source-title-input'); ti.value = src.label || '';
        const ui = card.querySelector('.source-url-input'); ui.value = src.url || '';
        const usedTypes = creatorData.movieSources.filter((_, i) => i !== idx).map(s => s.type).filter(t => t && t !== 'other');
        Array.from(ts.options).forEach(opt => { if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) { opt.disabled = true; if (!opt.text.includes('(já)')) opt.text += ' (já)'; } });
        if (src.type) { const p = document.createElement('div'); p.className = 'source-preview-tag'; const ad = getAdapter(src.type); p.textContent = `${ad.icon} ${ad.name}`; card.appendChild(p); }
        ts.onchange = () => { const nt = ts.value; if (nt && nt !== 'other' && creatorData.movieSources.some((s, i) => i !== idx && s.type === nt)) { showMsg(`Já existe "${sourceTypeLabel(nt)}"!`, 'error'); ts.value = src.type || ''; return; } creatorData.movieSources[idx].type = nt; if (!creatorData.movieSources[idx].label && nt) creatorData.movieSources[idx].label = sourceTypeLabel(nt); renderMovieSources(); };
        ti.oninput = () => { creatorData.movieSources[idx].label = ti.value; };
        ui.oninput = () => {
            creatorData.movieSources[idx].url = ui.value;
            if (!creatorData.movieSources[idx].type && ui.value) {
                const d = detectSourceType(ui.value);
                if (d !== 'other' && !creatorData.movieSources.some((s, i) => i !== idx && s.type === d)) {
                    creatorData.movieSources[idx].type = d;
                    if (!creatorData.movieSources[idx].label) creatorData.movieSources[idx].label = sourceTypeLabel(d);
                    renderMovieSources();
                }
            }
        };
        card.querySelector('[data-action="remove-source"]').onclick = () => { creatorData.movieSources.splice(idx, 1); renderMovieSources(); };
        container.appendChild(card);
    });
}

document.getElementById('btnAddMovieSource')?.addEventListener('click', () => {
    creatorData.movieSources.push({ type: '', label: '', url: '' });
    renderMovieSources();
});

// ═══════════════════════════════════════════════════════════════
// CREATOR — SEASONS/EPISODES (accordion, sem perder dados!)
// ═══════════════════════════════════════════════════════════════
function syncCreatorInputsToState() {
    // Antes de qualquer re-render, lemos os inputs visíveis e salvamos no state
    if (creatorData.type === 'serie') {
        creatorData.seasons.forEach((s) => {
            (s.episodes || []).forEach((ep) => {
                const titleEl = document.querySelector(`[data-ep-title="${ep.id}"]`);
                const durEl = document.querySelector(`[data-ep-duration="${ep.id}"]`);
                const thumbEl = document.querySelector(`[data-ep-thumb="${ep.id}"]`);
                if (titleEl) ep.title = titleEl.value;
                if (durEl) ep.duration = durEl.value;
                if (thumbEl && thumbEl.src && !thumbEl.classList.contains('hidden')) ep.thumbUrl = thumbEl.src;
                // Sources do episódio
                if (ep.sources) {
                    ep.sources.forEach((src) => {
                        const typeEl = document.querySelector(`[data-src-type="${src.id}"]`);
                        const labelEl = document.querySelector(`[data-src-label="${src.id}"]`);
                        const urlEl = document.querySelector(`[data-src-url="${src.id}"]`);
                        if (typeEl) src.type = typeEl.value;
                        if (labelEl) src.label = labelEl.value;
                        if (urlEl) src.url = urlEl.value;
                    });
                }
            });
            const scEl = document.querySelector(`[data-season-cover="${s.id}"]`);
            if (scEl && scEl.src && !scEl.classList.contains('hidden')) s.seasonCoverUrl = scEl.src;
        });
    }
}

function renderSeasonsList() {
    const c = document.getElementById('seasonsList'); if (!c) return;
    c.innerHTML = '';

    if (creatorData.seasons.length === 0) {
        c.innerHTML = '<div class="empty-list-state"><span class="empty-icon">📺</span>Nenhuma temporada. Adicione a primeira!</div>';
        return;
    }

    creatorData.seasons.forEach((season, si) => {
        const isOpen = uiState.openSeasons.has(season.id);
        const acc = document.createElement('div');
        acc.className = 'season-accordion' + (isOpen ? ' open' : '');
        const epCount = (season.episodes || []).length;
        const hasContent = (season.episodes || []).some(ep => ep.sources?.some(s => s.url?.trim()));
        acc.innerHTML = `
            <div class="season-header" data-toggle-season="${season.id}">
                <div class="season-header-left">
                    <div class="season-toggle-icon">▶</div>
                    <div>
                        <div class="season-title">Temporada ${si + 1}</div>
                        <div class="season-subtitle">${epCount} episódio(s) ${hasContent ? '• <span style="color:#4caf50">✓ com fontes</span>' : ''}</div>
                    </div>
                </div>
                <div class="season-header-actions">
                    <button type="button" class="season-mini-btn danger" data-remove-season="${season.id}" title="Remover temporada">🗑️</button>
                </div>
            </div>
            <div class="season-body">
                <div class="input-group">
                    <label>🖼️ Foto da Temporada (opcional)</label>
                    <label class="file-upload-box" data-season-cover-box="${season.id}">
                        <span class="file-upload-label">📁 Escolher imagem</span>
                        <input type="file" data-season-cover-input="${season.id}" accept="image/*" class="hidden">
                        <img data-season-cover="${season.id}" src="${season.seasonCoverUrl || ''}" class="file-preview-img ${season.seasonCoverUrl ? '' : 'hidden'}">
                    </label>
                </div>
                <label style="font-size:11px;font-weight:800;color:var(--primary-color);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:block">🎬 Episódios</label>
                <div data-ep-list="${season.id}"></div>
                <button type="button" class="add-btn-block" data-add-episode="${season.id}" style="margin-top:10px">+ Novo Episódio</button>
            </div>
        `;
        c.appendChild(acc);
        renderEpisodesList(season);
    });

    // Bind handlers dos accordions
    c.querySelectorAll('[data-toggle-season]').forEach(el => {
        el.onclick = (e) => {
            if (e.target.closest('button')) return;
            const id = el.dataset.toggleSeason;
            syncCreatorInputsToState();
            if (uiState.openSeasons.has(id)) uiState.openSeasons.delete(id);
            else uiState.openSeasons.add(id);
            renderSeasonsList();
        };
    });

    c.querySelectorAll('[data-remove-season]').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.dataset.removeSeason;
            if (!confirm('Remover esta temporada e todos os seus episódios?')) return;
            const idx = creatorData.seasons.findIndex(s => s.id === id);
            if (idx >= 0) {
                creatorData.seasons.splice(idx, 1);
                uiState.openSeasons.delete(id);
                renderSeasonsList();
            }
        };
    });

    c.querySelectorAll('[data-add-episode]').forEach(btn => {
        btn.onclick = () => {
            syncCreatorInputsToState();
            const seasonId = btn.dataset.addEpisode;
            const season = creatorData.seasons.find(s => s.id === seasonId);
            if (!season) return;
            const epNum = (season.episodes?.length || 0) + 1;
            const newEp = { id: uid(), title: `Episódio ${epNum}`, duration: '45m', thumbUrl: '', sources: [] };
            season.episodes = season.episodes || [];
            season.episodes.push(newEp);
            uiState.openEpisodes.add(newEp.id);
            renderSeasonsList();
        };
    });

    c.querySelectorAll('[data-season-cover-box]').forEach(box => {
        box.onclick = () => {
            const id = box.dataset.seasonCoverBox;
            triggerCropModal(`sci_${id}`, `scp_${id}`, 16/9, id, 'season');
        };
    });

    // Configura inputs de file com IDs certos
    c.querySelectorAll('[data-season-cover-input]').forEach(input => { input.id = `sci_${input.dataset.seasonCoverInput}`; });
    c.querySelectorAll('[data-season-cover]').forEach(img => { img.id = `scp_${img.dataset.seasonCover}`; });
}

function renderEpisodesList(season) {
    const container = document.querySelector(`[data-ep-list="${season.id}"]`); if (!container) return;
    container.innerHTML = '';
    const episodes = season.episodes || [];
    if (episodes.length === 0) {
        container.innerHTML = '<div class="empty-list-state" style="padding:14px;font-size:11px"><span class="empty-icon" style="font-size:24px">🎬</span>Nenhum episódio</div>';
        return;
    }
    episodes.forEach((ep, ei) => {
        const isOpen = uiState.openEpisodes.has(ep.id);
        const hasTitle = !!(ep.title?.trim());
        const hasSource = ep.sources?.some(s => s.url?.trim());
        const sourceCount = ep.sources?.filter(s => s.url?.trim()).length || 0;
        const acc = document.createElement('div');
        acc.className = 'episode-accordion' + (isOpen ? ' open' : '');
        acc.innerHTML = `
            <div class="episode-accordion-header" data-toggle-episode="${ep.id}">
                <div class="episode-accordion-header-left">
                    <span class="ep-number-badge">${ei + 1}</span>
                    <div class="ep-info-mini">
                        <div class="ep-info-mini-title">${hasTitle ? ep.title : `Episódio ${ei + 1}`}</div>
                        <div class="ep-info-mini-sub">
                            ${ep.duration ? '⏱️ ' + ep.duration : ''}
                            ${hasSource ? `<span class="ok-badge">✓ ${sourceCount} fonte(s)</span>` : '<span class="warn-badge">⚠ sem fonte</span>'}
                        </div>
                    </div>
                </div>
                <div class="episode-accordion-actions">
                    <button type="button" class="season-mini-btn danger" data-remove-episode="${season.id}|${ep.id}" title="Remover">🗑️</button>
                    <span class="ep-toggle-icon">▶</span>
                </div>
            </div>
            <div class="episode-body">
                <div class="input-group">
                    <label>Título do episódio</label>
                    <input type="text" data-ep-title="${ep.id}" value="${(ep.title || '').replace(/"/g, '&quot;')}" autocomplete="off">
                </div>
                <div class="input-group">
                    <label>Duração</label>
                    <input type="text" data-ep-duration="${ep.id}" value="${(ep.duration || '').replace(/"/g, '&quot;')}" placeholder="Ex: 45m" autocomplete="off">
                </div>
                <div class="input-group">
                    <label>🖼️ Thumbnail (opcional)</label>
                    <label class="file-upload-box" data-ep-thumb-box="${ep.id}">
                        <span class="file-upload-label">📸 Escolher</span>
                        <input type="file" data-ep-thumb-input="${ep.id}" accept="image/*" class="hidden">
                        <img data-ep-thumb="${ep.id}" src="${ep.thumbUrl || ''}" class="file-preview-img ${ep.thumbUrl ? '' : 'hidden'}">
                    </label>
                </div>
                <div class="input-group">
                    <label style="font-size:11px;font-weight:800;color:var(--primary-color);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">🎞️ Fontes de Vídeo</label>
                    <div data-ep-sources="${ep.id}"></div>
                    <button type="button" class="add-btn-block" data-add-source="${ep.id}" style="margin-top:10px;font-size:11px;padding:10px">+ Adicionar Fonte</button>
                </div>
            </div>
        `;
        container.appendChild(acc);
        renderEpisodeSources(ep);
    });

    // Handlers
    container.querySelectorAll('[data-toggle-episode]').forEach(el => {
        el.onclick = (e) => {
            if (e.target.closest('button')) return;
            const id = el.dataset.toggleEpisode;
            syncCreatorInputsToState();
            if (uiState.openEpisodes.has(id)) uiState.openEpisodes.delete(id);
            else uiState.openEpisodes.add(id);
            renderSeasonsList();
        };
    });

    container.querySelectorAll('[data-remove-episode]').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            if (!confirm('Remover este episódio?')) return;
            const [sid, eid] = btn.dataset.removeEpisode.split('|');
            const season = creatorData.seasons.find(s => s.id === sid);
            if (season) {
                const idx = season.episodes.findIndex(ep => ep.id === eid);
                if (idx >= 0) { season.episodes.splice(idx, 1); uiState.openEpisodes.delete(eid); renderSeasonsList(); }
            }
        };
    });

    container.querySelectorAll('[data-add-source]').forEach(btn => {
        btn.onclick = () => {
            syncCreatorInputsToState();
            const epId = btn.dataset.addSource;
            const ep = findEpisodeById(epId);
            if (ep) {
                ep.sources = ep.sources || [];
                ep.sources.push({ id: uid(), type: '', label: '', url: '' });
                renderSeasonsList();
            }
        };
    });

    container.querySelectorAll('[data-ep-thumb-box]').forEach(box => {
        box.onclick = () => {
            const id = box.dataset.epThumbBox;
            triggerCropModal(`eti_${id}`, `etp_${id}`, 16/9, id, 'episode');
        };
    });

    container.querySelectorAll('[data-ep-thumb-input]').forEach(input => { input.id = `eti_${input.dataset.epThumbInput}`; });
    container.querySelectorAll('[data-ep-thumb]').forEach(img => { img.id = `etp_${img.dataset.epThumb}`; });

    // Bind inputs de título/duração para atualizar em tempo real (mostra no header do accordion ao fechar)
    container.querySelectorAll('[data-ep-title]').forEach(input => {
        input.oninput = () => { const ep = findEpisodeById(input.dataset.epTitle); if (ep) ep.title = input.value; };
    });
    container.querySelectorAll('[data-ep-duration]').forEach(input => {
        input.oninput = () => { const ep = findEpisodeById(input.dataset.epDuration); if (ep) ep.duration = input.value; };
    });
}

function findEpisodeById(epId) {
    for (const s of creatorData.seasons) {
        const found = (s.episodes || []).find(e => e.id === epId);
        if (found) return found;
    }
    return null;
}

function renderEpisodeSources(ep) {
    const container = document.querySelector(`[data-ep-sources="${ep.id}"]`); if (!container) return;
    container.innerHTML = '';
    const sources = ep.sources || [];
    if (sources.length === 0) {
        container.innerHTML = '<div class="source-empty-state" style="font-size:11px">Sem fontes. Clique em + Adicionar Fonte.</div>';
        return;
    }
    const tmpl = document.getElementById('videoSourceItemTemplate');
    sources.forEach((src, sidx) => {
        const clone = tmpl.content.cloneNode(true);
        const card = clone.querySelector('.source-item-card');
        card.querySelector('.source-item-badge').textContent = `Fonte ${sidx + 1}`;
        const ts = card.querySelector('.source-type-select'); ts.value = src.type || ''; ts.setAttribute('data-src-type', src.id);
        const ti = card.querySelector('.source-title-input'); ti.value = src.label || ''; ti.setAttribute('data-src-label', src.id);
        const ui = card.querySelector('.source-url-input'); ui.value = src.url || ''; ui.setAttribute('data-src-url', src.id);
        const usedTypes = sources.filter((_, i) => i !== sidx).map(s => s.type).filter(t => t && t !== 'other');
        Array.from(ts.options).forEach(opt => { if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) opt.disabled = true; });
        ts.onchange = () => {
            const nt = ts.value;
            if (nt && nt !== 'other' && sources.some((s, i) => i !== sidx && s.type === nt)) { showMsg('Tipo duplicado neste episódio!', 'error'); ts.value = src.type || ''; return; }
            src.type = nt;
            if (!src.label && nt) src.label = sourceTypeLabel(nt);
            renderEpisodeSources(ep);
        };
        ti.oninput = () => { src.label = ti.value; };
        ui.oninput = () => {
            src.url = ui.value;
            if (!src.type && ui.value) {
                const d = detectSourceType(ui.value);
                if (d !== 'other' && !sources.some((s, i) => i !== sidx && s.type === d)) { src.type = d; if (!src.label) src.label = sourceTypeLabel(d); renderEpisodeSources(ep); }
            }
        };
        card.querySelector('[data-action="remove-source"]').onclick = () => { sources.splice(sidx, 1); renderEpisodeSources(ep); };
        container.appendChild(card);
    });
}

document.getElementById('btnAddSeasonBtn')?.addEventListener('click', () => {
    syncCreatorInputsToState();
    const newSeason = { id: uid(), seasonNumber: creatorData.seasons.length + 1, seasonCoverUrl: '', episodes: [] };
    // Cria com 1 episódio automático
    const firstEp = { id: uid(), title: 'Episódio 1', duration: '45m', thumbUrl: '', sources: [] };
    newSeason.episodes.push(firstEp);
    creatorData.seasons.push(newSeason);
    uiState.openSeasons.add(newSeason.id);
    uiState.openEpisodes.add(firstEp.id);
    renderSeasonsList();
});

// ═══════════════════════════════════════════════════════════════
// CROPPER
// ═══════════════════════════════════════════════════════════════
window.triggerCropModal = function (inputId, previewId, ar) {
    const fi = document.getElementById(inputId); currentTargetPreview = document.getElementById(previewId); if (!fi) return;
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
                const cropImg = document.getElementById('cropperImage'); if (cropImg) cropImg.src = ev.target.result;
                if (!document.getElementById('profileModal')?.classList.contains('hidden')) { previousModal = 'profileModal'; closeModal('profileModal'); }
                else if (!document.getElementById('creatorModal')?.classList.contains('hidden')) { previousModal = 'creatorModal'; closeModal('creatorModal'); }
                openModal('cropperModal');
                if (cropperInstance) cropperInstance.destroy();
                cropperInstance = new Cropper(cropImg, { aspectRatio: ar || NaN, viewMode: 1, autoCropArea: 1, responsive: true, crop() { const cv = cropperInstance.getCroppedCanvas({ width: 800 }); if (cv) { const u = cv.toDataURL('image/jpeg', 0.9); ['prevMobile','prevPC','prevTV'].forEach(id => { const el = document.getElementById(id); if (el) el.src = u; }); } } });
            };
            tmp.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    fi.click();
};

document.getElementById('btnConfirmCrop')?.addEventListener('click', () => {
    if (!cropperInstance) return;
    const cv = cropperInstance.getCroppedCanvas({ width: 1200 });
    if (cv && currentTargetPreview) {
        const dataUrl = cv.toDataURL('image/jpeg', 0.92);
        currentTargetPreview.src = dataUrl;
        currentTargetPreview.classList.remove('hidden');
        // Se for season/episode, atualiza o state
        if (currentTargetPreview.dataset.seasonCover) {
            const s = creatorData.seasons.find(s => s.id === currentTargetPreview.dataset.seasonCover);
            if (s) s.seasonCoverUrl = dataUrl;
        }
        if (currentTargetPreview.dataset.epThumb) {
            const ep = findEpisodeById(currentTargetPreview.dataset.epThumb);
            if (ep) ep.thumbUrl = dataUrl;
        }
    }
    closeModal('cropperModal');
    if (previousModal) openModal(previousModal);
    cropperInstance?.destroy();
});
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
// HASH / MEDIA TYPE
// ═══════════════════════════════════════════════════════════════
function handleHashRouting() { const h = window.location.hash; if (h.startsWith('#/midia/')) { const i = mediaCatalog.find(m => m.id === h.replace('#/midia/', '')); if (i) openDetails(i); } }
window.addEventListener('hashchange', handleHashRouting);

document.getElementById('mediaType')?.addEventListener('change', (e) => {
    creatorData.type = e.target.value;
    document.getElementById('movieFileArea')?.classList.toggle('hidden', creatorData.type !== 'movie');
    document.getElementById('seriesBuilderArea')?.classList.toggle('hidden', creatorData.type === 'movie');
    const lbl = document.getElementById('mediaDurationLabel');
    if (lbl) lbl.innerText = creatorData.type === 'movie' ? "Duração (Ex: 2h 10m)" : "Duração Média (Ex: 45m/ep)";
    if (creatorData.type === 'serie' && !creatorData.seasons.length) {
        // Cria 1ª temporada + 1 episódio automático
        const season = { id: uid(), seasonNumber: 1, seasonCoverUrl: '', episodes: [] };
        const ep = { id: uid(), title: 'Episódio 1', duration: '45m', thumbUrl: '', sources: [] };
        season.episodes.push(ep);
        creatorData.seasons.push(season);
        uiState.openSeasons.add(season.id);
        uiState.openEpisodes.add(ep.id);
        renderSeasonsList();
    }
});

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
// PLAYER
// ═══════════════════════════════════════════════════════════════
const playerBox = document.getElementById('playerModalBox'), playerTopbar = document.getElementById('playerTopbar'), playerBottombar = document.getElementById('playerBottombar'), playerContainer = document.getElementById('playerContainerView'), playerLoading = document.getElementById('playerLoading');
function isPlayerOpen() { return !document.getElementById('playerModal')?.classList.contains('hidden'); }
function isInFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function showPlayerControls() { if (!isPlayerOpen()) return; playerTopbar?.classList.remove('is-hidden'); playerBottombar?.classList.remove('is-hidden'); playerBox?.classList.remove('cursor-hidden'); clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer); controlsHideTimer = setTimeout(() => { playerTopbar?.classList.add('is-hidden'); playerBottombar?.classList.add('is-hidden'); }, 4000); if (!('ontouchstart' in window)) cursorHideTimer = setTimeout(() => playerBox?.classList.add('cursor-hidden'), 3500); }
playerBox?.addEventListener('mousemove', showPlayerControls);
playerBox?.addEventListener('touchstart', showPlayerControls, { passive: true });
playerBox?.addEventListener('click', (e) => { if (e.target.closest('button, .audio-boost-pill, .player-source-btn')) return; if (playerTopbar?.classList.contains('is-hidden')) showPlayerControls(); else { playerTopbar?.classList.add('is-hidden'); playerBottombar?.classList.add('is-hidden'); } });
['fullscreenchange','webkitfullscreenchange'].forEach(e => document.addEventListener(e, () => { if (isPlayerOpen()) { showPlayerControls(); const btn = document.getElementById('btnToggleFullscreen'); if (btn) btn.innerHTML = isInFullscreen() ? '⤢' : '⛶'; } }));

document.getElementById('btnToggleFullscreen')?.addEventListener('click', async (e) => { e.stopPropagation(); try { if (!isInFullscreen()) { if (playerBox?.requestFullscreen) await playerBox.requestFullscreen(); else if (playerBox?.webkitRequestFullscreen) await playerBox.webkitRequestFullscreen(); if (screen.orientation?.lock) { try { await screen.orientation.lock('landscape'); } catch {} } } else { if (document.exitFullscreen) await document.exitFullscreen(); else if (document.webkitExitFullscreen) await document.webkitExitFullscreen(); if (screen.orientation?.unlock) { try { screen.orientation.unlock(); } catch {} } } } catch {} showPlayerControls(); });
document.getElementById('btnToggleStretch')?.addEventListener('click', (e) => { e.stopPropagation(); isStretchMode = !isStretchMode; playerContainer?.classList.toggle('stretch-mode', isStretchMode); const btn = document.getElementById('btnToggleStretch'); if (btn) { btn.classList.toggle('active', isStretchMode); btn.innerHTML = isStretchMode ? '⇲' : '⇱'; } showMsg(isStretchMode ? '📐 Esticado' : '🖼️ Ajustado', 'success'); showPlayerControls(); });
document.getElementById('btnReloadPlayer')?.addEventListener('click', (e) => { e.stopPropagation(); if (currentVideoUrl) { playSourceByIndex(currentSourceIndex); showMsg('Recarregando...', 'success'); } });

function initiatePlay(sources, mainTitle, subTitle) { if (!sources?.length) { showMsg('Nenhum link!', 'error'); return; } currentSources = sources.slice(); currentPlayerMeta = { mainTitle, subTitle }; openModal('playerModal'); document.getElementById('btnChangeSource')?.classList.toggle('hidden', currentSources.length <= 1); if (currentSources.length === 1) { currentSourceIndex = 0; playSourceByIndex(0); } else showSourceSelector(); }
function showSourceSelector() { const selector = document.getElementById('playerSourceSelector'), list = document.getElementById('playerSourceList'); if (!selector || !list) return; hidePlayerError(); playerLoading?.classList.add('hidden'); document.getElementById('playerTitleDisplay').innerText = currentPlayerMeta.mainTitle || 'Escolha uma fonte'; document.getElementById('playerSubDisplay').innerText = currentPlayerMeta.subTitle || 'MasterFlix'; document.getElementById('playerProviderBadge')?.classList.add('hidden'); document.getElementById('playerSourceSelectorSub').textContent = `${currentSources.length} fontes disponíveis`; list.innerHTML = ''; currentSources.forEach((src, idx) => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'player-source-btn'; btn.tabIndex = 0; if (idx === currentSourceIndex && currentVideoUrl) btn.classList.add('current'); const ad = getAdapter(src.type); const title = src.label || ad.name; const short = src.url ? (src.url.length > 55 ? src.url.substring(0, 55) + '…' : src.url) : ''; const ct = (idx === currentSourceIndex && currentVideoUrl) ? '<span class="current-tag">Atual</span>' : ''; btn.innerHTML = `<div class="source-btn-top"><span class="source-btn-title">${ad.icon} ${title}${ct}</span><span class="source-btn-type" style="color:${ad.color}">${ad.name}</span></div><div class="source-btn-url">${short}</div>`; btn.onclick = () => { hideSourceSelector(); currentSourceIndex = idx; playSourceByIndex(idx); }; list.appendChild(btn); }); selector.classList.remove('hidden'); showPlayerControls(); setTimeout(() => list.querySelector('.player-source-btn')?.focus(), 100); }
function hideSourceSelector() { document.getElementById('playerSourceSelector')?.classList.add('hidden'); }
document.getElementById('btnCancelSourceSelection')?.addEventListener('click', () => currentVideoUrl ? hideSourceSelector() : closePlayer());
document.getElementById('btnChangeSource')?.addEventListener('click', (e) => { e.stopPropagation(); showSourceSelector(); });

function playSourceByIndex(idx) { const src = currentSources[idx]; if (!src?.url) { showMsg('Link inválido!', 'error'); return; } const ad = getAdapter(src.type); const finalUrl = ad.formatUrl(src.url); currentVideoUrl = finalUrl; currentSourceIndex = idx; document.getElementById('playerTitleDisplay').innerText = currentPlayerMeta.mainTitle || 'Assistindo'; document.getElementById('playerSubDisplay').innerText = currentPlayerMeta.subTitle || 'MasterFlix'; const badge = document.getElementById('playerProviderBadge'); if (badge) { badge.innerHTML = `${ad.icon} ${src.label || ad.name}`; badge.style.background = `${ad.color}30`; badge.style.borderColor = `${ad.color}80`; badge.classList.remove('hidden'); } playerLoading?.classList.remove('hidden'); document.getElementById('playerLoadingText').textContent = `Carregando ${ad.name}...`; document.getElementById('playerLoadingSub').textContent = `Adaptador otimizado`; hidePlayerError(); hideSourceSelector(); playerContainer?.querySelectorAll('iframe, video').forEach(el => el.remove()); if (isStretchMode) { isStretchMode = false; playerContainer?.classList.remove('stretch-mode'); const btn = document.getElementById('btnToggleStretch'); if (btn) { btn.classList.remove('active'); btn.innerHTML = '⇱'; } } const booster = document.getElementById('audioBoostSlider'); if (booster) booster.value = 100; setAudioBoost(100); const el = ad.createElement(finalUrl); el.addEventListener('load', () => { setTimeout(() => playerLoading?.classList.add('hidden'), 400); clearTimeout(playerErrorTimer); setTimeout(() => scanAndBoostAudio(), 1500); }); if (el.tagName === 'VIDEO') { el.addEventListener('canplay', () => { setTimeout(() => playerLoading?.classList.add('hidden'), 200); clearTimeout(playerErrorTimer); }); el.addEventListener('error', () => showPlayerError('Vídeo não disponível.', ad.name)); } playerContainer?.appendChild(el); clearTimeout(playerErrorTimer); playerErrorTimer = setTimeout(() => playerLoading?.classList.add('hidden'), ad.errorLoadMs); startOverlayCleaner(); showPlayerControls(); setTimeout(() => { const tip = document.getElementById('playerTip'); if (tip && isPlayerOpen()) { tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 4000); } }, 2500); const si = setInterval(() => { if (!isPlayerOpen()) { clearInterval(si); return; } scanAndBoostAudio(); }, 5000); }
function showPlayerError(desc, name) { document.getElementById('playerErrorTitle').textContent = `Falha em ${name || 'reprodução'}`; document.getElementById('playerErrorDesc').textContent = desc || 'Tente outra fonte.'; document.getElementById('btnErrorTryAnother').style.display = currentSources.length > 1 ? '' : 'none'; document.getElementById('playerErrorScreen').classList.remove('hidden'); playerLoading?.classList.add('hidden'); }
function hidePlayerError() { document.getElementById('playerErrorScreen')?.classList.add('hidden'); }
document.getElementById('btnErrorTryAnother')?.addEventListener('click', () => { hidePlayerError(); showSourceSelector(); });
document.getElementById('btnErrorReload')?.addEventListener('click', () => { hidePlayerError(); playSourceByIndex(currentSourceIndex); });

function initAudioContext() { if (audioCtx) return; try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioGainNode = audioCtx.createGain(); audioGainNode.connect(audioCtx.destination); audioGainNode.gain.value = 1.0; } catch {} }
function boostMediaElement(el) { if (!audioCtx || !audioGainNode || boostedElements.has(el)) return; try { audioCtx.createMediaElementSource(el).connect(audioGainNode); boostedElements.add(el); } catch {} }
function scanAndBoostAudio() { if (!audioCtx) return; document.querySelectorAll('video, audio').forEach(el => boostMediaElement(el)); try { const iframe = document.querySelector('#playerContainerView iframe'); if (iframe?.contentDocument) iframe.contentDocument.querySelectorAll('video, audio').forEach(el => boostMediaElement(el)); } catch {} }
function setAudioBoost(pct) { audioBoostLevel = pct; initAudioContext(); if (audioCtx?.state === 'suspended') audioCtx.resume(); if (audioGainNode) audioGainNode.gain.value = pct / 100; scanAndBoostAudio(); const icon = document.getElementById('audioBoostIcon'), val = document.getElementById('audioBoostValue'); if (val) val.textContent = pct + '%'; if (icon && val) { if (pct <= 100) { icon.textContent = '🔈'; val.style.color = '#aaa'; } else if (pct <= 200) { icon.textContent = '🔊'; val.style.color = '#fff'; } else { icon.textContent = '🔊'; val.style.color = pct <= 350 ? '#ff9800' : '#ff5252'; } } }
document.getElementById('audioBoostSlider')?.addEventListener('input', (e) => setAudioBoost(parseInt(e.target.value)));
document.getElementById('audioBoostIcon')?.addEventListener('click', () => { const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = audioBoostLevel > 100 ? 100 : 200; setAudioBoost(parseInt(sl.value)); } });
function startOverlayCleaner() { if (overlayCleanerInterval) return; overlayCleanerInterval = setInterval(() => { if (!isPlayerOpen()) return; try { const iframe = document.querySelector('#playerContainerView iframe'); if (!iframe?.contentDocument) return; const doc = iframe.contentDocument; doc.querySelectorAll('div, aside, section, span').forEach(el => { const s = doc.defaultView?.getComputedStyle(el); if (!s) return; const isOv = (s.position === 'fixed' || s.position === 'absolute') && (parseInt(s.zIndex) || 0) > 100; if (isOv && el.offsetWidth > iframe.clientWidth * 0.6 && el.offsetHeight > iframe.clientHeight * 0.4 && !el.querySelector('video')) { el.style.display = 'none'; el.style.pointerEvents = 'none'; } }); } catch {} }, 2000); }
function stopOverlayCleaner() { if (overlayCleanerInterval) { clearInterval(overlayCleanerInterval); overlayCleanerInterval = null; } }

function closePlayer() { clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer); clearTimeout(playerErrorTimer); if (isInFullscreen()) { try { document.exitFullscreen(); } catch {} try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch {} } playerContainer?.querySelectorAll('iframe, video').forEach(el => el.remove()); isStretchMode = false; playerContainer?.classList.remove('stretch-mode'); playerLoading?.classList.remove('hidden'); hideSourceSelector(); hidePlayerError(); closeModal('playerModal'); playerBox?.classList.remove('cursor-hidden'); playerTopbar?.classList.remove('is-hidden'); playerBottombar?.classList.remove('is-hidden'); stopOverlayCleaner(); currentVideoUrl = ''; currentSources = []; currentSourceIndex = 0; document.getElementById('playerProviderBadge')?.classList.add('hidden'); document.getElementById('btnChangeSource')?.classList.add('hidden'); const btnStretch = document.getElementById('btnToggleStretch'); if (btnStretch) { btnStretch.classList.remove('active'); btnStretch.innerHTML = '⇱'; } renderContinueWatching(); if (audioGainNode) audioGainNode.gain.value = 1.0; const b = document.getElementById('audioBoostSlider'); if (b) b.value = 100; setAudioBoost(100); }
document.getElementById('btnClosePlayer')?.addEventListener('click', (e) => { e.stopPropagation(); closePlayer(); });

document.addEventListener('keydown', (e) => { if (!isPlayerOpen()) return; if (e.key === 'Escape') { closePlayer(); return; } if (e.key === 'f' || e.key === 'F') document.getElementById('btnToggleFullscreen')?.click(); if (e.key === 's' || e.key === 'S') document.getElementById('btnToggleStretch')?.click(); if (e.key === 'r' || e.key === 'R') document.getElementById('btnReloadPlayer')?.click(); if (e.key === 'c' || e.key === 'C') document.getElementById('btnChangeSource')?.click(); if (e.key === 'ArrowUp') { e.preventDefault(); const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = Math.min(500, parseInt(sl.value) + 25); setAudioBoost(parseInt(sl.value)); } } if (e.key === 'ArrowDown') { e.preventDefault(); const sl = document.getElementById('audioBoostSlider'); if (sl) { sl.value = Math.max(100, parseInt(sl.value) - 25); setAudioBoost(parseInt(sl.value)); } } showPlayerControls(); });

// ═══════════════════════════════════════════════════════════════
// FORM SUBMIT (SAVE)
// ═══════════════════════════════════════════════════════════════
document.getElementById('mediaForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncCreatorInputsToState(); // ⚠️ Salva inputs visíveis antes de submeter

    if (!selectedGenres.length) { showMsg('Selecione ao menos 1 gênero!', 'error'); document.querySelector('.creator-tab[data-tab="info"]')?.click(); return; }

    const editId = document.getElementById('editMediaId')?.value;
    const title = document.getElementById('mediaTitle')?.value.trim() || '';
    if (!title) { showMsg('Digite um título!', 'error'); document.querySelector('.creator-tab[data-tab="info"]')?.click(); return; }

    let cv = document.getElementById('mediaCoverPreview')?.src || '';
    let bd = document.getElementById('mediaBackdropPreview')?.src || '';
    if (!isValidImageUrl(cv) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) cv = ex.coverUrl; }
    if (!isValidImageUrl(bd) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) bd = ex.backdropUrl; }

    let payload = {
        type: creatorData.type,
        genres: [...selectedGenres],
        category: selectedGenres[0],
        title,
        year: document.getElementById('mediaYear')?.value.trim() || '',
        duration: document.getElementById('mediaDuration')?.value.trim() || '',
        description: document.getElementById('mediaDesc')?.value.trim() || '',
        coverUrl: isValidImageUrl(cv) ? cv : '',
        backdropUrl: isValidImageUrl(bd) ? bd : ''
    };

    if (creatorData.type === 'movie') {
        const vs = creatorData.movieSources.filter(s => s.url?.trim());
        if (!vs.length) { showMsg('Adicione ao menos 1 fonte de vídeo!', 'error'); document.querySelector('.creator-tab[data-tab="content"]')?.click(); return; }
        const ut = vs.map(s => s.type).filter(t => t && t !== 'other');
        const dup = ut.find((t, i) => ut.indexOf(t) !== i);
        if (dup) { showMsg(`Fonte duplicada: ${sourceTypeLabel(dup)}`, 'error'); return; }
        payload.videoSources = vs.map(s => ({ type: s.type || 'other', label: s.label || sourceTypeLabel(s.type) || 'Fonte', url: s.url.trim() }));
        payload.videoUrl = payload.videoSources[0].url;
    } else {
        const us = [];
        for (let si = 0; si < creatorData.seasons.length; si++) {
            const s = creatorData.seasons[si];
            const sc = isValidImageUrl(s.seasonCoverUrl) ? s.seasonCoverUrl : '';
            const ue = [];
            for (let ei = 0; ei < (s.episodes || []).length; ei++) {
                const ep = s.episodes[ei];
                const et = isValidImageUrl(ep.thumbUrl) ? ep.thumbUrl : '';
                const epS = (ep.sources || []).filter(src => src.url?.trim());
                const epUT = epS.map(s => s.type).filter(t => t && t !== 'other');
                const epD = epUT.find((t, i) => epUT.indexOf(t) !== i);
                if (epD) { showMsg(`T${si+1}E${ei+1}: fonte duplicada "${sourceTypeLabel(epD)}"`, 'error'); return; }
                ue.push({
                    title: ep.title?.trim() || `Episódio ${ei + 1}`,
                    duration: ep.duration?.trim() || '',
                    thumbUrl: et,
                    videoSources: epS.map(src => ({ type: src.type || 'other', label: src.label || sourceTypeLabel(src.type) || 'Fonte', url: src.url.trim() })),
                    videoUrl: epS.length ? epS[0].url.trim() : ''
                });
            }
            us.push({ seasonNumber: si + 1, seasonCoverUrl: sc, episodes: ue });
        }
        payload.seasons = us;
    }

    try {
        if (editId) await set(ref(rtdb, "catalog/" + editId), payload);
        else await set(push(ref(rtdb, "catalog")), payload);
        showMsg('Salvo com sucesso! ✅', 'success');
        closeModal('creatorModal');
        resetCreator();
        await loadCatalog();
    } catch (err) { showMsg('Erro: ' + err.message, 'error'); }
});

document.getElementById('btnCancelCreator')?.addEventListener('click', () => {
    if (confirm('Descartar alterações?')) { closeModal('creatorModal'); resetCreator(); }
});

function resetCreator() {
    creatorData = { type: 'movie', movieSources: [], seasons: [] };
    uiState.openSeasons.clear();
    uiState.openEpisodes.clear();
    selectedGenres = [];
    document.getElementById('mediaForm')?.reset();
    document.getElementById('editMediaId').value = '';
    document.getElementById('mediaCoverPreview')?.classList.add('hidden');
    document.getElementById('mediaBackdropPreview')?.classList.add('hidden');
    renderGenreSelector();
    renderMovieSources();
    renderSeasonsList();
    document.querySelector('.creator-tab[data-tab="info"]')?.click();
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════
window.editMedia = (id) => {
    const i = mediaCatalog.find(m => m.id === id); if (!i) return;
    resetCreator();
    document.getElementById('editMediaId').value = i.id;
    const ts = document.getElementById('mediaType'); ts.value = i.type; ts.disabled = true;
    creatorData.type = i.type;
    document.getElementById('movieFileArea')?.classList.toggle('hidden', i.type !== 'movie');
    document.getElementById('seriesBuilderArea')?.classList.toggle('hidden', i.type === 'movie');
    selectedGenres = Array.isArray(i.genres) && i.genres.length ? [...i.genres] : (i.category ? [i.category] : []);
    renderGenreSelector();
    document.getElementById('mediaTitle').value = i.title || '';
    document.getElementById('mediaYear').value = i.year || '';
    document.getElementById('mediaDuration').value = i.duration || '';
    document.getElementById('mediaDesc').value = i.description || '';
    if (i.coverUrl) { const img = document.getElementById('mediaCoverPreview'); if (img) { img.src = i.coverUrl; img.classList.remove('hidden'); } }
    if (i.backdropUrl) { const img = document.getElementById('mediaBackdropPreview'); if (img) { img.src = i.backdropUrl; img.classList.remove('hidden'); } }
    document.getElementById('creatorTitle').innerText = "Editar";
    document.getElementById('creatorSubtitle').innerText = "Ajuste os dados abaixo";

    if (i.type === 'movie') {
        creatorData.movieSources = normalizeSources(i).map(s => ({ id: uid(), ...s }));
        renderMovieSources();
    } else {
        creatorData.seasons = (i.seasons || []).map((s, si) => ({
            id: uid(),
            seasonNumber: si + 1,
            seasonCoverUrl: s.seasonCoverUrl || '',
            episodes: (s.episodes || []).map(ep => ({
                id: uid(),
                title: ep.title || '',
                duration: ep.duration || '',
                thumbUrl: ep.thumbUrl || '',
                sources: normalizeEpisodeSources(ep).map(src => ({ id: uid(), ...src }))
            }))
        }));
        // Abre primeira temporada
        if (creatorData.seasons[0]) uiState.openSeasons.add(creatorData.seasons[0].id);
        renderSeasonsList();
    }
    closeModal('adminModal');
    openModal('creatorModal');
};

window.deleteMedia = async (id) => { if (confirm("Apagar este item?")) { try { await remove(ref(rtdb, "catalog/" + id)); showMsg('Removido!', 'success'); loadCatalog(); } catch { showMsg('Erro', 'error'); } } };

function renderAdminCatalogList() {
    const c = document.getElementById('adminCatalogList'); if (!c) return;
    const sv = normalizeText(document.getElementById('adminSearchInput')?.value || ''); c.innerHTML = '';
    mediaCatalog.forEach(i => { if (sv && !normalizeText(i.title).includes(sv)) return; const d = document.createElement('div'); d.className = 'admin-item'; d.innerHTML = `<div><strong>${i.title}</strong><div style="font-size:10px;color:#888">${i.type === 'movie' ? '🎬 Filme' : '📺 Série'}${i.year ? ' • ' + i.year : ''}</div></div><div style="display:flex;gap:6px"><button class="btn-secondary" onclick="editMedia('${i.id}')">✏️</button><button class="btn-danger" onclick="deleteMedia('${i.id}')">🗑️</button></div>`; c.appendChild(d); });
}
document.getElementById('adminSearchInput')?.addEventListener('input', renderAdminCatalogList);
document.getElementById('btnCloseAdmin')?.addEventListener('click', () => closeModal('adminModal'));
document.getElementById('btnAddNewFromAdmin')?.addEventListener('click', () => { closeModal('adminModal'); openCreator(); });

function openCreator() {
    resetCreator();
    document.getElementById('mediaType').disabled = false;
    document.getElementById('creatorTitle').innerText = 'Publicar';
    document.getElementById('creatorSubtitle').innerText = 'Preencha os dados abaixo';
    openModal('creatorModal');
}

// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS + STORAGE (compact)
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnCloseSuggestion')?.addEventListener('click', () => closeModal('suggestionModal'));
document.getElementById('btnSendSuggestion')?.addEventListener('click', async () => { const user = auth.currentUser; if (!user) return showMsg('Login!', 'error'); const text = document.getElementById('suggestionText')?.value.trim(); const type = document.getElementById('suggestionType')?.value; if (!text || text.length < 5) return showMsg('Escreva mais!', 'error'); try { await set(push(ref(rtdb, "suggestions")), { userId: user.uid, userEmail: user.email, userName: getUserCache('name') || user.email.split('@')[0], text, type, timestamp: Date.now() }); document.getElementById('suggestionText').value = ''; showMsg('Enviado!', 'success'); closeModal('suggestionModal'); } catch { showMsg('Erro', 'error'); } });
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

document.getElementById('btnCloseStorage')?.addEventListener('click', () => closeModal('storageModal'));
async function loadStorageInfo() { const c = document.getElementById('storageContent'); if (!c) return; c.innerHTML = '<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto 14px;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando...</p></div>'; try { const [cs, us, ss] = await Promise.all([get(ref(rtdb, "catalog")).catch(() => null), get(ref(rtdb, "users")).catch(() => null), get(ref(rtdb, "suggestions")).catch(() => null)]); const cd = cs?.exists() ? cs.val() : {}, ud = us?.exists() ? us.val() : {}, sd = ss?.exists() ? ss.val() : {}; const cb = estimateJsonBytes(cd), ub = estimateJsonBytes(ud), sb = estimateJsonBytes(sd), tb = cb + ub + sb; const cc = Object.keys(cd).length, uc = Object.keys(ud).length, scc = Object.keys(sd).length; let mc = 0, sc2 = 0, te = 0; Object.values(cd).forEach(i => { if (i.type === 'movie') mc++; else { sc2++; (i.seasons || []).forEach(s => te += (s.episodes || []).length); } }); const pct = Math.min(100, (tb / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100); const free = FIREBASE_RTDB_FREE_LIMIT_BYTES - tb; let bc = '#4caf50', st = '✅ Saudável'; if (pct > 50) bc = '#8bc34a'; if (pct > 70) { bc = '#ff9800'; st = '⚠️ Atenção'; } if (pct > 85) { bc = '#ff5722'; st = '🔴 Crítico'; } c.innerHTML = `<div style="text-align:center;margin-bottom:20px"><div style="font-size:38px;font-weight:900;color:${bc}">${pct.toFixed(1)}%</div><div style="font-size:14px;font-weight:800;margin-top:4px">${st}</div></div><div style="margin-bottom:22px"><div class="storage-bar-outer"><div class="storage-bar-inner" style="width:${Math.max(2,pct)}%;background:${bc}"></div></div><div class="storage-info"><span>${formatBytes(tb)} usado</span><span>${formatBytes(free)} livre</span></div></div><div style="display:flex;gap:10px;margin-bottom:22px"><div class="storage-icon-card"><span class="sto-icon">🎬</span><div class="sto-count">${mc}</div><div class="sto-label">Filmes</div></div><div class="storage-icon-card"><span class="sto-icon">📺</span><div class="sto-count">${sc2}</div><div class="sto-label">Séries</div></div><div class="storage-icon-card"><span class="sto-icon">🎞️</span><div class="sto-count">${te}</div><div class="sto-label">Episódios</div></div></div><div class="storage-detail-item"><span class="storage-label">Catálogo (${cc})</span><span class="storage-value">${formatBytes(cb)}</span></div><div class="storage-detail-item"><span class="storage-label">Usuários (${uc})</span><span class="storage-value">${formatBytes(ub)}</span></div><div class="storage-detail-item"><span class="storage-label">Sugestões (${scc})</span><span class="storage-value">${formatBytes(sb)}</span></div>`; } catch (e) { c.innerHTML = `<p style="text-align:center;color:#ff5252">${e.message}</p>`; } }

// ═══════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════
function openProfileModal() { openModal('profileModal'); updateDevicesCountBadge(); }

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
    if (user) setTxt('profileEmailDisplay', user.email);
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

document.getElementById('btnChangePasswordFromProfile')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    if (!confirm(`Enviar link de redefinição de senha para ${user.email}?`)) return;
    try { await sendPasswordResetEmail(auth, user.email); showMsg(`Link enviado para ${user.email}!`, 'success'); }
    catch (e) { showMsg('Erro: ' + e.message, 'error'); }
});

async function handleLogout() {
    try {
        const user = auth.currentUser;
        if (user) {
            // Remove ESTE dispositivo antes de sair
            const deviceId = getOrCreateDeviceId();
            try { await remove(ref(rtdb, `devices/${user.uid}/${deviceId}`)); } catch {}
        }
        stopDeviceHeartbeat();
        currentUserUid = null;
        await signOut(auth);
        resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        closeModal('profileModal'); closeSidebar();
        activeItem = null; mediaCatalog = []; isAdmin = false;
        renderApp();
        showMsg('Saiu! 👋', 'success');
    } catch { showMsg('Erro', 'error'); }
}
document.getElementById('btnLogout')?.addEventListener('click', handleLogout);

// ═══════════════════════════════════════════════════════════════
// DEVICES MODAL
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnOpenDevicesModal')?.addEventListener('click', () => { closeModal('profileModal'); openDevicesModal(); });
document.getElementById('btnCloseDevices')?.addEventListener('click', () => { closeModal('devicesModal'); openModal('profileModal'); });

async function openDevicesModal() {
    openModal('devicesModal');
    const list = document.getElementById('devicesList');
    const info = document.getElementById('devicesInfoText');
    if (list) list.innerHTML = '<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto;width:32px;height:32px"></div></div>';
    if (info) info.textContent = 'Carregando dispositivos...';

    const user = auth.currentUser; if (!user) return;
    try {
        const snap = await get(ref(rtdb, `devices/${user.uid}`));
        const currentId = getOrCreateDeviceId();
        if (!snap.exists()) {
            if (list) list.innerHTML = '<p style="text-align:center;color:#666;padding:30px">Nenhum dispositivo</p>';
            return;
        }
        const devices = Object.values(snap.val());
        devices.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
        if (info) info.textContent = `${devices.length} dispositivo(s) ativos na sua conta`;

        list.innerHTML = '';
        devices.forEach(d => {
            const isCurrent = d.deviceId === currentId;
            const item = document.createElement('div');
            item.className = 'device-item' + (isCurrent ? ' current-device' : '');
            const lastSeen = d.lastActive ? timeAgo(d.lastActive) : '?';
            const firstDate = d.firstLogin ? new Date(d.firstLogin).toLocaleDateString('pt-BR') : '?';
            item.innerHTML = `
                <div class="device-icon-big">${d.icon || '📱'}</div>
                <div class="device-info">
                    <div class="device-name">${d.name || 'Dispositivo'} ${isCurrent ? '<span class="device-current-tag">ESTE APARELHO</span>' : ''}</div>
                    <div class="device-meta">
                        <span>🌐 ${d.browser || '?'}</span>
                        <span>💻 ${d.os || '?'}</span>
                    </div>
                    <div class="device-meta" style="margin-top:1px">
                        <span>🕐 Ativo ${lastSeen}</span>
                        <span>📅 Desde ${firstDate}</span>
                    </div>
                </div>
                ${!isCurrent ? `<button type="button" class="device-remove-btn" data-remove-dev="${d.deviceId}" title="Encerrar sessão">✕</button>` : ''}
            `;
            list.appendChild(item);
        });

        list.querySelectorAll('[data-remove-dev]').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Encerrar sessão neste dispositivo?')) return;
                const did = btn.dataset.removeDev;
                await removeDevice(user.uid, did);
                openDevicesModal();
                updateDevicesCountBadge();
                showMsg('Sessão encerrada!', 'success');
            };
        });
    } catch (e) {
        if (list) list.innerHTML = `<p style="text-align:center;color:#ff5252;padding:20px">${e.message}</p>`;
    }
}

document.getElementById('btnLogoutAllDevices')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    if (!confirm('Encerrar todas as outras sessões ativas?')) return;
    const currentId = getOrCreateDeviceId();
    await removeAllOtherDevices(user.uid, currentId);
    showMsg('Outras sessões encerradas!', 'success');
    openDevicesModal();
    updateDevicesCountBadge();
});

async function updateDevicesCountBadge() {
    const user = auth.currentUser; if (!user) return;
    try {
        const snap = await get(ref(rtdb, `devices/${user.uid}`));
        const count = snap.exists() ? Object.keys(snap.val()).length : 1;
        const badge = document.getElementById('devicesCountBadge');
        if (badge) badge.textContent = count;
    } catch {}
}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnTogglePassword')?.addEventListener('click', () => {
    const pw = document.getElementById('authPassword'); if (!pw) return;
    const isPassword = pw.type === 'password';
    pw.type = isPassword ? 'text' : 'password';
    document.getElementById('btnTogglePassword').textContent = isPassword ? '🙈' : '👁️';
});

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

const toggleAuth = document.getElementById('toggleAuthMode');
function updateAuthMode() {
    const modal = document.getElementById('authModalBody');
    if (isSignUpMode) modal?.classList.add('signup-mode'); else modal?.classList.remove('signup-mode');
    document.getElementById('authSubtitle').innerText = isSignUpMode ? 'Crie sua conta gratuita' : 'Entre na sua conta para continuar';
    document.getElementById('btnAuthSubmit').innerText = isSignUpMode ? 'Criar Conta' : 'Entrar na Conta';
    if (toggleAuth) toggleAuth.innerHTML = isSignUpMode ? 'Já tem conta? <span style="color:var(--primary-color)">Entrar</span>' : 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>';
    // ⚠️ Limpa campos ao trocar de modo (evita bugs)
    clearAuthFields();
}

function clearAuthFields() {
    ['authEmail','authPassword','authDisplayName'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const pw = document.getElementById('authPassword'); if (pw) pw.type = 'password';
    const btn = document.getElementById('btnTogglePassword'); if (btn) btn.textContent = '👁️';
}

if (toggleAuth) toggleAuth.onclick = () => { isSignUpMode = !isSignUpMode; updateAuthMode(); };

document.getElementById('authForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); if (authProcessing) return;
    authProcessing = true;
    const sb = document.getElementById('btnAuthSubmit'); const ot = sb?.innerText;
    if (sb) { sb.innerText = '⏳ Aguarde...'; sb.disabled = true; }
    const email = document.getElementById('authEmail')?.value.trim().toLowerCase();
    const pass = document.getElementById('authPassword')?.value;
    const displayName = document.getElementById('authDisplayName')?.value.trim() || '';

    if (!email || !pass || pass.length < 6) { showMsg('Preencha! Senha mín 6', 'error'); authProcessing = false; if (sb) { sb.innerText = ot; sb.disabled = false; } return; }

    if (isSignUpMode && !displayName) { showMsg('Digite um nome de exibição!', 'error'); authProcessing = false; if (sb) { sb.innerText = ot; sb.disabled = false; } return; }

    try {
        if (isSignUpMode) {
            // ⚠️ Faz signOut antes para evitar conflitos
            if (auth.currentUser) await signOut(auth);
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(rtdb, "users/" + cred.user.uid), { name: displayName, bio: '', favGenre: 'Ação', photo: '', banner: '', themeColor: '#e50914', createdAt: Date.now() });
            showMsg('Conta criada! ✅', 'success');
        } else {
            // ⚠️ Faz signOut antes para trocar de conta corretamente
            if (auth.currentUser) await signOut(auth);
            await signInWithEmailAndPassword(auth, email, pass);
            showMsg('Bem-vindo! 🎬', 'success');
        }
        closeModal('authOverlay');
        clearAuthFields();
    } catch (err) { showMsg(translateAuthError(err.code), 'error'); }
    authProcessing = false;
    if (sb) { sb.innerText = ot; sb.disabled = false; }
});

// MODALS
document.getElementById('btnOpenProfile')?.addEventListener('click', openProfileModal);
document.getElementById('btnCloseProfile')?.addEventListener('click', () => closeModal('profileModal'));
document.getElementById('btnCloseCreator')?.addEventListener('click', () => { if (confirm('Fechar sem salvar?')) { closeModal('creatorModal'); resetCreator(); } });

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
clearLegacyCache();
renderGenreSelector();
renderMovieSources();
setAudioBoost(100);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        resetProfileUI();
        closeModal('authOverlay');
        clearAuthFields();
        document.getElementById('profileEmailDisplay').innerText = user.email;
        isAdmin = user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
        ['profileAdminBadge','sidebarAdminItem','sidebarCreatorItem','sidebarSuggestionsAdminItem','sidebarStorageItem'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !isAdmin));
        await loadUserProfile(user);
        await registerCurrentDevice(user);
        loadCatalog();
    } else {
        stopDeviceHeartbeat();
        currentUserUid = null; isAdmin = false;
        resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        openModal('authOverlay');
        clearAuthFields();
        ['sidebarAdminItem','sidebarCreatorItem','sidebarSuggestionsAdminItem','sidebarStorageItem','profileAdminBadge'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        isSignUpMode = false;
        updateAuthMode();
    }
});

// TV D-PAD + ESC
document.addEventListener('keydown', (e) => {
    if (isPlayerOpen()) return;
    if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009) {
        const modals = ['devicesModal','forgotPasswordModal','forgotSuccessModal','detailsModal','profileModal','adminModal','creatorModal','suggestionModal','suggestionsAdminModal','storageModal','cropperModal'];
        for (const id of modals) { const m = document.getElementById(id); if (m && !m.classList.contains('hidden')) { closeModal(id); e.preventDefault(); return; } }
        if (document.getElementById('sidebarMenu')?.classList.contains('active')) { closeSidebar(); e.preventDefault(); }
    }
});
