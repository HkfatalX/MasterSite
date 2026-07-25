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

// Player state
let currentVideoUrl = '';
let currentSources = [];
let currentSourceIndex = 0;
let currentPlayerMeta = { mainTitle: '', subTitle: '' };
let playerErrorTimer = null;

// Video sources builders
let movieSourcesBuilder = [];
let episodeSourcesBuilder = [];

// Audio Booster
let audioCtx = null;
let audioGainNode = null;
let boostedElements = new WeakSet();
let audioBoostLevel = 100;
let overlayCleanerInterval = null;

// ═════════════════════════════════════════════════════════════════
// ADAPTADORES POR PROVEDOR
// Cada adaptador define: nome amigável, cor, ícone, formatURL(url) → url embed,
// createElement(url) → cria e retorna o element (iframe/video), e config.
// ═════════════════════════════════════════════════════════════════
const PROVIDER_ADAPTERS = {

    // ─── MIXDROP ─────────────────────────────────────────────
    mixdrop: {
        name: 'MixDrop',
        color: '#00c6ff',
        icon: '🎬',
        errorLoadMs: 15000,
        formatUrl(url) {
            let f = url.trim();
            if (f.includes('/f/')) f = f.replace('/f/', '/e/');
            else if (!f.includes('/e/')) {
                const m = f.match(/(?:mixdrop\.[a-z]+)\/(?:e\/|f\/)?([a-zA-Z0-9]+)/);
                if (m && m[1]) f = `https://mixdrop.ag/e/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // MixDrop aceita sandbox
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-popups-to-escape-sandbox');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    },

    // ─── STREAMTAPE ──────────────────────────────────────────
    streamtape: {
        name: 'StreamTape',
        color: '#f5a623',
        icon: '📼',
        errorLoadMs: 15000,
        formatUrl(url) {
            let f = url.trim();
            if (f.includes('/v/')) f = f.replace('/v/', '/e/');
            else if (!f.includes('/e/')) {
                const m = f.match(/streamtape\.[a-z]+\/(?:v|e)\/([a-zA-Z0-9]+)/);
                if (m && m[1]) f = `https://streamtape.com/e/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // StreamTape precisa de allow-popups para escape de anúncios
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    },

    // ─── FILEMOON ────────────────────────────────────────────
    filemoon: {
        name: 'FileMoon',
        color: '#8e44ad',
        icon: '🌙',
        errorLoadMs: 20000,
        formatUrl(url) {
            let f = url.trim();
            if (!f.includes('/e/') && !f.includes('/embed')) {
                const m = f.match(/filemoon\.[a-z]+\/(?:d\/|e\/)?([a-zA-Z0-9]+)/);
                if (m && m[1]) f = `https://filemoon.sx/e/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // FileMoon NÃO aceita sandbox estrito
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    },

    // ─── VOE ─────────────────────────────────────────────────
    voe: {
        name: 'VOE',
        color: '#ff4757',
        icon: '⚡',
        errorLoadMs: 20000,
        formatUrl(url) {
            let f = url.trim();
            // VOE já usa geralmente URLs embed diretas
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // VOE também precisa liberado
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    },

    // ─── DOODSTREAM ──────────────────────────────────────────
    doodstream: {
        name: 'DoodStream',
        color: '#f39c12',
        icon: '🔥',
        errorLoadMs: 25000,
        formatUrl(url) {
            let f = url.trim();
            if (f.includes('/d/')) f = f.replace('/d/', '/e/');
            else if (!f.includes('/e/')) {
                const m = f.match(/(?:dood[a-z0-9]*\.[a-z]+)\/(?:d\/|e\/)?([a-zA-Z0-9]+)/);
                if (m && m[1]) {
                    const domainMatch = f.match(/(https?:\/\/[^\/]+)/);
                    const domain = domainMatch ? domainMatch[1] : 'https://dood.li';
                    f = `${domain}/e/${m[1]}`;
                }
            }
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // ⚠️ DoodStream bloqueia sandbox — SEM sandbox
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    },

    // ─── MP4UPLOAD ───────────────────────────────────────────
    mp4upload: {
        name: 'Mp4Upload',
        color: '#3498db',
        icon: '📤',
        errorLoadMs: 15000,
        formatUrl(url) {
            let f = url.trim();
            if (!f.includes('/embed')) {
                const m = f.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/);
                if (m && m[1]) f = `https://www.mp4upload.com/embed-${m[1]}.html`;
            }
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    },

    // ─── OK.RU ───────────────────────────────────────────────
    okru: {
        name: 'OK.ru',
        color: '#ee8208',
        icon: '📡',
        errorLoadMs: 15000,
        formatUrl(url) {
            let f = url.trim();
            const m = f.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/);
            if (m && m[1]) f = `https://ok.ru/videoembed/${m[1]}`;
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // OK.ru aceita sandbox
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');
            return iframe;
        }
    },

    // ─── GOOGLE DRIVE ────────────────────────────────────────
    drive: {
        name: 'Google Drive',
        color: '#4285f4',
        icon: '💾',
        errorLoadMs: 15000,
        formatUrl(url) {
            let f = url.trim();
            const m = f.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (m && m[1]) f = `https://drive.google.com/file/d/${m[1]}/preview`;
            else if (f.includes('open?id=')) {
                const m2 = f.match(/id=([a-zA-Z0-9_-]+)/);
                if (m2 && m2[1]) f = `https://drive.google.com/file/d/${m2[1]}/preview`;
            }
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // Google Drive aceita sandbox padrão
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            return iframe;
        }
    },

    // ─── YOURUPLOAD ──────────────────────────────────────────
    yourupload: {
        name: 'YourUpload',
        color: '#27ae60',
        icon: '⬆️',
        errorLoadMs: 15000,
        formatUrl(url) {
            let f = url.trim();
            if (!f.includes('/embed/')) {
                const m = f.match(/yourupload\.com\/(?:watch|embed)\/([a-zA-Z0-9]+)/);
                if (m && m[1]) f = `https://www.yourupload.com/embed/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    },

    // ─── YOUTUBE ─────────────────────────────────────────────
    youtube: {
        name: 'YouTube',
        color: '#ff0000',
        icon: '▶️',
        errorLoadMs: 10000,
        formatUrl(url) {
            let f = url.trim();
            let videoId = null;
            let m = f.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (m && m[1]) videoId = m[1];
            if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
            return iframe;
        }
    },

    // ─── VIMEO ───────────────────────────────────────────────
    vimeo: {
        name: 'Vimeo',
        color: '#17d5ff',
        icon: '🎥',
        errorLoadMs: 10000,
        formatUrl(url) {
            let f = url.trim();
            const m = f.match(/vimeo\.com\/(?:video\/)?(\d+)/);
            if (m && m[1]) f = `https://player.vimeo.com/video/${m[1]}?autoplay=1`;
            return f;
        },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            return iframe;
        }
    },

    // ─── DIRECT VIDEO (mp4, m3u8, webm) ─────────────────────
    direct: {
        name: 'Vídeo Direto',
        color: '#4caf50',
        icon: '📹',
        errorLoadMs: 20000,
        formatUrl(url) { return url.trim(); },
        createElement(url) {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            video.setAttribute('controlsList', 'nodownload');
            video.setAttribute('crossorigin', 'anonymous');
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.background = '#000';
            video.style.objectFit = 'contain';
            return video;
        }
    },

    // ─── OTHER (fallback) ───────────────────────────────────
    other: {
        name: 'Outro',
        color: '#888',
        icon: '🔗',
        errorLoadMs: 20000,
        formatUrl(url) { return url.trim(); },
        createElement(url) {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('webkitallowfullscreen', 'true');
            iframe.setAttribute('mozallowfullscreen', 'true');
            iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('frameborder', '0');
            // SEM sandbox — mais permissivo por padrão
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            return iframe;
        }
    }
};

// Retorna adaptador (com fallback para 'other')
function getAdapter(type) {
    return PROVIDER_ADAPTERS[type] || PROVIDER_ADAPTERS.other;
}

// Detecta o tipo/provedor de uma URL
function detectSourceType(url) {
    if (!url) return 'other';
    const u = url.toLowerCase();
    if (u.includes('mixdrop')) return 'mixdrop';
    if (u.includes('streamtape')) return 'streamtape';
    if (u.includes('filemoon')) return 'filemoon';
    if (u.includes('voe.sx') || u.includes('voe.') || u.includes('voesx')) return 'voe';
    if (u.includes('dood') || u.includes('doodstream') || u.includes('d0000d') || u.includes('d000d') || u.includes('dooood')) return 'doodstream';
    if (u.includes('mp4upload')) return 'mp4upload';
    if (u.includes('ok.ru')) return 'okru';
    if (u.includes('drive.google')) return 'drive';
    if (u.includes('yourupload')) return 'yourupload';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('vimeo.com')) return 'vimeo';
    if (/\.(mp4|m3u8|webm|ogg|mkv)(\?|$)/i.test(u)) return 'direct';
    return 'other';
}

function sourceTypeLabel(type) { return getAdapter(type).name; }

// Normaliza fontes antigas (videoUrl string) para o novo formato
function normalizeSources(item) {
    if (Array.isArray(item.videoSources) && item.videoSources.length > 0) return item.videoSources;
    if (item.videoUrl && item.videoUrl.trim()) {
        const t = detectSourceType(item.videoUrl);
        return [{ type: t, label: sourceTypeLabel(t), url: item.videoUrl.trim() }];
    }
    return [];
}

function normalizeEpisodeSources(ep) {
    if (Array.isArray(ep.videoSources) && ep.videoSources.length > 0) return ep.videoSources;
    if (ep.videoUrl && ep.videoUrl.trim()) {
        const t = detectSourceType(ep.videoUrl);
        return [{ type: t, label: sourceTypeLabel(t), url: ep.videoUrl.trim() }];
    }
    return [];
}

// ═════════════════════════════════════════════════════════════════
// TV MODE
// ═════════════════════════════════════════════════════════════════
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

// ═════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════
function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); document.body.classList.add('modal-open'); } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); document.body.classList.remove('modal-open'); } }
function normalizeText(t) { if (!t) return ''; return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
function getPosterUrl(i) { return i.coverUrl || i.backdropUrl || ''; }
function getBackdropUrl(i) { return i.backdropUrl || i.coverUrl || ''; }
function getItemGenres(i) { if (Array.isArray(i.genres) && i.genres.length > 0) return i.genres; if (i.category) return [i.category]; return []; }
function itemMatchesCategory(i, c) { if (c === "Todos") return true; if (c === "Filmes") return i.type === "movie"; if (c === "Séries") return i.type === "serie"; return getItemGenres(i).includes(c); }
function showMsg(text, type) { const m = document.getElementById('msg'); if (!m) return; m.innerText = text; m.className = type === 'success' ? 'msg-success' : 'msg-error'; m.classList.remove('hidden'); setTimeout(() => m.classList.add('hidden'), 4000); }
function isValidImageUrl(url) { if (!url) return false; if (url.includes(window.location.origin)) return false; return url.startsWith('http') || url.startsWith('data:image'); }
function formatBytes(b) { if (b === 0) return '0 B'; const k = 1024; const s = ['B','KB','MB','GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i]; }
function estimateJsonBytes(obj) { try { return new Blob([JSON.stringify(obj)]).size; } catch { return JSON.stringify(obj).length * 2; } }
function translateAuthError(c) {
    const e = {
        'auth/email-already-in-use': 'E-mail já cadastrado!','auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'Senha fraca (mín 6).','auth/user-not-found': 'Conta não encontrada.',
        'auth/wrong-password': 'Senha incorreta.','auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/too-many-requests': 'Muitas tentativas.','auth/network-request-failed': 'Sem internet.'
    };
    return e[c] || `Erro: ${c}`;
}
function timeAgo(ts) { const d = Date.now() - ts; const min = Math.floor(d / 60000); if (min < 1) return 'agora'; if (min < 60) return `${min}m`; const h = Math.floor(min / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; }

// ═════════════════════════════════════════════════════════════════
// CACHE
// ═════════════════════════════════════════════════════════════════
function getUserCacheKey(key) { if (!currentUserUid) return null; return `mfx_${currentUserUid}_${key}`; }
function setUserCache(key, value) { const k = getUserCacheKey(key); if (k && value) localStorage.setItem(k, value); }
function getUserCache(key) { const k = getUserCacheKey(key); if (!k) return null; return localStorage.getItem(k); }
function clearLegacyCache() { ['masterflix_user_name','masterflix_user_bio','masterflix_user_fav_genre','masterflix_user_avatar','masterflix_user_banner'].forEach(k => localStorage.removeItem(k)); }
function applyUserTheme(c) { if (!c || isTVDevice()) return; document.documentElement.style.setProperty('--primary-color', c); localStorage.setItem('masterflix_theme_color', c); if (currentUserUid) setUserCache('theme_color', c); }
if (!isTVDevice()) { const sc = localStorage.getItem('masterflix_theme_color'); if (sc) document.documentElement.style.setProperty('--primary-color', sc); }
window.onscroll = () => { const h = document.getElementById('mainHeader'); if (h) { if (window.scrollY > 50) h.classList.add('scrolled'); else h.classList.remove('scrolled'); } };

// ═════════════════════════════════════════════════════════════════
// SIDEBAR
// ═════════════════════════════════════════════════════════════════
function openSidebar() { document.getElementById('sidebarMenu')?.classList.add('active'); document.getElementById('sidebarOverlay')?.classList.add('active'); document.getElementById('menuToggleBtn')?.classList.add('active'); document.body.classList.add('modal-open'); }
function closeSidebar() { document.getElementById('sidebarMenu')?.classList.remove('active'); document.getElementById('sidebarOverlay')?.classList.remove('active'); document.getElementById('menuToggleBtn')?.classList.remove('active'); document.body.classList.remove('modal-open'); }

const menuBtn = document.getElementById('menuToggleBtn');
if (menuBtn) menuBtn.onclick = () => { if (document.getElementById('sidebarMenu')?.classList.contains('active')) closeSidebar(); else openSidebar(); };
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

// ═════════════════════════════════════════════════════════════════
// GENRE SELECTOR
// ═════════════════════════════════════════════════════════════════
function renderGenreSelector() {
    const c = document.getElementById('genreSelectorContainer'); if (!c) return;
    c.innerHTML = '';
    AVAILABLE_GENRES.forEach(g => {
        const t = document.createElement('div'); t.className = 'genre-tag';
        if (selectedGenres.includes(g)) t.classList.add('selected');
        t.textContent = g;
        t.onclick = () => { const i = selectedGenres.indexOf(g); if (i >= 0) selectedGenres.splice(i, 1); else selectedGenres.push(g); renderGenreSelector(); };
        c.appendChild(t);
    });
    const ct = document.getElementById('genreCounter');
    if (ct) { if (selectedGenres.length === 0) { ct.textContent = '⚠️ Selecione ao menos 1'; ct.style.color = '#ff9800'; } else { ct.textContent = `✓ ${selectedGenres.length}: ${selectedGenres.join(', ')}`; ct.style.color = 'var(--primary-color)'; } }
}

// ═════════════════════════════════════════════════════════════════
// MOVIE SOURCES BUILDER
// ═════════════════════════════════════════════════════════════════
function renderMovieSources() {
    const container = document.getElementById('movieSourcesList'); if (!container) return;
    container.innerHTML = '';
    if (movieSourcesBuilder.length === 0) { container.innerHTML = '<div class="source-empty-state">Nenhuma fonte adicionada. Clique em <strong>+ Adicionar Fonte</strong>.</div>'; return; }
    const tmpl = document.getElementById('videoSourceItemTemplate');
    movieSourcesBuilder.forEach((src, idx) => {
        const clone = tmpl.content.cloneNode(true);
        const card = clone.querySelector('.source-item-card');
        const badge = card.querySelector('.source-item-badge');
        const removeBtn = card.querySelector('[data-action="remove-source"]');
        const typeSelect = card.querySelector('.source-type-select');
        const titleInput = card.querySelector('.source-title-input');
        const urlInput = card.querySelector('.source-url-input');

        badge.textContent = `Fonte ${idx + 1}`;
        typeSelect.value = src.type || '';
        titleInput.value = src.label || '';
        urlInput.value = src.url || '';

        const usedTypes = movieSourcesBuilder.filter((_, i) => i !== idx).map(s => s.type).filter(t => t && t !== 'other');
        Array.from(typeSelect.options).forEach(opt => {
            if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) {
                opt.disabled = true;
                if (!opt.text.includes('(já adicionado)')) opt.text = opt.text + ' (já adicionado)';
            }
        });

        if (src.type) {
            let preview = card.querySelector('.source-preview-tag');
            if (!preview) { preview = document.createElement('div'); preview.className = 'source-preview-tag'; card.appendChild(preview); }
            const ad = getAdapter(src.type);
            preview.textContent = `${ad.icon} ${ad.name}`;
        }

        typeSelect.onchange = () => {
            const newType = typeSelect.value;
            if (newType && newType !== 'other') {
                const isDup = movieSourcesBuilder.some((s, i) => i !== idx && s.type === newType);
                if (isDup) { showMsg(`Já existe uma fonte "${sourceTypeLabel(newType)}"!`, 'error'); typeSelect.value = src.type || ''; return; }
            }
            movieSourcesBuilder[idx].type = newType;
            if (!movieSourcesBuilder[idx].label && newType) { movieSourcesBuilder[idx].label = sourceTypeLabel(newType); titleInput.value = movieSourcesBuilder[idx].label; }
            renderMovieSources();
        };
        titleInput.oninput = () => { movieSourcesBuilder[idx].label = titleInput.value; };
        urlInput.oninput = () => {
            movieSourcesBuilder[idx].url = urlInput.value;
            if (!movieSourcesBuilder[idx].type && urlInput.value) {
                const detected = detectSourceType(urlInput.value);
                if (detected && detected !== 'other') {
                    const isDup = movieSourcesBuilder.some((s, i) => i !== idx && s.type === detected);
                    if (!isDup) { movieSourcesBuilder[idx].type = detected; if (!movieSourcesBuilder[idx].label) movieSourcesBuilder[idx].label = sourceTypeLabel(detected); renderMovieSources(); }
                }
            }
        };
        removeBtn.onclick = () => { movieSourcesBuilder.splice(idx, 1); renderMovieSources(); };
        container.appendChild(card);
    });
}

function addMovieSource() { movieSourcesBuilder.push({ type: '', label: '', url: '' }); renderMovieSources(); }
document.getElementById('btnAddMovieSource')?.addEventListener('click', addMovieSource);

// ═════════════════════════════════════════════════════════════════
// EPISODE SOURCES BUILDER
// ═════════════════════════════════════════════════════════════════
function ensureEpSourcesMatrix(si, ei) {
    if (!episodeSourcesBuilder[si]) episodeSourcesBuilder[si] = [];
    if (!episodeSourcesBuilder[si][ei]) episodeSourcesBuilder[si][ei] = [];
}

function renderEpisodeSources(si, ei, containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const sources = (episodeSourcesBuilder[si] && episodeSourcesBuilder[si][ei]) || [];
    const tmpl = document.getElementById('videoSourceItemTemplate');
    if (sources.length === 0) { containerEl.innerHTML = '<div class="source-empty-state" style="font-size:11px">Nenhuma fonte. Clique em + Fonte.</div>'; return; }

    sources.forEach((src, sidx) => {
        const clone = tmpl.content.cloneNode(true);
        const card = clone.querySelector('.source-item-card');
        const badge = card.querySelector('.source-item-badge');
        const removeBtn = card.querySelector('[data-action="remove-source"]');
        const typeSelect = card.querySelector('.source-type-select');
        const titleInput = card.querySelector('.source-title-input');
        const urlInput = card.querySelector('.source-url-input');

        badge.textContent = `Fonte ${sidx + 1}`;
        typeSelect.value = src.type || '';
        titleInput.value = src.label || '';
        urlInput.value = src.url || '';

        const usedTypes = sources.filter((_, i) => i !== sidx).map(s => s.type).filter(t => t && t !== 'other');
        Array.from(typeSelect.options).forEach(opt => {
            if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) {
                opt.disabled = true;
                if (!opt.text.includes('(já adicionado)')) opt.text = opt.text + ' (já adicionado)';
            }
        });

        typeSelect.onchange = () => {
            const newType = typeSelect.value;
            if (newType && newType !== 'other') {
                const isDup = sources.some((s, i) => i !== sidx && s.type === newType);
                if (isDup) { showMsg(`Tipo "${sourceTypeLabel(newType)}" duplicado neste episódio!`, 'error'); typeSelect.value = src.type || ''; return; }
            }
            episodeSourcesBuilder[si][ei][sidx].type = newType;
            if (!episodeSourcesBuilder[si][ei][sidx].label && newType) { episodeSourcesBuilder[si][ei][sidx].label = sourceTypeLabel(newType); titleInput.value = episodeSourcesBuilder[si][ei][sidx].label; }
            renderEpisodeSources(si, ei, containerEl);
        };
        titleInput.oninput = () => { episodeSourcesBuilder[si][ei][sidx].label = titleInput.value; };
        urlInput.oninput = () => {
            episodeSourcesBuilder[si][ei][sidx].url = urlInput.value;
            if (!episodeSourcesBuilder[si][ei][sidx].type && urlInput.value) {
                const detected = detectSourceType(urlInput.value);
                if (detected && detected !== 'other') {
                    const isDup = sources.some((s, i) => i !== sidx && s.type === detected);
                    if (!isDup) { episodeSourcesBuilder[si][ei][sidx].type = detected; if (!episodeSourcesBuilder[si][ei][sidx].label) episodeSourcesBuilder[si][ei][sidx].label = sourceTypeLabel(detected); renderEpisodeSources(si, ei, containerEl); }
                }
            }
        };
        removeBtn.onclick = () => { episodeSourcesBuilder[si][ei].splice(sidx, 1); renderEpisodeSources(si, ei, containerEl); };
        containerEl.appendChild(card);
    });
}

// ═════════════════════════════════════════════════════════════════
// CROPPER
// ═════════════════════════════════════════════════════════════════
window.triggerCropModal = function (inputId, previewId, ar) {
    const fi = document.getElementById(inputId);
    currentTargetPreview = document.getElementById(previewId);
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
                        if (cv) { const u = cv.toDataURL('image/jpeg', 0.9); ['prevMobile','prevPC','prevTV'].forEach(id => { const el = document.getElementById(id); if (el) el.src = u; }); }
                    }
                });
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
    if (cv && currentTargetPreview) { currentTargetPreview.src = cv.toDataURL('image/jpeg', 0.92); currentTargetPreview.classList.remove('hidden'); }
    closeModal('cropperModal');
    if (previousModal) openModal(previousModal);
    if (cropperInstance) cropperInstance.destroy();
});
document.getElementById('btnCloseCropper')?.addEventListener('click', () => {
    closeModal('cropperModal');
    if (previousModal) openModal(previousModal);
    if (cropperInstance) cropperInstance.destroy();
});

// ═════════════════════════════════════════════════════════════════
// SEARCH
// ═════════════════════════════════════════════════════════════════
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchResultsDropdown');

document.getElementById('searchIconBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchBox?.classList.contains('active')) { if (searchInput?.value.trim() === '') searchBox.classList.remove('active'); }
    else { searchBox?.classList.add('active'); setTimeout(() => searchInput?.focus(), 250); }
});
searchInput?.addEventListener('input', () => {
    const v = searchInput.value.trim();
    if (v.length > 0) { searchBox?.classList.add('has-text'); renderSearchDropdown(v); }
    else { searchBox?.classList.remove('has-text'); searchDropdown?.classList.remove('visible'); }
});
document.getElementById('searchClearBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchInput) searchInput.value = '';
    searchBox?.classList.remove('has-text');
    searchDropdown?.classList.remove('visible');
    searchInput?.focus();
});

function smartSearch(q) {
    const nq = normalizeText(q); if (!nq) return [];
    const sc = [];
    mediaCatalog.forEach(i => {
        const t = normalizeText(i.title); if (!t) return;
        let s = 0;
        if (t === nq) s = 10000;
        else if (t.startsWith(nq)) s = 1000 - t.length;
        else if (t.includes(nq)) s = 100 - t.length;
        else { const words = nq.split(' ').filter(w => w.length > 0); const mc = words.filter(w => t.includes(w)).length; if (mc > 0) s = mc * 20; }
        if (s > 0) sc.push({ item: i, score: s });
    });
    sc.sort((a, b) => b.score - a.score);
    return sc.slice(0, 10).map(s => s.item);
}
function highlightMatch(t, q) { const nt = normalizeText(t), nq = normalizeText(q), i = nt.indexOf(nq); if (i === -1) return t; return t.substring(0, i) + '<mark>' + t.substring(i, i + q.length) + '</mark>' + t.substring(i + q.length); }

function renderSearchDropdown(query) {
    if (!searchDropdown) return;
    const results = smartSearch(query);
    searchDropdown.innerHTML = '';
    if (results.length === 0) { searchDropdown.innerHTML = `<div class="search-no-results"><span class="search-empty-icon">🔍</span><div>Nenhum resultado para "<strong>${query}</strong>"</div></div>`; }
    else {
        searchDropdown.innerHTML = `<div class="search-results-header">🔍 ${results.length} resultado(s)</div>`;
        results.forEach(item => {
            const d = document.createElement('div'); d.className = 'search-result-item'; d.tabIndex = 0;
            const p = getPosterUrl(item) || ''; const tl = item.type === 'movie' ? 'Filme' : 'Série'; const gs = getItemGenres(item);
            d.innerHTML = `<img class="search-result-thumb" src="${p}" loading="lazy" onerror="this.style.display='none'"><div class="search-result-info"><div class="search-result-title">${highlightMatch(item.title, query)}</div><div class="search-result-meta"><span class="type-badge">${tl}</span>${item.year ? '<span>' + item.year + '</span>' : ''}${gs.length > 0 ? '<span>' + gs.slice(0, 2).join(', ') + '</span>' : ''}</div></div>`;
            d.onclick = () => { searchDropdown.classList.remove('visible'); if (searchInput) searchInput.value = ''; searchBox?.classList.remove('has-text'); window.location.hash = `#/midia/${item.id}`; openDetails(item); };
            d.onkeydown = (e) => { if (e.key === 'Enter') d.click(); };
            searchDropdown.appendChild(d);
        });
    }
    searchDropdown.classList.add('visible');
}

searchInput?.addEventListener('keydown', (e) => { const items = searchDropdown?.querySelectorAll('.search-result-item'); if (!items?.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); items[0]?.focus(); } });
searchDropdown?.addEventListener('keydown', (e) => {
    const items = [...searchDropdown.querySelectorAll('.search-result-item')]; const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && idx < items.length - 1) { e.preventDefault(); items[idx + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx > 0) items[idx - 1]?.focus(); else searchInput?.focus(); }
    else if (e.key === 'Escape') { searchDropdown.classList.remove('visible'); searchInput?.focus(); }
});
document.addEventListener('click', (e) => { const wrapper = document.getElementById('searchWrapper'); if (wrapper && !wrapper.contains(e.target)) { searchDropdown?.classList.remove('visible'); if (searchInput?.value.trim() === '') searchBox?.classList.remove('active'); } });

// ═════════════════════════════════════════════════════════════════
// HASH ROUTING
// ═════════════════════════════════════════════════════════════════
function handleHashRouting() { const h = window.location.hash; if (h.startsWith('#/midia/')) { const id = h.replace('#/midia/', ''); const i = mediaCatalog.find(m => m.id === id); if (i) openDetails(i); } }
window.addEventListener('hashchange', handleHashRouting);

// ═════════════════════════════════════════════════════════════════
// MEDIA TYPE TOGGLE
// ═════════════════════════════════════════════════════════════════
document.getElementById('mediaType')?.addEventListener('change', (e) => {
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
});

// ═════════════════════════════════════════════════════════════════
// SEASONS BUILDER
// ═════════════════════════════════════════════════════════════════
function renderSeasonsBuilder() {
    const c = document.getElementById('seasonsList'); if (!c) return;
    c.innerHTML = '';
    seasonsBuilder.forEach((s, si) => {
        const d = document.createElement('div');
        d.style.cssText = "background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin-top:14px;";
        d.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                <strong style="color:var(--primary-color);">T${si + 1}</strong>
                <button type="button" class="btn-secondary" id="addEpBtn_${si}" style="font-size:11px">+ EP</button>
            </div>
            <div class="input-group">
                <label>Foto Temporada</label>
                <div class="file-upload-box" id="seasonCoverBox_${si}">
                    <span class="file-upload-label">📁</span>
                    <input type="file" id="seasonCoverFile_${si}" accept="image/*" class="hidden">
                    <img id="seasonCoverPrev_${si}" src="${s.seasonCoverUrl || ''}" class="file-preview-img ${s.seasonCoverUrl ? '' : 'hidden'}">
                </div>
            </div>
            <div id="episodesListBuilder_${si}"></div>`;
        c.appendChild(d);
        d.querySelector(`#addEpBtn_${si}`).onclick = () => addEpisode(si);
        d.querySelector(`#seasonCoverBox_${si}`).onclick = () => triggerCropModal(`seasonCoverFile_${si}`, `seasonCoverPrev_${si}`, 16 / 9);

        const el = d.querySelector(`#episodesListBuilder_${si}`);
        (s.episodes || []).forEach((ep, ei) => {
            ensureEpSourcesMatrix(si, ei);
            const ed = document.createElement('div');
            ed.style.cssText = "background:#111;padding:12px;margin-top:10px;border-radius:8px;";
            ed.innerHTML = `
                <strong style="font-size:10px;color:#888;">EP ${ei + 1}</strong>
                <div class="input-group"><label>Título</label><input type="text" id="epTitle_${si}_${ei}" value="${ep.title || ''}"></div>
                <div class="input-group"><label>Duração</label><input type="text" id="epDuration_${si}_${ei}" value="${ep.duration || ''}"></div>
                <div class="input-group"><label>Thumb</label><div class="file-upload-box" id="epThumbBox_${si}_${ei}"><span class="file-upload-label">📸</span><input type="file" id="epThumbFile_${si}_${ei}" accept="image/*" class="hidden"><img id="epThumbPrev_${si}_${ei}" src="${ep.thumbUrl || ''}" class="file-preview-img ${ep.thumbUrl ? '' : 'hidden'}"></div></div>
                <div class="input-group">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <label style="margin-bottom:0">🎞️ Fontes do Episódio</label>
                        <button type="button" class="btn-secondary" id="addEpSrcBtn_${si}_${ei}" style="font-size:10px">+ Fonte</button>
                    </div>
                    <div id="epSourcesContainer_${si}_${ei}"></div>
                </div>`;
            el.appendChild(ed);
            ed.querySelector(`#epThumbBox_${si}_${ei}`).onclick = () => triggerCropModal(`epThumbFile_${si}_${ei}`, `epThumbPrev_${si}_${ei}`, 16 / 9);
            ed.querySelector(`#addEpSrcBtn_${si}_${ei}`).onclick = () => {
                ensureEpSourcesMatrix(si, ei);
                episodeSourcesBuilder[si][ei].push({ type: '', label: '', url: '' });
                renderEpisodeSources(si, ei, ed.querySelector(`#epSourcesContainer_${si}_${ei}`));
            };
            renderEpisodeSources(si, ei, ed.querySelector(`#epSourcesContainer_${si}_${ei}`));
        });
    });
}

function addSeason() {
    const si = seasonsBuilder.length;
    seasonsBuilder.push({ seasonNumber: si + 1, seasonCoverUrl: '', episodes: [{ title: 'Episódio 1', duration: '45m', thumbUrl: '' }] });
    if (!episodeSourcesBuilder[si]) episodeSourcesBuilder[si] = [];
    if (!episodeSourcesBuilder[si][0]) episodeSourcesBuilder[si][0] = [];
    renderSeasonsBuilder();
}
window.addEpisode = (si) => {
    const ei = seasonsBuilder[si].episodes.length;
    seasonsBuilder[si].episodes.push({ title: `Episódio ${ei + 1}`, duration: '45m', thumbUrl: '' });
    ensureEpSourcesMatrix(si, ei);
    renderSeasonsBuilder();
};
document.getElementById('btnAddSeasonBtn')?.addEventListener('click', addSeason);

// ═════════════════════════════════════════════════════════════════
// CATALOG
// ═════════════════════════════════════════════════════════════════
async function loadCatalog() {
    try {
        const snap = await get(ref(rtdb, "catalog"));
        mediaCatalog = [];
        if (snap.exists()) { const d = snap.val(); for (let k in d) { const i = { id: k, ...d[k] }; if (!Array.isArray(i.genres)) i.genres = i.category ? [i.category] : []; mediaCatalog.push(i); } }
        renderApp(); renderAdminCatalogList(); handleHashRouting();
    } catch (e) { console.error(e); showMsg('Erro: ' + e.message, 'error'); }
}

// ═════════════════════════════════════════════════════════════════
// CONTINUE WATCHING
// ═════════════════════════════════════════════════════════════════
function getContinueList() { if (!currentUserUid) return []; try { return JSON.parse(localStorage.getItem(`mfx_${currentUserUid}_continue`) || '[]'); } catch { return []; } }
function saveContinueList(list) { if (!currentUserUid) return; localStorage.setItem(`mfx_${currentUserUid}_continue`, JSON.stringify(list)); }
function cleanExpiredContinue() { let list = getContinueList(); const now = Date.now(); const b = list.length; list = list.filter(i => (now - (i.lastWatched || 0)) < CONTINUE_EXPIRE_MS); if (list.length !== b) saveContinueList(list); return list; }
function saveContinueWatching(mi, extra = '', episodeInfo = null) {
    if (!currentUserUid) return;
    let cl = getContinueList();
    cl = cl.filter(i => i.id !== mi.id);
    cl.unshift({ id: mi.id, title: mi.title, type: mi.type, coverUrl: getBackdropUrl(mi) || getPosterUrl(mi), duration: mi.duration || extra || '', lastWatched: Date.now(), episodeInfo });
    if (cl.length > 30) cl.pop();
    saveContinueList(cl);
    renderContinueWatching();
}
function removeContinueItem(id) { let cl = getContinueList(); cl = cl.filter(i => i.id !== id); saveContinueList(cl); renderContinueWatching(); }
function getContinueInfo(id) { return getContinueList().find(i => i.id === id) || null; }

function renderContinueWatching() {
    const cr = document.getElementById('continueRow'), cc = document.getElementById('continueCarousel'); if (!cr || !cc) return;
    cc.innerHTML = '';
    if (!currentUserUid) { cr.classList.add('hidden'); return; }
    let list = cleanExpiredContinue();
    if (selectedCategory === "Filmes") list = list.filter(i => i.type === 'movie');
    else if (selectedCategory === "Séries") list = list.filter(i => i.type === 'serie');
    else if (selectedCategory !== "Todos") { list = list.filter(i => { const o = mediaCatalog.find(m => m.id === i.id); if (!o) return false; return getItemGenres(o).includes(selectedCategory); }); }
    if (list.length === 0) { cr.classList.add('hidden'); return; }
    cr.classList.remove('hidden');
    list.forEach(item => {
        const card = document.createElement('div'); card.className = 'continue-card'; card.tabIndex = 0;
        const epText = item.episodeInfo ? `<div class="continue-ep-badge">▶ ${item.episodeInfo}</div>` : '';
        card.innerHTML = `<img src="${item.coverUrl || 'https://via.placeholder.com/300x180?text=?'}" loading="lazy"><button class="continue-remove-btn" aria-label="Remover">✕</button><div class="continue-play-icon">▶</div><div class="continue-info"><div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</div>${epText}<div class="continue-duration">${item.lastWatched ? '🕐 ' + timeAgo(item.lastWatched) : ''}</div></div>`;
        card.querySelector('.continue-remove-btn').onclick = (e) => { e.stopPropagation(); removeContinueItem(item.id); showMsg('Removido!', 'success'); };
        card.onclick = () => { const o = mediaCatalog.find(m => m.id === item.id); if (o) openDetails(o); };
        card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
        cc.appendChild(card);
    });
}

// ═════════════════════════════════════════════════════════════════
// RENDER APP
// ═════════════════════════════════════════════════════════════════
function renderApp() {
    const mc = document.getElementById('moviesCarousel'), sc = document.getElementById('seriesCarousel');
    const mr = document.getElementById('moviesRow'), sr = document.getElementById('seriesRow');
    if (!mc || !sc || !mr || !sr) return;
    mc.innerHTML = ''; sc.innerHTML = '';
    if (selectedCategory === "Filmes") { mr.classList.remove('hidden'); sr.classList.add('hidden'); }
    else if (selectedCategory === "Séries") { mr.classList.add('hidden'); sr.classList.remove('hidden'); }
    else { mr.classList.remove('hidden'); sr.classList.remove('hidden'); }

    mediaCatalog.forEach(item => {
        if (!itemMatchesCategory(item, selectedCategory)) return;
        const card = document.createElement('div'); card.className = 'media-card'; card.tabIndex = 0;
        const ps = getPosterUrl(item); const gs = getItemGenres(item);
        const tg = gs.length > 0 ? gs[0] : (item.type === 'movie' ? 'Filme' : 'Série');
        if (ps) card.innerHTML = `<img class="media-card-poster" src="${ps}" loading="lazy" onerror="this.style.display='none'"><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`;
        else card.innerHTML = `<div class="media-card-poster-fallback">🎬</div><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`;
        card.onclick = () => { window.location.hash = `#/midia/${item.id}`; openDetails(item); };
        card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
        if (item.type === 'movie') mc.appendChild(card); else sc.appendChild(card);
    });
    renderContinueWatching();
    if (mediaCatalog.length > 0 && !activeItem) setHero(mediaCatalog[0]);
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
    document.getElementById('heroPlayBtn').onclick = () => {
        if (item.type === 'movie') { const sources = normalizeSources(item); saveContinueWatching(item, item.duration || ''); initiatePlay(sources, item.title, 'Filme'); }
        else openDetails(item);
    };
    document.getElementById('heroInfoBtn').onclick = () => openDetails(item);
}

// ═════════════════════════════════════════════════════════════════
// DETAILS
// ═════════════════════════════════════════════════════════════════
function openDetails(item) {
    activeItem = item;
    const bd = getBackdropUrl(item), ba = document.getElementById('detailBackdropArea');
    if (ba) { if (bd) ba.style.backgroundImage = `url('${bd}')`; else ba.style.background = '#1a1a1a'; }
    const ps = getPosterUrl(item), dp = document.getElementById('detailPoster');
    if (dp) { if (ps) { dp.src = ps; dp.style.display = 'block'; } else dp.style.display = 'none'; }
    document.getElementById('detailTitle').innerText = item.title;
    document.getElementById('detailMeta').innerText = `${item.type === 'movie' ? 'FILME' : 'SÉRIE'} • ${item.year || ''}${item.duration ? ' • ⏱️ ' + item.duration : ''}`;
    const gd = document.getElementById('detailGenres');
    if (gd) { gd.innerHTML = ''; getItemGenres(item).forEach(g => { const b = document.createElement('span'); b.style.cssText = 'padding:5px 14px;background:rgba(229,9,20,0.12);border:1px solid rgba(229,9,20,0.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary-color);text-transform:uppercase'; b.textContent = g; gd.appendChild(b); }); }
    document.getElementById('detailDesc').innerText = item.description || '';
    const ci = getContinueInfo(item.id);
    const ca = document.getElementById('detailsContentArea');

    if (item.type === 'movie') {
        document.getElementById('detailMovieArea')?.classList.remove('hidden');
        document.getElementById('detailSerieArea')?.classList.add('hidden');
        const bp = document.getElementById('btnPlayMovieFile');
        if (bp) {
            bp.innerText = ci ? '▶ Continuar Assistindo' : '▶ Assistir Filme';
            bp.onclick = () => { const sources = normalizeSources(item); saveContinueWatching(item, item.duration || ''); closeModal('detailsModal'); initiatePlay(sources, item.title, 'Filme'); };
        }
        openModal('detailsModal'); if (ca) ca.scrollTop = 0;
        setTimeout(() => bp?.focus(), 150);
    } else {
        document.getElementById('detailMovieArea')?.classList.add('hidden');
        document.getElementById('detailSerieArea')?.classList.remove('hidden');
        const tabs = document.getElementById('seasonTabs'); if (tabs) tabs.innerHTML = '';
        let rsi = 0, rei = -1;
        if (ci && ci.episodeInfo) { const match = ci.episodeInfo.match(/T(\d+)\s*E(\d+)/i); if (match) { rsi = parseInt(match[1]) - 1; rei = parseInt(match[2]) - 1; } }
        (item.seasons || []).forEach((s, idx) => {
            const tab = document.createElement('div'); tab.className = `season-tab ${idx === rsi ? 'active' : ''}`; tab.innerText = `T${idx + 1}`; tab.tabIndex = 0;
            tab.onclick = () => {
                document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
                if (s.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${s.seasonCoverUrl}')`;
                else if (ba) ba.style.backgroundImage = bd ? `url('${bd}')` : '';
                renderEpisodesList(s.episodes || [], idx, s, item, idx === rsi ? rei : -1);
            };
            tab.onkeydown = (e) => {
                if (e.key === 'Enter') tab.click();
                else if (e.key === 'ArrowRight') { e.preventDefault(); const n = tab.nextElementSibling; if (n) { n.focus(); n.click(); } }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); const p = tab.previousElementSibling; if (p) { p.focus(); p.click(); } }
                else if (e.key === 'ArrowDown') { e.preventDefault(); const fe = document.querySelector('#episodesListContainer .episode-card'); if (fe) fe.focus(); }
            };
            tabs?.appendChild(tab);
        });
        if (item.seasons?.length > 0) { const ti = item.seasons[rsi] ? rsi : 0; const ts = item.seasons[ti]; if (ts.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${ts.seasonCoverUrl}')`; renderEpisodesList(ts.episodes || [], ti, ts, item, ti === rsi ? rei : -1); }
        openModal('detailsModal'); if (ca) ca.scrollTop = 0;
        setTimeout(() => { const at = document.querySelector('.season-tab.active'); if (at) { at.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); at.focus(); } }, 200);
    }
}

function renderEpisodesList(eps, si, sd, ser, rei) {
    const c = document.getElementById('episodesListContainer'); if (!c) return;
    c.innerHTML = '';
    const fi = (sd?.seasonCoverUrl?.trim()) ? sd.seasonCoverUrl : (getBackdropUrl(ser) || getPosterUrl(ser) || '');
    eps.forEach((ep, idx) => {
        const d = document.createElement('div'); d.className = 'episode-card'; d.tabIndex = 0;
        const th = (ep.thumbUrl?.trim()) ? ep.thumbUrl : fi;
        const dur = ep.duration ? `<span style="color:#888;font-size:10px;margin-left:6px">⏱️ ${ep.duration}</span>` : '';
        const lbl = `T${si + 1} E${idx + 1}`;
        const isR = (idx === rei);
        const rb = isR ? `<div class="ep-resume-badge">⏳ Onde parou</div>` : '';
        d.onclick = () => {
            const sources = normalizeEpisodeSources(ep);
            closeModal('detailsModal');
            saveContinueWatching(activeItem, ep.duration || '', `${lbl} - ${ep.title || ''}`);
            initiatePlay(sources, activeItem.title, `${lbl} - ${ep.title}`);
        };
        d.onkeydown = (e) => {
            if (e.key === 'Enter') d.click();
            else if (e.key === 'ArrowDown') { e.preventDefault(); if (d.nextElementSibling) d.nextElementSibling.focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (d.previousElementSibling) d.previousElementSibling.focus(); else { const at = document.querySelector('.season-tab.active'); if (at) at.focus(); } }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const tabsArr = [...document.querySelectorAll('.season-tab')]; const at = document.querySelector('.season-tab.active'); if (at) { const ci2 = tabsArr.indexOf(at); let ni = e.key === 'ArrowRight' ? ci2 + 1 : ci2 - 1; if (ni >= 0 && ni < tabsArr.length) { tabsArr[ni].focus(); tabsArr[ni].click(); } } }
        };
        d.innerHTML = `<div class="episode-thumb"><img src="${th}" loading="lazy" onerror="this.src='${fi}'"><div class="ep-play-overlay"><span>▶</span></div></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">${lbl} - ${ep.title || 'Sem Título'}${dur}</div><span style="font-size:11px;color:var(--primary-color);font-weight:700">▶ ${isR ? 'Continuar' : 'Assistir'}</span>${rb}</div>`;
        if (isR) { d.style.border = '1.5px solid rgba(255,202,40,0.35)'; d.style.background = 'rgba(255,202,40,0.04)'; }
        c.appendChild(d);
    });
    if (rei >= 0) setTimeout(() => { const cards = c.querySelectorAll('.episode-card'); if (cards[rei]) cards[rei].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
}

document.getElementById('btnCloseDetails')?.addEventListener('click', () => { window.location.hash = ''; closeModal('detailsModal'); });

// ═════════════════════════════════════════════════════════════════
// INITIATE PLAY
// ═════════════════════════════════════════════════════════════════
function initiatePlay(sources, mainTitle, subTitle) {
    if (!sources || sources.length === 0) { showMsg('Nenhum link de vídeo disponível!', 'error'); return; }
    currentSources = sources.slice();
    currentPlayerMeta = { mainTitle, subTitle };

    openModal('playerModal');

    // Botão de trocar fonte só aparece se houver > 1
    const btnChange = document.getElementById('btnChangeSource');
    if (btnChange) btnChange.classList.toggle('hidden', currentSources.length <= 1);

    if (currentSources.length === 1) {
        currentSourceIndex = 0;
        playSourceByIndex(0);
    } else {
        showSourceSelector();
    }
}

// ═════════════════════════════════════════════════════════════════
// SOURCE SELECTOR
// ═════════════════════════════════════════════════════════════════
function showSourceSelector() {
    const selector = document.getElementById('playerSourceSelector');
    const list = document.getElementById('playerSourceList');
    const subEl = document.getElementById('playerSourceSelectorSub');
    if (!selector || !list) return;

    hidePlayerError();
    document.getElementById('playerLoading')?.classList.add('hidden');

    const titleDisp = document.getElementById('playerTitleDisplay');
    if (titleDisp) titleDisp.innerText = currentPlayerMeta.mainTitle || 'Escolha uma fonte';
    document.getElementById('playerSubDisplay').innerText = currentPlayerMeta.subTitle || 'MasterFlix';
    document.getElementById('playerProviderBadge')?.classList.add('hidden');

    if (subEl) subEl.textContent = `${currentSources.length} fontes disponíveis — escolha uma para iniciar.`;

    list.innerHTML = '';
    currentSources.forEach((src, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'player-source-btn'; btn.tabIndex = 0;
        if (idx === currentSourceIndex && currentVideoUrl) btn.classList.add('current');
        const adapter = getAdapter(src.type);
        const title = src.label || adapter.name || `Fonte ${idx + 1}`;
        const shortUrl = src.url ? (src.url.length > 55 ? src.url.substring(0, 55) + '…' : src.url) : '';
        const currentTag = (idx === currentSourceIndex && currentVideoUrl) ? '<span class="source-btn-current-tag">Atual</span>' : '';
        btn.innerHTML = `
            <div class="source-btn-top">
                <span class="source-btn-title">${adapter.icon} ${title}${currentTag}</span>
                <span class="source-btn-type" style="color:${adapter.color}">${adapter.name}</span>
            </div>
            <div class="source-btn-url">${shortUrl}</div>`;
        btn.onclick = () => { hideSourceSelector(); currentSourceIndex = idx; playSourceByIndex(idx); };
        btn.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); const n = btn.nextElementSibling; if (n) n.focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); const p = btn.previousElementSibling; if (p) p.focus(); }
        };
        list.appendChild(btn);
    });

    selector.classList.remove('hidden');
    showPlayerControls();
    setTimeout(() => list.querySelector('.player-source-btn')?.focus(), 100);
}

function hideSourceSelector() { document.getElementById('playerSourceSelector')?.classList.add('hidden'); }

document.getElementById('btnCancelSourceSelection')?.addEventListener('click', () => {
    // Se já tem vídeo tocando, só esconde. Se não, fecha tudo.
    if (currentVideoUrl) hideSourceSelector();
    else closePlayer();
});

document.getElementById('btnChangeSource')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showSourceSelector();
});

// ═════════════════════════════════════════════════════════════════
// PLAY SOURCE POR ÍNDICE (usa adaptador)
// ═════════════════════════════════════════════════════════════════
function playSourceByIndex(idx) {
    const src = currentSources[idx];
    if (!src || !src.url) { showMsg('Link inválido!', 'error'); return; }

    const adapter = getAdapter(src.type);
    const finalUrl = adapter.formatUrl(src.url);
    currentVideoUrl = finalUrl;
    currentSourceIndex = idx;

    // UI: título/subtítulo/badge do provedor
    const titleDisp = document.getElementById('playerTitleDisplay');
    if (titleDisp) titleDisp.innerText = currentPlayerMeta.mainTitle || 'Assistindo';
    const subDisp = document.getElementById('playerSubDisplay');
    if (subDisp) subDisp.innerText = currentPlayerMeta.subTitle || 'MasterFlix';
    const badge = document.getElementById('playerProviderBadge');
    if (badge) {
        badge.innerHTML = `${adapter.icon} ${src.label || adapter.name}`;
        badge.style.background = `${adapter.color}30`;
        badge.style.borderColor = `${adapter.color}80`;
        badge.classList.remove('hidden');
    }

    // Loading
    const loading = document.getElementById('playerLoading');
    const loadingText = document.getElementById('playerLoadingText');
    const loadingSub = document.getElementById('playerLoadingSub');
    if (loading) loading.classList.remove('hidden');
    if (loadingText) loadingText.textContent = `Carregando ${adapter.name}...`;
    if (loadingSub) loadingSub.textContent = `Adaptador otimizado para ${adapter.name}`;

    hidePlayerError();
    hideSourceSelector();

    // Remove player antigo (iframe OU video)
    const container = document.getElementById('playerContainerView');
    if (container) {
        container.querySelectorAll('iframe, video').forEach(el => el.remove());
        container.classList.remove('stretch-mode');
    }

    // Reset audio boost
    const booster = document.getElementById('audioBoostSlider');
    if (booster) booster.value = 100;
    setAudioBoost(100);

    // Cria o elemento pelo adaptador
    const el = adapter.createElement(finalUrl);

    // Listener onload
    el.addEventListener('load', () => {
        setTimeout(() => loading?.classList.add('hidden'), 400);
        clearTimeout(playerErrorTimer);
        setTimeout(() => scanAndBoostAudio(), 1500);
        setTimeout(() => scanAndBoostAudio(), 3000);
    });

    // Vídeo direto: usa canplay/error
    if (el.tagName === 'VIDEO') {
        el.addEventListener('canplay', () => { setTimeout(() => loading?.classList.add('hidden'), 200); clearTimeout(playerErrorTimer); });
        el.addEventListener('error', () => { showPlayerError('Vídeo direto não pôde ser carregado.', adapter.name); });
    }

    container?.appendChild(el);

    // Timer de erro por adaptador (se não carregar em X ms)
    clearTimeout(playerErrorTimer);
    playerErrorTimer = setTimeout(() => {
        // Só marca erro se o loading ainda estiver visível
        if (loading && !loading.classList.contains('hidden')) {
            // Não fecha, só oculta o loading — o vídeo pode ainda estar tentando
            loading.classList.add('hidden');
        }
    }, adapter.errorLoadMs);

    startOverlayCleaner();
    showPlayerControls();

    setTimeout(() => { const tip = document.getElementById('playerTip'); if (tip && isPlayerOpen()) { tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 5000); } }, 3000);

    // Scan periódico de audio
    const scanInt = setInterval(() => { if (!isPlayerOpen()) { clearInterval(scanInt); return; } scanAndBoostAudio(); }, 5000);
}

// ═════════════════════════════════════════════════════════════════
// PLAYER ERROR SCREEN
// ═════════════════════════════════════════════════════════════════
function showPlayerError(desc, providerName) {
    const screen = document.getElementById('playerErrorScreen');
    if (!screen) return;
    document.getElementById('playerErrorTitle').textContent = `Falha em ${providerName || 'reprodução'}`;
    document.getElementById('playerErrorDesc').textContent = desc || 'Tente outra fonte ou recarregue.';
    // Se houver mais de 1 fonte, mostra o botão de trocar
    const btnTry = document.getElementById('btnErrorTryAnother');
    if (btnTry) btnTry.style.display = currentSources.length > 1 ? '' : 'none';
    screen.classList.remove('hidden');
    document.getElementById('playerLoading')?.classList.add('hidden');
}
function hidePlayerError() { document.getElementById('playerErrorScreen')?.classList.add('hidden'); }

document.getElementById('btnErrorTryAnother')?.addEventListener('click', () => { hidePlayerError(); showSourceSelector(); });
document.getElementById('btnErrorReload')?.addEventListener('click', () => { hidePlayerError(); playSourceByIndex(currentSourceIndex); });

// ═════════════════════════════════════════════════════════════════
// AUDIO BOOSTER
// ═════════════════════════════════════════════════════════════════
function initAudioContext() {
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioGainNode = audioCtx.createGain(); audioGainNode.connect(audioCtx.destination); audioGainNode.gain.value = 1.0; }
    catch (e) { console.warn('AudioContext indisponível:', e); }
}
function boostMediaElement(el) {
    if (!audioCtx || !audioGainNode || boostedElements.has(el)) return;
    try { const src = audioCtx.createMediaElementSource(el); src.connect(audioGainNode); boostedElements.add(el); } catch (e) { }
}
function scanAndBoostAudio() {
    if (!audioCtx) return;
    document.querySelectorAll('video, audio').forEach(el => boostMediaElement(el));
    try { const iframe = document.querySelector('#playerContainerView iframe'); if (iframe && iframe.contentDocument) { iframe.contentDocument.querySelectorAll('video, audio').forEach(el => boostMediaElement(el)); } } catch (e) { }
}
function setAudioBoost(pct) {
    audioBoostLevel = pct;
    initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (audioGainNode) audioGainNode.gain.value = pct / 100;
    scanAndBoostAudio();
    const icon = document.getElementById('audioBoostIcon'); const val = document.getElementById('audioBoostValue');
    if (val) val.textContent = pct + '%';
    if (icon && val) {
        if (pct <= 100) { icon.textContent = '🔈'; val.style.color = '#aaa'; }
        else if (pct <= 200) { icon.textContent = '🔊'; val.style.color = 'var(--primary-color)'; }
        else if (pct <= 350) { icon.textContent = '🔊'; val.style.color = '#ff9800'; }
        else { icon.textContent = '🔊'; val.style.color = '#ff5252'; }
    }
}
document.getElementById('audioBoostSlider')?.addEventListener('input', (e) => setAudioBoost(parseInt(e.target.value)));
document.getElementById('audioBoostIcon')?.addEventListener('click', () => { const slider = document.getElementById('audioBoostSlider'); if (slider) { if (audioBoostLevel > 100) { slider.value = 100; setAudioBoost(100); } else { slider.value = 200; setAudioBoost(200); } } });

// ═════════════════════════════════════════════════════════════════
// OVERLAY CLEANER
// ═════════════════════════════════════════════════════════════════
function startOverlayCleaner() {
    if (overlayCleanerInterval) return;
    overlayCleanerInterval = setInterval(() => {
        if (!isPlayerOpen()) return;
        try {
            const iframe = document.querySelector('#playerContainerView iframe');
            if (!iframe || !iframe.contentDocument) return;
            const doc = iframe.contentDocument;
            doc.querySelectorAll('div, aside, section, span').forEach(el => {
                const style = doc.defaultView?.getComputedStyle(el); if (!style) return;
                const pos = style.position; const zIndex = parseInt(style.zIndex) || 0;
                const isOverlay = (pos === 'fixed' || pos === 'absolute') && zIndex > 100;
                const isFullCover = el.offsetWidth > (iframe.clientWidth * 0.6) && el.offsetHeight > (iframe.clientHeight * 0.4);
                if (isOverlay && isFullCover && !el.querySelector('video')) { el.style.display = 'none'; el.style.visibility = 'hidden'; el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
            });
        } catch (e) { }
    }, 2000);
}
function stopOverlayCleaner() { if (overlayCleanerInterval) { clearInterval(overlayCleanerInterval); overlayCleanerInterval = null; } }

// ═════════════════════════════════════════════════════════════════
// PLAYER CONTROLS
// ═════════════════════════════════════════════════════════════════
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

document.getElementById('btnToggleFullscreen')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isInFullscreen()) { if (playerBox?.requestFullscreen) playerBox.requestFullscreen(); else if (playerBox?.webkitRequestFullscreen) playerBox.webkitRequestFullscreen(); }
    else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); }
    showPlayerControls();
});
document.getElementById('btnToggleStretch')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playerContainer) { playerContainer.classList.toggle('stretch-mode'); showMsg(playerContainer.classList.contains('stretch-mode') ? '📐 Esticado' : '🖼️ Normal', 'success'); }
    showPlayerControls();
});
document.getElementById('btnReloadPlayer')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentVideoUrl) return;
    playSourceByIndex(currentSourceIndex);
    showMsg('Recarregando...', 'success');
});

const _originalOpen = window.open;
window.open = function (...args) {
    if (isPlayerOpen() && isInFullscreen()) { try { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) { } }
    return _originalOpen.apply(this, args);
};

function closePlayer() {
    clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer); clearTimeout(playerErrorTimer);
    if (isInFullscreen()) { try { document.exitFullscreen(); } catch (e) { } }
    playerContainer?.querySelectorAll('iframe, video').forEach(el => el.remove());
    playerContainer?.classList.remove('stretch-mode');
    playerLoading?.classList.remove('hidden');
    hideSourceSelector(); hidePlayerError();
    closeModal('playerModal');
    playerBox?.classList.remove('cursor-hidden');
    playerControls?.classList.remove('is-hidden');
    stopOverlayCleaner();
    currentVideoUrl = ''; currentSources = []; currentSourceIndex = 0;
    document.getElementById('playerProviderBadge')?.classList.add('hidden');
    document.getElementById('btnChangeSource')?.classList.add('hidden');
    renderContinueWatching();
    if (audioGainNode) audioGainNode.gain.value = 1.0;
    const booster = document.getElementById('audioBoostSlider'); if (booster) booster.value = 100;
    const boostVal = document.getElementById('audioBoostValue'); if (boostVal) boostVal.textContent = '100%';
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

// ═════════════════════════════════════════════════════════════════
// FORM SUBMIT
// ═════════════════════════════════════════════════════════════════
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

        if (type === 'movie') {
            const validSources = movieSourcesBuilder.filter(s => s.url && s.url.trim());
            if (validSources.length === 0) { showMsg('Adicione ao menos 1 fonte de vídeo!', 'error'); return; }
            const usedTypes = validSources.map(s => s.type).filter(t => t && t !== 'other');
            const dupType = usedTypes.find((t, i) => usedTypes.indexOf(t) !== i);
            if (dupType) { showMsg(`Tipo duplicado: ${sourceTypeLabel(dupType)}. Remova.`, 'error'); return; }

            payload.videoSources = validSources.map(s => ({ type: s.type || 'other', label: s.label || sourceTypeLabel(s.type) || 'Fonte', url: s.url.trim() }));
            payload.videoUrl = payload.videoSources[0].url;
        } else {
            const us = [];
            for (let si = 0; si < seasonsBuilder.length; si++) {
                const s = seasonsBuilder[si];
                let sc = document.getElementById(`seasonCoverPrev_${si}`)?.src || (s.seasonCoverUrl || '');
                if (!isValidImageUrl(sc)) sc = '';
                const ue = [];
                for (let ei = 0; ei < (s.episodes || []).length; ei++) {
                    let et = document.getElementById(`epThumbPrev_${si}_${ei}`)?.src || (s.episodes[ei].thumbUrl || '');
                    if (!isValidImageUrl(et)) et = '';
                    const epSources = (episodeSourcesBuilder[si] && episodeSourcesBuilder[si][ei]) || [];
                    const validEpSources = epSources.filter(src => src.url && src.url.trim());
                    const epUsedTypes = validEpSources.map(s => s.type).filter(t => t && t !== 'other');
                    const epDupType = epUsedTypes.find((t, i) => epUsedTypes.indexOf(t) !== i);
                    if (epDupType) { showMsg(`T${si+1} E${ei+1}: tipo "${sourceTypeLabel(epDupType)}" duplicado!`, 'error'); return; }
                    ue.push({
                        title: document.getElementById(`epTitle_${si}_${ei}`)?.value?.trim() || `Episódio ${ei + 1}`,
                        duration: document.getElementById(`epDuration_${si}_${ei}`)?.value?.trim() || '',
                        thumbUrl: et,
                        videoSources: validEpSources.map(src => ({ type: src.type || 'other', label: src.label || sourceTypeLabel(src.type) || 'Fonte', url: src.url.trim() })),
                        videoUrl: validEpSources.length > 0 ? validEpSources[0].url.trim() : ''
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
            seasonsBuilder = []; episodeSourcesBuilder = []; movieSourcesBuilder = []; selectedGenres = [];
            renderMovieSources();
            await loadCatalog();
        } catch (err) { showMsg('Erro: ' + err.message, 'error'); }
    };
}

// ═════════════════════════════════════════════════════════════════
// ADMIN
// ═════════════════════════════════════════════════════════════════
window.editMedia = (id) => {
    const i = mediaCatalog.find(m => m.id === id); if (!i) return;
    document.getElementById('editMediaId').value = i.id;
    const ts = document.getElementById('mediaType');
    if (ts) { ts.value = i.type; ts.disabled = true; ts.dispatchEvent(new Event('change')); }
    selectedGenres = Array.isArray(i.genres) && i.genres.length > 0 ? [...i.genres] : (i.category ? [i.category] : []);
    renderGenreSelector();
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('mediaTitle', i.title); setVal('mediaYear', i.year); setVal('mediaDuration', i.duration); setVal('mediaDesc', i.description);
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

window.deleteMedia = async (id) => { if (confirm("Apagar?")) { try { await remove(ref(rtdb, "catalog/" + id)); showMsg('Removido! ✅', 'success'); loadCatalog(); } catch (e) { showMsg('Erro: ' + e.message, 'error'); } } };

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
    if (mediaForm) mediaForm.reset();
    const ts = document.getElementById('mediaType'); if (ts) { ts.disabled = false; ts.dispatchEvent(new Event('change')); }
    document.getElementById('mediaCoverPreview')?.classList.add('hidden');
    document.getElementById('mediaBackdropPreview')?.classList.add('hidden');
    document.getElementById('creatorTitle').innerText = 'Publicar';
    seasonsBuilder = []; episodeSourcesBuilder = []; movieSourcesBuilder = []; selectedGenres = [];
    renderGenreSelector(); renderMovieSources();
    const sList = document.getElementById('seasonsList'); if (sList) sList.innerHTML = '';
    openModal('creatorModal');
}

// ═════════════════════════════════════════════════════════════════
// SUGGESTIONS
// ═════════════════════════════════════════════════════════════════
document.getElementById('btnCloseSuggestion')?.addEventListener('click', () => closeModal('suggestionModal'));
document.getElementById('btnSendSuggestion')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) { showMsg('Faça login!', 'error'); return; }
    const text = document.getElementById('suggestionText')?.value.trim();
    const type = document.getElementById('suggestionType')?.value;
    if (!text || text.length < 5) { showMsg('Escreva algo válido!', 'error'); return; }
    try { await set(push(ref(rtdb, "suggestions")), { userId: user.uid, userEmail: user.email, userName: getUserCache('name') || user.email.split('@')[0], text, type, timestamp: Date.now() }); document.getElementById('suggestionText').value = ''; showMsg('Enviado! ✅', 'success'); closeModal('suggestionModal'); }
    catch (e) { showMsg('Erro: ' + e.message, 'error'); }
});

// SUGGESTIONS ADMIN
document.getElementById('btnCloseSuggestionsAdmin')?.addEventListener('click', () => { exitSelectMode(); closeModal('suggestionsAdminModal'); });
async function loadSuggestionsAdmin() {
    try { const snap = await get(ref(rtdb, "suggestions")); allSuggestions = []; if (snap.exists()) { const d = snap.val(); for (let k in d) allSuggestions.push({ id: k, ...d[k] }); } allSuggestions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); document.getElementById('suggestionsCountText').textContent = `${allSuggestions.length} item(s)`; renderSuggestionsList(); }
    catch (e) { showMsg('Erro: ' + e.message, 'error'); }
}
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

// ═════════════════════════════════════════════════════════════════
// STORAGE
// ═════════════════════════════════════════════════════════════════
document.getElementById('btnCloseStorage')?.addEventListener('click', () => closeModal('storageModal'));
async function loadStorageInfo() {
    const c = document.getElementById('storageContent'); if (!c) return;
    c.innerHTML = '<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto 14px auto;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando banco de dados...</p></div>';
    try {
        const [catalogSnap, usersSnap, suggestionsSnap] = await Promise.all([get(ref(rtdb, "catalog")).catch(() => null), get(ref(rtdb, "users")).catch(() => null), get(ref(rtdb, "suggestions")).catch(() => null)]);
        const catalogData = catalogSnap?.exists() ? catalogSnap.val() : {};
        const usersData = usersSnap?.exists() ? usersSnap.val() : {};
        const suggestionsData = suggestionsSnap?.exists() ? suggestionsSnap.val() : {};
        const cb = estimateJsonBytes(catalogData), ub = estimateJsonBytes(usersData), sb = estimateJsonBytes(suggestionsData);
        const tb = cb + ub + sb;
        const cc = Object.keys(catalogData).length, uc = Object.keys(usersData).length, scc = Object.keys(suggestionsData).length;
        let movieCount = 0, serieCount = 0, totalEpisodes = 0;
        Object.values(catalogData).forEach(item => { if (item.type === 'movie') movieCount++; else { serieCount++; (item.seasons || []).forEach(s => { totalEpisodes += (s.episodes || []).length; }); } });
        const pct = Math.min(100, (tb / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100);
        const free = FIREBASE_RTDB_FREE_LIMIT_BYTES - tb;
        let bc = '#4caf50', statusText = '✅ Saudável', statusDesc = 'Espaço de sobra';
        if (pct > 50) { bc = '#8bc34a'; statusText = '✅ Bom'; statusDesc = 'Uso moderado'; }
        if (pct > 70) { bc = '#ff9800'; statusText = '⚠️ Atenção'; statusDesc = 'Considere limpar dados'; }
        if (pct > 85) { bc = '#ff5722'; statusText = '🔴 Crítico'; statusDesc = 'Limpe dados urgente'; }
        if (pct > 95) { bc = '#f44336'; statusText = '🚨 Cheio'; statusDesc = 'Banco quase lotado!'; }

        c.innerHTML = `
            <div style="text-align:center;margin-bottom:20px"><div style="font-size:38px;font-weight:900;color:${bc};line-height:1">${pct.toFixed(1)}%</div><div style="font-size:14px;font-weight:800;margin-top:4px">${statusText}</div><div style="font-size:11px;color:#888">${statusDesc}</div></div>
            <div style="margin-bottom:22px"><div class="storage-bar-outer"><div class="storage-bar-inner" style="width:${Math.max(2, pct)}%;background:linear-gradient(90deg,${bc},${bc}dd)"></div></div><div class="storage-info"><span>${formatBytes(tb)} usado</span><span>${formatBytes(free)} livre</span></div></div>
            <div style="display:flex;gap:10px;margin-bottom:22px"><div class="storage-icon-card"><span class="sto-icon">🎬</span><div class="sto-count">${movieCount}</div><div class="sto-label">Filmes</div></div><div class="storage-icon-card"><span class="sto-icon">📺</span><div class="sto-count">${serieCount}</div><div class="sto-label">Séries</div></div><div class="storage-icon-card"><span class="sto-icon">🎞️</span><div class="sto-count">${totalEpisodes}</div><div class="sto-label">Episódios</div></div></div>
            <h4 style="font-size:12px;font-weight:800;margin-bottom:12px;color:var(--primary-color)">📊 Uso por Categoria</h4>
            <div class="storage-detail-item"><span class="storage-label">🎬 Catálogo (${cc} itens)</span><span class="storage-value">${formatBytes(cb)}</span></div>
            <div style="margin-left:20px;margin-bottom:4px"><div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin-top:4px"><div style="height:100%;width:${tb > 0 ? (cb / tb * 100) : 0}%;background:var(--primary-color);border-radius:3px"></div></div></div>
            <div class="storage-detail-item"><span class="storage-label">👤 Usuários (${uc})</span><span class="storage-value">${formatBytes(ub)}</span></div>
            <div style="margin-left:20px;margin-bottom:4px"><div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin-top:4px"><div style="height:100%;width:${tb > 0 ? (ub / tb * 100) : 0}%;background:#2196f3;border-radius:3px"></div></div></div>
            <div class="storage-detail-item"><span class="storage-label">💡 Sugestões (${scc})</span><span class="storage-value">${formatBytes(sb)}</span></div>
            <div style="margin-left:20px;margin-bottom:4px"><div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin-top:4px"><div style="height:100%;width:${tb > 0 ? (sb / tb * 100) : 0}%;background:#ff9800;border-radius:3px"></div></div></div>
            <div class="storage-detail-item" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;margin-top:10px"><span class="storage-label" style="font-weight:800;color:#fff">TOTAL</span><span class="storage-value" style="color:${bc};font-size:15px">${formatBytes(tb)}</span></div>
            <div style="text-align:center;margin-top:18px;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.04)"><div style="font-size:10px;color:#666">Firebase RTDB — Plano Gratuito</div><div style="font-size:10px;color:#555;margin-top:2px">Limite: ${formatBytes(FIREBASE_RTDB_FREE_LIMIT_BYTES)}</div></div>`;
    } catch (e) { c.innerHTML = `<div style="text-align:center;padding:24px"><p style="color:#ff5252;font-size:14px;margin-bottom:10px">❌ Erro</p><p style="color:#888;font-size:11px">${e.message}</p></div>`; }
}

// ═════════════════════════════════════════════════════════════════
// PROFILE
// ═════════════════════════════════════════════════════════════════
document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    const picker = document.getElementById('themeColorPicker'); const tc = picker ? picker.value : '#e50914';
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
        setUserCache('theme_color', tc); updateUserAvatarUI(data);
        showMsg('Salvo! ✅', 'success'); closeModal('profileModal');
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
});

async function loadUserProfile(user) {
    if (!user) return;
    try {
        const s = await get(ref(rtdb, "users/" + user.uid));
        if (s.exists()) {
            const data = s.val();
            if (data.name) setUserCache('name', data.name); if (data.bio) setUserCache('bio', data.bio); if (data.favGenre) setUserCache('fav_genre', data.favGenre);
            if (data.photo) setUserCache('avatar', data.photo); if (data.banner) setUserCache('banner', data.banner); if (data.themeColor) setUserCache('theme_color', data.themeColor);
            updateUserAvatarUI(data);
            if (data.themeColor && !isTVDevice()) { applyUserTheme(data.themeColor); const p = document.getElementById('themeColorPicker'); if (p) p.value = data.themeColor; }
        } else updateUserAvatarUI({});
    } catch (e) { console.error(e); updateUserAvatarUI({}); }
}

function resetProfileUI() {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setTxt('avatarText', 'U'); document.getElementById('avatarImg')?.classList.add('hidden'); document.getElementById('avatarText')?.classList.remove('hidden');
    setTxt('profileAvatarBigText', 'U'); document.getElementById('profileAvatarBigImg')?.classList.add('hidden'); document.getElementById('profileAvatarBigText')?.classList.remove('hidden');
    setTxt('profileNameDisplay', 'Usuário'); setVal('profileNameInput', ''); setVal('profileBioInput', ''); setTxt('profileEmailDisplay', '');
    const pBanner = document.getElementById('profileBannerImg'); if (pBanner) pBanner.src = 'https://via.placeholder.com/600x200?text=Banner';
    document.getElementById('profilePhotoPreview')?.classList.add('hidden'); document.getElementById('profileBannerPreview')?.classList.add('hidden');
    setTxt('sidebarUserName', 'Usuário'); setTxt('sidebarUserEmail', 'email@exemplo.com');
    const sAvatar = document.getElementById('sidebarAvatar'); if (sAvatar) sAvatar.innerHTML = '<span>U</span>';
    setVal('themeColorPicker', '#e50914');
}

function updateUserAvatarUI(data = {}) {
    const un = data.name || getUserCache('name') || '';
    const ub = data.bio || getUserCache('bio') || '';
    const ug = data.favGenre || getUserCache('fav_genre') || '';
    const av = data.photo || getUserCache('avatar') || '';
    const bn = data.banner || getUserCache('banner') || '';
    const user = auth.currentUser;
    const letter = un ? un.charAt(0).toUpperCase() : (user ? user.email.charAt(0).toUpperCase() : 'U');
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
    } else { setTxt('avatarText', letter); setTxt('profileAvatarBigText', letter); if (sa) sa.innerHTML = `<span>${letter}</span>`; }
}

async function handleLogout() {
    try {
        currentUserUid = null; await signOut(auth); resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        closeModal('profileModal'); closeSidebar();
        activeItem = null; mediaCatalog = []; isAdmin = false; renderApp();
        showMsg('Saiu! 👋', 'success');
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
}
document.getElementById('btnLogout')?.addEventListener('click', handleLogout);

// ═════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════
const toggleAuth = document.getElementById('toggleAuthMode');
if (toggleAuth) {
    toggleAuth.onclick = () => {
        isSignUpMode = !isSignUpMode;
        document.getElementById('authSubtitle').innerText = isSignUpMode ? 'Crie sua conta gratuita' : 'Entre na sua conta para continuar';
        document.getElementById('btnAuthSubmit').innerText = isSignUpMode ? 'Criar Conta' : 'Entrar na Conta';
        toggleAuth.innerHTML = isSignUpMode ? 'Já tem conta? <span style="color:var(--primary-color)">Entrar</span>' : 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>';
    };
}
document.getElementById('authForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); if (authProcessing) return;
    authProcessing = true;
    const sb = document.getElementById('btnAuthSubmit'); const ot = sb ? sb.innerText : '';
    if (sb) { sb.innerText = '⏳ Aguarde...'; sb.disabled = true; }
    const email = document.getElementById('authEmail')?.value.trim().toLowerCase();
    const pass = document.getElementById('authPassword')?.value;
    if (!email || !pass || pass.length < 6) { showMsg('Preencha! Senha mín 6', 'error'); authProcessing = false; if (sb) { sb.innerText = ot; sb.disabled = false; } return; }
    try {
        if (isSignUpMode) {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(rtdb, "users/" + cred.user.uid), { name: email.split('@')[0], bio: '', favGenre: 'Ação', photo: '', banner: '', themeColor: '#e50914', createdAt: Date.now() });
            showMsg('Conta criada! ✅', 'success');
        } else { await signInWithEmailAndPassword(auth, email, pass); showMsg('Bem-vindo! 🎬', 'success'); }
        closeModal('authOverlay');
    } catch (err) { showMsg(translateAuthError(err.code), 'error'); }
    authProcessing = false;
    if (sb) { sb.innerText = ot; sb.disabled = false; }
});

// ═════════════════════════════════════════════════════════════════
// MODALS
// ═════════════════════════════════════════════════════════════════
document.getElementById('btnOpenProfile')?.addEventListener('click', () => openModal('profileModal'));
document.getElementById('btnCloseProfile')?.addEventListener('click', () => closeModal('profileModal'));
document.getElementById('btnCloseCreator')?.addEventListener('click', () => closeModal('creatorModal'));

// ═════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════
clearLegacyCache();
renderGenreSelector();
renderMovieSources();

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
    }
});

// ═════════════════════════════════════════════════════════════════
// TV D-PAD + ESC
// ═════════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
    if (isPlayerOpen()) return;
    if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009) {
        const modals = ['detailsModal','profileModal','adminModal','creatorModal','suggestionModal','suggestionsAdminModal','storageModal','cropperModal'];
        for (const id of modals) { const m = document.getElementById(id); if (m && !m.classList.contains('hidden')) { closeModal(id); e.preventDefault(); return; } }
        if (document.getElementById('sidebarMenu')?.classList.contains('active')) { closeSidebar(); e.preventDefault(); }
    }
});
