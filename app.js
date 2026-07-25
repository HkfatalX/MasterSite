import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
let isAdmin = false;
let suggestionsSelectMode = false;
let selectedSuggestionIds = new Set();
let allSuggestions = [];
let authProcessing = false;
let currentUserUid = null;

// Creator state
let creatorData = {
    type: 'movie',
    movieSources: [],
    seasons: []
};
let uiState = {
    openSeasons: new Set(),
    openEpisodes: new Set()
};

// Player state
let playerState = {
    sources: [],
    currentIndex: 0,
    mainTitle: '',
    subTitle: '',
    isOpen: false,
    controlsTimer: null,
    errorTimer: null,
    audioCtx: null,
    gainNode: null,
    boostedSet: new WeakSet(),
    boostInterval: null,
    boostLevel: 150
};

// ═══════════════════════════════════════════════════════════════
// PROVIDER ADAPTERS — COMPLETOS E CORRIGIDOS
// ═══════════════════════════════════════════════════════════════
const ADAPTERS = {
    mixdrop: {
        name: 'MixDrop', color: '#00c6ff', icon: '🎬', timeout: 18000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/mixdrop\.[a-z]+\/(?:f\/|e\/)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://mixdrop.ag/e/${m[1]}`;
            if (u.includes('/f/')) return u.replace('/f/', '/e/');
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-popups-to-escape-sandbox');
            return f;
        }
    },
    streamtape: {
        name: 'StreamTape', color: '#f5a623', icon: '📼', timeout: 18000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/streamtape\.[a-z]+\/(?:v|e)\/([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://streamtape.com/e/${m[1]}`;
            if (u.includes('/v/')) return u.replace('/v/', '/e/');
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
            return f;
        }
    },
    filemoon: {
        name: 'FileMoon', color: '#8e44ad', icon: '🌙', timeout: 22000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/filemoon\.[a-z]+\/(?:d\/|e\/)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://filemoon.sx/e/${m[1]}`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    voe: {
        name: 'VOE', color: '#ff4757', icon: '⚡', timeout: 22000,
        fix(url) { return url.trim(); },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    doodstream: {
        name: 'DoodStream', color: '#f39c12', icon: '🔥', timeout: 28000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/(?:dood[a-z0-9]*\.[a-z]+)\/(?:d\/|e\/)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) {
                const dm = u.match(/(https?:\/\/[^\/]+)/);
                return `${dm?.[1] || 'https://dood.li'}/e/${m[1]}`;
            }
            if (u.includes('/d/')) return u.replace('/d/', '/e/');
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    mp4upload: {
        name: 'Mp4Upload', color: '#3498db', icon: '📤', timeout: 18000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://www.mp4upload.com/embed-${m[1]}.html`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    okru: {
        name: 'OK.ru', color: '#ee8208', icon: '📡', timeout: 18000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/i);
            if (m?.[1]) return `https://ok.ru/videoembed/${m[1]}`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');
            return f;
        }
    },
    drive: {
        name: 'Google Drive', color: '#4285f4', icon: '💾', timeout: 18000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (m?.[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
            const m2 = u.match(/id=([a-zA-Z0-9_-]+)/);
            if (m2?.[1]) return `https://drive.google.com/file/d/${m2[1]}/preview`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            return f;
        }
    },
    yourupload: {
        name: 'YourUpload', color: '#27ae60', icon: '⬆️', timeout: 18000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/yourupload\.com\/(?:watch|embed)\/([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://www.yourupload.com/embed/${m[1]}`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    youtube: {
        name: 'YouTube', color: '#ff0000', icon: '▶️', timeout: 12000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
            if (m?.[1]) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
            return f;
        }
    },
    vimeo: {
        name: 'Vimeo', color: '#17d5ff', icon: '🎥', timeout: 12000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
            if (m?.[1]) return `https://player.vimeo.com/video/${m[1]}?autoplay=1&color=e50914`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            return f;
        }
    },
    superflix: {
        name: 'SuperFlix', color: '#e91e63', icon: '🌟', timeout: 20000,
        fix(url) { return url.trim(); },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    embedplayer: {
        name: 'EmbedPlayer', color: '#009688', icon: '📺', timeout: 20000,
        fix(url) { return url.trim(); },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    warezcdn: {
        name: 'WarezCDN', color: '#673ab7', icon: '🔮', timeout: 20000,
        fix(url) {
            let u = url.trim();
            // Suporta formatos: /embed/video/ID ou /embed/ID
            const m = u.match(/warezcdn\.[a-z]+\/(?:embed\/(?:video\/)?)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://embed.warezcdn.link/filme/${m[1]}`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    streamsb: {
        name: 'StreamSB', color: '#00bcd4', icon: '📡', timeout: 20000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/(?:streamsb|sbplay|sblongvu)\.[a-z]+\/(?:e\/|embed\/)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://streamsb.net/e/${m[1]}.html`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms allow-popups');
            return f;
        }
    },
    upstream: {
        name: 'Upstream', color: '#ff6b35', icon: '🚀', timeout: 20000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/upstream\.[a-z]+\/(?:e\/)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://upstream.to/e/${m[1]}`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    vidoza: {
        name: 'Vidoza', color: '#ffd700', icon: '🎞️', timeout: 20000,
        fix(url) {
            let u = url.trim();
            const m = u.match(/vidoza\.[a-z]+\/(?:embed-)?([a-zA-Z0-9]+)/i);
            if (m?.[1]) return `https://vidoza.net/embed-${m[1]}.html`;
            return u;
        },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    },
    direct: {
        name: 'Vídeo Direto', color: '#4caf50', icon: '📹', timeout: 25000,
        fix(url) { return url.trim(); },
        make(url) {
            const v = document.createElement('video');
            v.src = url; v.controls = true; v.autoplay = true;
            v.playsInline = true; v.style.background = '#000';
            return v;
        }
    },
    other: {
        name: 'Outro', color: '#888', icon: '🔗', timeout: 22000,
        fix(url) { return url.trim(); },
        make(url) {
            const f = document.createElement('iframe');
            f.src = url; f.allowFullscreen = true;
            f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
            return f;
        }
    }
};

function getAdapter(type) {
    return ADAPTERS[type] || ADAPTERS.other;
}

function detectType(url) {
    if (!url) return 'other';
    const u = url.toLowerCase();
    if (u.includes('mixdrop')) return 'mixdrop';
    if (u.includes('streamtape')) return 'streamtape';
    if (u.includes('filemoon')) return 'filemoon';
    if (u.includes('voe.sx') || u.includes('voe.')) return 'voe';
    if (u.includes('dood') || u.includes('d0000d') || u.includes('dooood')) return 'doodstream';
    if (u.includes('mp4upload')) return 'mp4upload';
    if (u.includes('ok.ru')) return 'okru';
    if (u.includes('drive.google')) return 'drive';
    if (u.includes('yourupload')) return 'yourupload';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('vimeo.com')) return 'vimeo';
    if (u.includes('superflix')) return 'superflix';
    if (u.includes('warezcdn')) return 'warezcdn';
    if (u.includes('streamsb') || u.includes('sbplay') || u.includes('sblongvu')) return 'streamsb';
    if (u.includes('upstream.to')) return 'upstream';
    if (u.includes('vidoza')) return 'vidoza';
    if (/\.(mp4|m3u8|webm|mkv|avi)(\?|$)/i.test(u)) return 'direct';
    return 'other';
}

function normalizeSources(item) {
    if (Array.isArray(item.videoSources) && item.videoSources.length > 0) return item.videoSources;
    if (item.videoUrl?.trim()) {
        const t = detectType(item.videoUrl);
        return [{ type: t, label: getAdapter(t).name, url: item.videoUrl.trim() }];
    }
    return [];
}

function normalizeEpSources(ep) {
    if (Array.isArray(ep.videoSources) && ep.videoSources.length > 0) return ep.videoSources;
    if (ep.videoUrl?.trim()) {
        const t = detectType(ep.videoUrl);
        return [{ type: t, label: getAdapter(t).name, url: ep.videoUrl.trim() }];
    }
    return [];
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
function isTVDevice() { return /smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(navigator.userAgent); }
function isTV() { return isTVDevice() || (window.innerWidth >= 1920 && !('ontouchstart' in window)); }

(function setupTV() {
    if (isTV()) document.body.classList.add('tv-mode');
    window.addEventListener('resize', () => document.body.classList.toggle('tv-mode', isTV()));
})();

function openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('hidden'); document.body.classList.add('modal-open'); }
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); document.body.classList.remove('modal-open'); }
}
function normalizeText(t) {
    return t ? t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';
}
function getPosterUrl(i) { return i.coverUrl || i.backdropUrl || ''; }
function getBackdropUrl(i) { return i.backdropUrl || i.coverUrl || ''; }
function getItemGenres(i) {
    if (Array.isArray(i.genres) && i.genres.length) return i.genres;
    return i.category ? [i.category] : [];
}
function itemMatchesCategory(i, c) {
    if (c === "Todos") return true;
    if (c === "Filmes") return i.type === "movie";
    if (c === "Séries") return i.type === "serie";
    return getItemGenres(i).includes(c);
}
function showMsg(text, type) {
    const m = document.getElementById('msg');
    if (!m) return;
    m.innerText = text;
    m.className = type === 'success' ? 'msg-success' : type === 'info' ? 'msg-info' : 'msg-error';
    m.classList.remove('hidden');
    setTimeout(() => m.classList.add('hidden'), 4000);
}
function isValidImageUrl(url) {
    if (!url) return false;
    if (url.includes(window.location.origin) && !url.startsWith('data:')) return false;
    return url.startsWith('http') || url.startsWith('data:image');
}
function formatBytes(b) {
    if (b === 0) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
}
function estimateJsonBytes(obj) {
    try { return new Blob([JSON.stringify(obj)]).size; } catch { return JSON.stringify(obj).length * 2; }
}
function timeAgo(ts) {
    const d = Date.now() - ts;
    const min = Math.floor(d / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}
function translateAuthError(c) {
    return ({
        'auth/email-already-in-use': 'E-mail já cadastrado!',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'Senha fraca (mín 6 caracteres).',
        'auth/user-not-found': 'Conta não encontrada.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde.',
        'auth/network-request-failed': 'Sem conexão com a internet.'
    })[c] || `Erro: ${c}`;
}

// ═══════════════════════════════════════════════════════════════
// CACHE / THEME
// ═══════════════════════════════════════════════════════════════
function getCacheKey(k) { return currentUserUid ? `mfx_${currentUserUid}_${k}` : null; }
function setCache(k, v) { const key = getCacheKey(k); if (key && v) localStorage.setItem(key, v); }
function getCache(k) { const key = getCacheKey(k); return key ? localStorage.getItem(key) : null; }
function clearLegacyCache() {
    ['masterflix_user_name', 'masterflix_user_bio', 'masterflix_user_fav_genre', 'masterflix_user_avatar', 'masterflix_user_banner']
        .forEach(k => localStorage.removeItem(k));
}
function applyTheme(color) {
    if (!color || isTVDevice()) return;
    document.documentElement.style.setProperty('--primary-color', color);
    document.documentElement.style.setProperty('--primary-glow', hexToRgba(color, 0.35));
    localStorage.setItem('mfx_theme_color', color);
    if (currentUserUid) setCache('theme_color', color);
}
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

if (!isTVDevice()) {
    const sc = localStorage.getItem('mfx_theme_color');
    if (sc) applyTheme(sc);
}

window.addEventListener('scroll', () => {
    document.getElementById('mainHeader')?.classList.toggle('scrolled', window.scrollY > 50);
});

// ═══════════════════════════════════════════════════════════════
// AUDIO BOOST — INVISÍVEL E AUTOMÁTICO
// ═══════════════════════════════════════════════════════════════
function initAudio() {
    if (playerState.audioCtx) return;
    try {
        playerState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        playerState.gainNode = playerState.audioCtx.createGain();
        playerState.gainNode.connect(playerState.audioCtx.destination);
        playerState.gainNode.gain.value = playerState.boostLevel / 100;
    } catch (e) { console.warn('AudioContext:', e); }
}

function boostElement(el) {
    if (!playerState.audioCtx || !playerState.gainNode) return;
    if (playerState.boostedSet.has(el)) return;
    try {
        const src = playerState.audioCtx.createMediaElementSource(el);
        src.connect(playerState.gainNode);
        playerState.boostedSet.add(el);
    } catch {}
}

function scanAndBoost() {
    if (!playerState.audioCtx || !playerState.isOpen) return;
    document.querySelectorAll('#playerVideoArea video, #playerVideoArea audio').forEach(el => boostElement(el));
    try {
        const iframe = document.querySelector('#playerVideoArea iframe');
        if (iframe?.contentDocument) {
            iframe.contentDocument.querySelectorAll('video, audio').forEach(el => boostElement(el));
        }
    } catch {}
}

function startBoostInterval() {
    stopBoostInterval();
    playerState.boostInterval = setInterval(scanAndBoost, 3000);
}

function stopBoostInterval() {
    if (playerState.boostInterval) {
        clearInterval(playerState.boostInterval);
        playerState.boostInterval = null;
    }
}

function setGain(level) {
    playerState.boostLevel = level;
    if (playerState.gainNode) playerState.gainNode.gain.value = level / 100;
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════
function openSidebar() {
    document.getElementById('sidebarMenu')?.classList.add('active');
    document.getElementById('sidebarOverlay')?.classList.add('active');
    document.getElementById('menuToggleBtn')?.classList.add('active');
    document.body.classList.add('modal-open');
}
function closeSidebar() {
    document.getElementById('sidebarMenu')?.classList.remove('active');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    document.getElementById('menuToggleBtn')?.classList.remove('active');
    document.body.classList.remove('modal-open');
}

document.getElementById('menuToggleBtn')?.addEventListener('click', () => {
    document.getElementById('sidebarMenu')?.classList.contains('active') ? closeSidebar() : openSidebar();
});
document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeSidebar);
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
document.getElementById('brandLogoBtn')?.addEventListener('click', () => {
    selectedCategory = "Todos";
    updateCategoryChips();
    renderApp();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
        const a = item.dataset.nav;
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        if (['home', 'movies', 'series', 'continue'].includes(a)) item.classList.add('active');
        closeSidebar();
        if (a === 'home') {
            selectedCategory = "Todos"; updateCategoryChips(); renderApp();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (a === 'movies') {
            selectedCategory = "Filmes"; updateCategoryChips(); renderApp();
            window.scrollTo({ top: 300, behavior: 'smooth' });
        } else if (a === 'series') {
            selectedCategory = "Séries"; updateCategoryChips(); renderApp();
            window.scrollTo({ top: 300, behavior: 'smooth' });
        } else if (a === 'continue') {
            const r = document.getElementById('continueRow');
            if (r && !r.classList.contains('hidden')) r.scrollIntoView({ behavior: 'smooth' });
            else showMsg('Nada em andamento!', 'error');
        } else if (a === 'suggestions') openModal('suggestionModal');
        else if (a === 'profile') openModal('profileModal');
        else if (a === 'admin') { renderAdminList(); openModal('adminModal'); }
        else if (a === 'creator') openCreator();
        else if (a === 'suggestionsAdmin') { loadSuggestionsAdmin(); openModal('suggestionsAdminModal'); }
        else if (a === 'storage') { loadStorageInfo(); openModal('storageModal'); }
        else if (a === 'logout') { if (confirm('Sair da conta?')) handleLogout(); }
    });
});

function updateCategoryChips() {
    document.querySelectorAll('.category-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.cat === selectedCategory);
    });
}

document.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedCategory = chip.dataset.cat;
        renderApp();
    });
});

// ═══════════════════════════════════════════════════════════════
// GENRE SELECTOR
// ═══════════════════════════════════════════════════════════════
function renderGenreSelector() {
    const c = document.getElementById('genreSelectorContainer');
    if (!c) return;
    c.innerHTML = '';
    AVAILABLE_GENRES.forEach(g => {
        const t = document.createElement('div');
        t.className = 'genre-tag' + (selectedGenres.includes(g) ? ' selected' : '');
        t.textContent = g;
        t.addEventListener('click', () => {
            const i = selectedGenres.indexOf(g);
            if (i >= 0) selectedGenres.splice(i, 1); else selectedGenres.push(g);
            renderGenreSelector();
        });
        c.appendChild(t);
    });
    const ct = document.getElementById('genreCounter');
    if (ct) {
        ct.textContent = selectedGenres.length === 0
            ? '⚠️ Selecione ao menos 1 gênero'
            : `✓ ${selectedGenres.length}: ${selectedGenres.join(', ')}`;
        ct.style.color = selectedGenres.length === 0 ? '#ff9800' : 'var(--primary-color)';
    }
}

// ═══════════════════════════════════════════════════════════════
// CREATOR TABS
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.creator-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        syncCreatorInputs();
        document.querySelectorAll('.creator-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.creator-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`[data-tab-content="${tab.dataset.tab}"]`)?.classList.add('active');
    });
});

// ═══════════════════════════════════════════════════════════════
// CREATOR — MOVIE SOURCES
// ═══════════════════════════════════════════════════════════════
function renderMovieSources() {
    const container = document.getElementById('movieSourcesList');
    if (!container) return;
    container.innerHTML = '';

    if (!creatorData.movieSources.length) {
        container.innerHTML = '<div class="source-empty-state">Nenhuma fonte. Clique em <strong>+ Adicionar Fonte</strong>.</div>';
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

        const usedTypes = creatorData.movieSources.filter((_, i) => i !== idx).map(s => s.type).filter(Boolean);
        Array.from(ts.options).forEach(opt => {
            if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) {
                opt.disabled = true;
                if (!opt.text.includes('✓')) opt.text = `${opt.text} (já usado)`;
            }
        });

        ts.addEventListener('change', () => {
            const nt = ts.value;
            if (nt && nt !== 'other' && creatorData.movieSources.some((s, i) => i !== idx && s.type === nt)) {
                showMsg(`Já existe uma fonte "${getAdapter(nt).name}"!`, 'error');
                ts.value = src.type || ''; return;
            }
            creatorData.movieSources[idx].type = nt;
            if (!creatorData.movieSources[idx].label && nt) creatorData.movieSources[idx].label = getAdapter(nt).name;
            renderMovieSources();
        });
        ti.addEventListener('input', () => { creatorData.movieSources[idx].label = ti.value; });
        ui.addEventListener('input', () => {
            creatorData.movieSources[idx].url = ui.value;
            if (!creatorData.movieSources[idx].type && ui.value) {
                const d = detectType(ui.value);
                if (!creatorData.movieSources.some((s, i) => i !== idx && s.type === d)) {
                    creatorData.movieSources[idx].type = d;
                    if (!creatorData.movieSources[idx].label) creatorData.movieSources[idx].label = getAdapter(d).name;
                    renderMovieSources();
                }
            }
        });
        card.querySelector('[data-action="remove-source"]').addEventListener('click', () => {
            creatorData.movieSources.splice(idx, 1); renderMovieSources();
        });
        container.appendChild(card);
    });
}

document.getElementById('btnAddMovieSource')?.addEventListener('click', () => {
    creatorData.movieSources.push({ id: uid(), type: '', label: '', url: '' });
    renderMovieSources();
});

// ═══════════════════════════════════════════════════════════════
// CREATOR — SYNC INPUTS TO STATE
// ═══════════════════════════════════════════════════════════════
function syncCreatorInputs() {
    if (creatorData.type !== 'serie') return;
    creatorData.seasons.forEach(s => {
        (s.episodes || []).forEach(ep => {
            const t = document.querySelector(`[data-ep-title="${ep.id}"]`);
            const d = document.querySelector(`[data-ep-duration="${ep.id}"]`);
            if (t) ep.title = t.value;
            if (d) ep.duration = d.value;
            (ep.sources || []).forEach(src => {
                const st = document.querySelector(`[data-src-type="${src.id}"]`);
                const sl = document.querySelector(`[data-src-label="${src.id}"]`);
                const su = document.querySelector(`[data-src-url="${src.id}"]`);
                if (st) src.type = st.value;
                if (sl) src.label = sl.value;
                if (su) src.url = su.value;
            });
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// CREATOR — SEASONS LIST
// ═══════════════════════════════════════════════════════════════
function renderSeasonsList() {
    const c = document.getElementById('seasonsList');
    if (!c) return;
    c.innerHTML = '';

    if (!creatorData.seasons.length) {
        c.innerHTML = '<div class="empty-list-state"><span class="empty-icon">📺</span>Nenhuma temporada. Adicione a primeira!</div>';
        return;
    }

    creatorData.seasons.forEach((season, si) => {
        const isOpen = uiState.openSeasons.has(season.id);
        const epCount = (season.episodes || []).length;
        const hasContent = (season.episodes || []).some(ep => ep.sources?.some(s => s.url?.trim()));

        const acc = document.createElement('div');
        acc.className = 'season-accordion' + (isOpen ? ' open' : '');
        acc.innerHTML = `
            <div class="season-header" data-season-toggle="${season.id}">
                <div class="season-header-left">
                    <div class="season-toggle-icon">▶</div>
                    <div>
                        <div class="season-title">Temporada ${si + 1}</div>
                        <div class="season-subtitle">${epCount} episódio(s)${hasContent ? ' • <span style="color:#46d369">✓ com fontes</span>' : ''}</div>
                    </div>
                </div>
                <div class="season-header-actions">
                    <button type="button" class="season-mini-btn danger" data-remove-season="${season.id}" title="Remover temporada">🗑️</button>
                </div>
            </div>
            <div class="season-body">
                <div class="input-group">
                    <label>🖼️ Foto da Temporada (opcional)</label>
                    <label class="file-upload-box" style="cursor:pointer" data-season-cover-box="${season.id}">
                        <span class="file-upload-label">📁 Escolher imagem</span>
                        <input type="file" id="sci_${season.id}" accept="image/*" class="hidden">
                        <img id="scp_${season.id}" src="${season.seasonCoverUrl || ''}" class="file-preview-img ${season.seasonCoverUrl ? '' : 'hidden'}" data-season-cover="${season.id}">
                    </label>
                </div>
                <label style="font-size:11px;font-weight:800;color:var(--primary-color);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:block">🎬 Episódios</label>
                <div data-ep-list="${season.id}"></div>
                <button type="button" class="add-btn-block" data-add-ep="${season.id}" style="margin-top:10px">+ Novo Episódio</button>
            </div>
        `;
        c.appendChild(acc);
        renderEpisodesList(season);

        // Toggle accordion
        acc.querySelector(`[data-season-toggle="${season.id}"]`).addEventListener('click', e => {
            if (e.target.closest('button')) return;
            syncCreatorInputs();
            uiState.openSeasons.has(season.id) ? uiState.openSeasons.delete(season.id) : uiState.openSeasons.add(season.id);
            renderSeasonsList();
        });

        // Remove season
        acc.querySelector(`[data-remove-season="${season.id}"]`).addEventListener('click', e => {
            e.stopPropagation();
            if (!confirm('Remover esta temporada e todos os episódios?')) return;
            const idx = creatorData.seasons.findIndex(s => s.id === season.id);
            if (idx >= 0) { creatorData.seasons.splice(idx, 1); uiState.openSeasons.delete(season.id); renderSeasonsList(); }
        });

        // Add episode
        acc.querySelector(`[data-add-ep="${season.id}"]`).addEventListener('click', () => {
            syncCreatorInputs();
            const epNum = (season.episodes?.length || 0) + 1;
            const ep = { id: uid(), title: `Episódio ${epNum}`, duration: '45m', thumbUrl: '', sources: [] };
            season.episodes = season.episodes || [];
            season.episodes.push(ep);
            uiState.openEpisodes.add(ep.id);
            renderSeasonsList();
        });

        // Season cover
        const coverBox = acc.querySelector(`[data-season-cover-box="${season.id}"]`);
        const coverInput = acc.querySelector(`#sci_${season.id}`);
        coverBox.addEventListener('click', () => coverInput?.click());
        coverInput?.addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const img = document.getElementById(`scp_${season.id}`);
                if (img) { img.src = ev.target.result; img.classList.remove('hidden'); season.seasonCoverUrl = ev.target.result; }
            };
            reader.readAsDataURL(file);
        });
    });
}

function renderEpisodesList(season) {
    const container = document.querySelector(`[data-ep-list="${season.id}"]`);
    if (!container) return;
    container.innerHTML = '';
    const episodes = season.episodes || [];

    if (!episodes.length) {
        container.innerHTML = '<div class="empty-list-state" style="padding:14px;font-size:11px"><span class="empty-icon" style="font-size:24px">🎬</span>Nenhum episódio</div>';
        return;
    }

    episodes.forEach((ep, ei) => {
        const isOpen = uiState.openEpisodes.has(ep.id);
        const hasSource = ep.sources?.some(s => s.url?.trim());
        const srcCount = ep.sources?.filter(s => s.url?.trim()).length || 0;

        const acc = document.createElement('div');
        acc.className = 'episode-accordion' + (isOpen ? ' open' : '');
        acc.innerHTML = `
            <div class="episode-accordion-header" data-ep-toggle="${ep.id}">
                <div class="episode-accordion-header-left">
                    <span class="ep-number-badge">${ei + 1}</span>
                    <div class="ep-info-mini">
                        <div class="ep-info-mini-title">${ep.title || `Episódio ${ei + 1}`}</div>
                        <div class="ep-info-mini-sub">
                            ${ep.duration ? '⏱️ ' + ep.duration : ''}
                            ${hasSource ? `<span class="ok-badge">✓ ${srcCount} fonte(s)</span>` : '<span class="warn-badge">⚠ sem fonte</span>'}
                        </div>
                    </div>
                </div>
                <div class="episode-accordion-actions">
                    <button type="button" class="season-mini-btn danger" data-remove-ep="${season.id}|${ep.id}">🗑️</button>
                    <span class="ep-toggle-icon">▶</span>
                </div>
            </div>
            <div class="episode-body">
                <div class="input-group">
                    <label>Título do episódio</label>
                    <input type="text" data-ep-title="${ep.id}" value="${(ep.title || '').replace(/"/g,'&quot;')}" autocomplete="off">
                </div>
                <div class="input-group">
                    <label>Duração</label>
                    <input type="text" data-ep-duration="${ep.id}" value="${(ep.duration || '').replace(/"/g,'&quot;')}" placeholder="Ex: 45m" autocomplete="off">
                </div>
                <div class="input-group">
                    <label>🖼️ Thumbnail (opcional)</label>
                    <label class="file-upload-box" style="cursor:pointer" data-ep-thumb-box="${ep.id}">
                        <span class="file-upload-label">📸 Escolher imagem</span>
                        <input type="file" id="eti_${ep.id}" accept="image/*" class="hidden">
                        <img id="etp_${ep.id}" src="${ep.thumbUrl || ''}" class="file-preview-img ${ep.thumbUrl ? '' : 'hidden'}" data-ep-thumb="${ep.id}">
                    </label>
                </div>
                <div class="input-group">
                    <label style="font-size:11px;font-weight:800;color:var(--primary-color);text-transform:uppercase;letter-spacing:.5px">🎞️ Fontes de Vídeo</label>
                    <div data-ep-sources="${ep.id}"></div>
                    <button type="button" class="add-btn-block" data-add-src="${ep.id}" style="margin-top:10px;font-size:11px;padding:10px">+ Adicionar Fonte</button>
                </div>
            </div>
        `;
        container.appendChild(acc);
        renderEpSources(ep);

        // Toggle episode
        acc.querySelector(`[data-ep-toggle="${ep.id}"]`).addEventListener('click', e => {
            if (e.target.closest('button')) return;
            syncCreatorInputs();
            uiState.openEpisodes.has(ep.id) ? uiState.openEpisodes.delete(ep.id) : uiState.openEpisodes.add(ep.id);
            renderSeasonsList();
        });

        // Remove episode
        acc.querySelector(`[data-remove-ep="${season.id}|${ep.id}"]`).addEventListener('click', e => {
            e.stopPropagation();
            if (!confirm('Remover este episódio?')) return;
            const idx = season.episodes.findIndex(x => x.id === ep.id);
            if (idx >= 0) { season.episodes.splice(idx, 1); uiState.openEpisodes.delete(ep.id); renderSeasonsList(); }
        });

        // Add source
        acc.querySelector(`[data-add-src="${ep.id}"]`).addEventListener('click', () => {
            syncCreatorInputs();
            ep.sources = ep.sources || [];
            ep.sources.push({ id: uid(), type: '', label: '', url: '' });
            renderSeasonsList();
        });

        // Thumb upload
        const thumbBox = acc.querySelector(`[data-ep-thumb-box="${ep.id}"]`);
        const thumbInput = acc.querySelector(`#eti_${ep.id}`);
        thumbBox.addEventListener('click', () => thumbInput?.click());
        thumbInput?.addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const img = document.getElementById(`etp_${ep.id}`);
                if (img) { img.src = ev.target.result; img.classList.remove('hidden'); ep.thumbUrl = ev.target.result; }
            };
            reader.readAsDataURL(file);
        });

        // Live input update
        acc.querySelector(`[data-ep-title="${ep.id}"]`)?.addEventListener('input', e => { ep.title = e.target.value; });
        acc.querySelector(`[data-ep-duration="${ep.id}"]`)?.addEventListener('input', e => { ep.duration = e.target.value; });
    });
}

function findEpById(epId) {
    for (const s of creatorData.seasons) {
        const found = (s.episodes || []).find(e => e.id === epId);
        if (found) return found;
    }
    return null;
}

function renderEpSources(ep) {
    const container = document.querySelector(`[data-ep-sources="${ep.id}"]`);
    if (!container) return;
    container.innerHTML = '';
    const sources = ep.sources || [];

    if (!sources.length) {
        container.innerHTML = '<div class="source-empty-state" style="font-size:11px">Sem fontes adicionadas.</div>';
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

        const usedTypes = sources.filter((_, i) => i !== sidx).map(s => s.type).filter(Boolean);
        Array.from(ts.options).forEach(opt => {
            if (opt.value && opt.value !== 'other' && opt.value !== src.type && usedTypes.includes(opt.value)) opt.disabled = true;
        });

        ts.addEventListener('change', () => {
            const nt = ts.value;
            if (nt && nt !== 'other' && sources.some((s, i) => i !== sidx && s.type === nt)) {
                showMsg('Tipo duplicado neste episódio!', 'error'); ts.value = src.type || ''; return;
            }
            src.type = nt;
            if (!src.label && nt) src.label = getAdapter(nt).name;
            renderEpSources(ep);
        });
        ti.addEventListener('input', () => { src.label = ti.value; });
        ui.addEventListener('input', () => {
            src.url = ui.value;
            if (!src.type && ui.value) {
                const d = detectType(ui.value);
                if (!sources.some((s, i) => i !== sidx && s.type === d)) {
                    src.type = d; if (!src.label) src.label = getAdapter(d).name; renderEpSources(ep);
                }
            }
        });
        card.querySelector('[data-action="remove-source"]').addEventListener('click', () => {
            sources.splice(sidx, 1); renderEpSources(ep);
        });
        container.appendChild(card);
    });
}

document.getElementById('btnAddSeasonBtn')?.addEventListener('click', () => {
    syncCreatorInputs();
    const season = { id: uid(), seasonNumber: creatorData.seasons.length + 1, seasonCoverUrl: '', episodes: [] };
    const ep = { id: uid(), title: 'Episódio 1', duration: '45m', thumbUrl: '', sources: [] };
    season.episodes.push(ep);
    creatorData.seasons.push(season);
    uiState.openSeasons.add(season.id);
    uiState.openEpisodes.add(ep.id);
    renderSeasonsList();
});

// ═══════════════════════════════════════════════════════════════
// CROPPER
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.file-upload-box').forEach(box => {
    if (box.htmlFor) return; // skip label[for] triggers (handled by native)
    const fileInput = box.querySelector('input[type="file"]');
    const previewId = box.getAttribute('data-crop-preview');
    const ratio = parseFloat(box.getAttribute('data-aspect-ratio')) || NaN;
    if (!fileInput) return;

    box.addEventListener('click', e => {
        if (e.target === fileInput) return;
        e.preventDefault(); fileInput.click();
    });

    fileInput.addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const preview = previewId ? document.getElementById(previewId) : null;
        const reader = new FileReader();
        reader.onload = ev => {
            const tmp = new Image();
            tmp.onload = () => {
                if (tmp.naturalWidth <= 800 && tmp.naturalHeight <= 800) {
                    if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
                    fileInput.value = ''; return;
                }
                currentTargetPreview = preview;
                if (!document.getElementById('profileModal')?.classList.contains('hidden')) {
                    previousModal = 'profileModal'; closeModal('profileModal');
                } else if (!document.getElementById('creatorModal')?.classList.contains('hidden')) {
                    previousModal = 'creatorModal'; closeModal('creatorModal');
                } else previousModal = null;

                const cropImg = document.getElementById('cropperImage');
                if (cropImg) cropImg.src = ev.target.result;
                openModal('cropperModal');
                if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
                cropperInstance = new Cropper(cropImg, {
                    aspectRatio: ratio, viewMode: 1, autoCropArea: 1, responsive: true,
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
    });
});

document.getElementById('btnConfirmCrop')?.addEventListener('click', () => {
    if (!cropperInstance) return;
    const cv = cropperInstance.getCroppedCanvas({ width: 1200 });
    if (cv && currentTargetPreview) {
        const dataUrl = cv.toDataURL('image/jpeg', 0.92);
        currentTargetPreview.src = dataUrl;
        currentTargetPreview.classList.remove('hidden');
        // Update season/episode state
        const seasonId = currentTargetPreview.dataset.seasonCover;
        if (seasonId) { const s = creatorData.seasons.find(s => s.id === seasonId); if (s) s.seasonCoverUrl = dataUrl; }
        const epId = currentTargetPreview.dataset.epThumb;
        if (epId) { const ep = findEpById(epId); if (ep) ep.thumbUrl = dataUrl; }
    }
    cropperInstance?.destroy(); cropperInstance = null;
    closeModal('cropperModal');
    if (previousModal) { openModal(previousModal); previousModal = null; }
});

document.getElementById('btnCloseCropper')?.addEventListener('click', () => {
    cropperInstance?.destroy(); cropperInstance = null;
    closeModal('cropperModal');
    if (previousModal) { openModal(previousModal); previousModal = null; }
});

// ═══════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchResultsDropdown');

document.getElementById('searchIconBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    if (searchBox?.classList.contains('active')) {
        if (!searchInput?.value.trim()) searchBox.classList.remove('active');
    } else {
        searchBox?.classList.add('active');
        setTimeout(() => searchInput?.focus(), 250);
    }
});

searchInput?.addEventListener('input', () => {
    const v = searchInput.value.trim();
    if (v) { searchBox?.classList.add('has-text'); renderSearchDropdown(v); }
    else { searchBox?.classList.remove('has-text'); searchDropdown?.classList.remove('visible'); }
});

document.getElementById('searchClearBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    if (searchInput) searchInput.value = '';
    searchBox?.classList.remove('has-text');
    searchDropdown?.classList.remove('visible');
    searchInput?.focus();
});

document.addEventListener('click', e => {
    const w = document.getElementById('searchWrapper');
    if (w && !w.contains(e.target)) {
        searchDropdown?.classList.remove('visible');
        if (!searchInput?.value.trim()) searchBox?.classList.remove('active');
    }
});

function smartSearch(q) {
    const nq = normalizeText(q); if (!nq) return [];
    return mediaCatalog
        .map(i => {
            const t = normalizeText(i.title); if (!t) return null;
            let s = 0;
            if (t === nq) s = 10000;
            else if (t.startsWith(nq)) s = 1000 - t.length;
            else if (t.includes(nq)) s = 100 - t.length;
            else { const mc = nq.split(' ').filter(w => w && t.includes(w)).length; if (mc) s = mc * 20; }
            return s > 0 ? { item: i, score: s } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(x => x.item);
}

function highlightMatch(t, q) {
    const nt = normalizeText(t), nq = normalizeText(q), i = nt.indexOf(nq);
    if (i === -1) return t;
    return t.substring(0, i) + '<mark>' + t.substring(i, i + q.length) + '</mark>' + t.substring(i + q.length);
}

function renderSearchDropdown(query) {
    if (!searchDropdown) return;
    const results = smartSearch(query);
    searchDropdown.innerHTML = '';
    if (!results.length) {
        searchDropdown.innerHTML = `<div class="search-no-results"><span class="search-empty-icon">🔍</span><div>Nenhum resultado para "${query}"</div></div>`;
    } else {
        searchDropdown.innerHTML = `<div class="search-results-header">🔍 ${results.length} resultado(s)</div>`;
        results.forEach(item => {
            const d = document.createElement('div');
            d.className = 'search-result-item'; d.tabIndex = 0;
            const p = getPosterUrl(item);
            const gs = getItemGenres(item);
            d.innerHTML = `
                <img class="search-result-thumb" src="${p}" loading="lazy" onerror="this.style.display='none'">
                <div class="search-result-info">
                    <div class="search-result-title">${highlightMatch(item.title, query)}</div>
                    <div class="search-result-meta">
                        <span class="type-badge">${item.type === 'movie' ? 'Filme' : 'Série'}</span>
                        ${item.year ? `<span>${item.year}</span>` : ''}
                        ${gs.length ? `<span>${gs.slice(0, 2).join(', ')}</span>` : ''}
                    </div>
                </div>`;
            d.addEventListener('click', () => {
                searchDropdown.classList.remove('visible');
                if (searchInput) searchInput.value = '';
                searchBox?.classList.remove('has-text');
                window.location.hash = `#/midia/${item.id}`;
                openDetails(item);
            });
            d.addEventListener('keydown', e => { if (e.key === 'Enter') d.click(); });
            searchDropdown.appendChild(d);
        });
    }
    searchDropdown.classList.add('visible');
}

// ═══════════════════════════════════════════════════════════════
// HASH ROUTING
// ═══════════════════════════════════════════════════════════════
function handleHashRouting() {
    const h = window.location.hash;
    if (h.startsWith('#/midia/')) {
        const id = h.replace('#/midia/', '');
        const item = mediaCatalog.find(m => m.id === id);
        if (item) openDetails(item);
    }
}
window.addEventListener('hashchange', handleHashRouting);

// ═══════════════════════════════════════════════════════════════
// MEDIA TYPE TOGGLE (Creator)
// ═══════════════════════════════════════════════════════════════
document.getElementById('mediaType')?.addEventListener('change', e => {
    creatorData.type = e.target.value;
    const isMovie = creatorData.type === 'movie';
    document.getElementById('movieFileArea')?.classList.toggle('hidden', !isMovie);
    document.getElementById('seriesBuilderArea')?.classList.toggle('hidden', isMovie);
    const lbl = document.getElementById('mediaDurationLabel');
    if (lbl) lbl.textContent = isMovie ? 'Duração (Ex: 2h 10m)' : 'Duração Média (Ex: 45m/ep)';
    if (!isMovie && !creatorData.seasons.length) {
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
// CATALOG / CONTINUE WATCHING
// ═══════════════════════════════════════════════════════════════
async function loadCatalog() {
    try {
        const snap = await get(ref(rtdb, "catalog"));
        mediaCatalog = [];
        if (snap.exists()) {
            const d = snap.val();
            for (const k in d) {
                const item = { id: k, ...d[k] };
                if (!Array.isArray(item.genres)) item.genres = item.category ? [item.category] : [];
                mediaCatalog.push(item);
            }
        }
        renderApp();
        renderAdminList();
        handleHashRouting();
    } catch (e) { showMsg('Erro ao carregar catálogo: ' + e.message, 'error'); }
}

function getContinueList() {
    if (!currentUserUid) return [];
    try { return JSON.parse(localStorage.getItem(`mfx_${currentUserUid}_continue`) || '[]'); }
    catch { return []; }
}
function saveContinueList(list) {
    if (currentUserUid) localStorage.setItem(`mfx_${currentUserUid}_continue`, JSON.stringify(list));
}
function cleanExpiredContinue() {
    let list = getContinueList();
    const now = Date.now();
    list = list.filter(i => (now - (i.lastWatched || 0)) < CONTINUE_EXPIRE_MS);
    saveContinueList(list); return list;
}
function saveContinueWatching(item, extra = '', episodeInfo = null) {
    if (!currentUserUid) return;
    let cl = getContinueList();
    cl = cl.filter(i => i.id !== item.id);
    cl.unshift({ id: item.id, title: item.title, type: item.type, coverUrl: getBackdropUrl(item) || getPosterUrl(item), duration: item.duration || extra, lastWatched: Date.now(), episodeInfo });
    if (cl.length > 30) cl.pop();
    saveContinueList(cl);
    renderContinueWatching();
}
function removeContinueItem(id) { saveContinueList(getContinueList().filter(i => i.id !== id)); renderContinueWatching(); }
function getContinueInfo(id) { return getContinueList().find(i => i.id === id) || null; }

function renderContinueWatching() {
    const cr = document.getElementById('continueRow');
    const cc = document.getElementById('continueCarousel');
    if (!cr || !cc) return;
    cc.innerHTML = '';
    if (!currentUserUid) { cr.classList.add('hidden'); return; }
    let list = cleanExpiredContinue();
    if (selectedCategory === "Filmes") list = list.filter(i => i.type === 'movie');
    else if (selectedCategory === "Séries") list = list.filter(i => i.type === 'serie');
    else if (selectedCategory !== "Todos") {
        list = list.filter(i => { const o = mediaCatalog.find(m => m.id === i.id); return o && getItemGenres(o).includes(selectedCategory); });
    }
    if (!list.length) { cr.classList.add('hidden'); return; }
    cr.classList.remove('hidden');
    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'continue-card'; card.tabIndex = 0;
        const ep = item.episodeInfo ? `<div class="continue-ep-badge">▶ ${item.episodeInfo}</div>` : '';
        card.innerHTML = `
            <img src="${item.coverUrl || ''}" loading="lazy" onerror="this.src=''">
            <button type="button" class="continue-remove-btn" aria-label="Remover">✕</button>
            <div class="continue-play-icon">▶</div>
            <div class="continue-info">
                <div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</div>
                ${ep}
                <div class="continue-duration">${item.lastWatched ? '🕐 ' + timeAgo(item.lastWatched) : ''}</div>
            </div>`;
        card.querySelector('.continue-remove-btn').addEventListener('click', e => { e.stopPropagation(); removeContinueItem(item.id); });
        card.addEventListener('click', () => { const o = mediaCatalog.find(m => m.id === item.id); if (o) openDetails(o); });
        cc.appendChild(card);
    });
}

function renderApp() {
    const mc = document.getElementById('moviesCarousel');
    const sc = document.getElementById('seriesCarousel');
    const mr = document.getElementById('moviesRow');
    const sr = document.getElementById('seriesRow');
    if (!mc || !sc) return;
    mc.innerHTML = ''; sc.innerHTML = '';
    mr.classList.toggle('hidden', selectedCategory === "Séries");
    sr.classList.toggle('hidden', selectedCategory === "Filmes");

    mediaCatalog.forEach(item => {
        if (!itemMatchesCategory(item, selectedCategory)) return;
        const card = document.createElement('div');
        card.className = 'media-card'; card.tabIndex = 0;
        const ps = getPosterUrl(item);
        const gs = getItemGenres(item);
        const tag = gs.length ? gs[0] : (item.type === 'movie' ? 'Filme' : 'Série');
        if (ps) {
            card.innerHTML = `<img class="media-card-poster" src="${ps}" loading="lazy" onerror="this.style.display='none'"><div class="media-card-overlay"><span class="media-card-tag">${tag}</span><div class="media-card-title">${item.title}</div></div>`;
        } else {
            card.innerHTML = `<div class="media-card-poster-fallback">🎬</div><div class="media-card-overlay"><span class="media-card-tag">${tag}</span><div class="media-card-title">${item.title}</div></div>`;
        }
        card.addEventListener('click', () => { window.location.hash = `#/midia/${item.id}`; openDetails(item); });
        card.addEventListener('keydown', e => { if (e.key === 'Enter') card.click(); });
        if (item.type === 'movie') mc.appendChild(card); else sc.appendChild(card);
    });

    renderContinueWatching();
    if (mediaCatalog.length && !activeItem) setHero(mediaCatalog[Math.floor(Math.random() * Math.min(mediaCatalog.length, 5))]);
}

function setHero(item) {
    activeItem = item;
    const heroTitle = document.getElementById('heroTitle');
    const heroDesc = document.getElementById('heroDesc');
    const heroMeta = document.getElementById('heroMeta');
    const heroBackdrop = document.getElementById('heroBackdrop');
    if (heroTitle) heroTitle.textContent = item.title;
    if (heroDesc) heroDesc.textContent = item.description || '';
    const gs = getItemGenres(item);
    const tl = item.type === 'movie' ? '🎬 FILME' : '📺 SÉRIE';
    if (heroMeta) heroMeta.innerHTML = `<strong>${tl}</strong>${item.year ? ` <span class="dot">•</span> ${item.year}` : ''}${item.duration ? ` <span class="dot">•</span> ⏱️ ${item.duration}` : ''}${gs.length ? ` <span class="dot">•</span> ${gs.slice(0, 3).join(', ')}` : ''}`;
    const bd = getBackdropUrl(item);
    if (bd && heroBackdrop) heroBackdrop.style.backgroundImage = `url('${bd}')`;

    document.getElementById('heroPlayBtn').onclick = () => {
        if (item.type === 'movie') { saveContinueWatching(item); initiatePlay(normalizeSources(item), item.title, 'Filme'); }
        else openDetails(item);
    };
    document.getElementById('heroInfoBtn').onclick = () => openDetails(item);
}

// ═══════════════════════════════════════════════════════════════
// DETAILS MODAL
// ═══════════════════════════════════════════════════════════════
function openDetails(item) {
    activeItem = item;
    const bd = getBackdropUrl(item);
    const ba = document.getElementById('detailBackdropArea');
    if (ba) { ba.style.backgroundImage = bd ? `url('${bd}')` : ''; ba.style.background = bd ? '' : '#1a1a1a'; }

    const ps = getPosterUrl(item);
    const dp = document.getElementById('detailPoster');
    if (dp) { if (ps) { dp.src = ps; dp.style.display = 'block'; } else dp.style.display = 'none'; }

    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailMeta').textContent = `${item.type === 'movie' ? 'FILME' : 'SÉRIE'} • ${item.year || ''}${item.duration ? ' • ⏱️ ' + item.duration : ''}`;

    const gd = document.getElementById('detailGenres');
    if (gd) {
        gd.innerHTML = '';
        getItemGenres(item).forEach(g => {
            const b = document.createElement('span');
            b.style.cssText = 'padding:5px 14px;background:rgba(229,9,20,0.12);border:1px solid rgba(229,9,20,0.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary-color);text-transform:uppercase';
            b.textContent = g; gd.appendChild(b);
        });
    }
    document.getElementById('detailDesc').textContent = item.description || '';

    const ca = document.getElementById('detailsContentArea');
    const ci = getContinueInfo(item.id);

    if (item.type === 'movie') {
        document.getElementById('detailMovieArea')?.classList.remove('hidden');
        document.getElementById('detailSerieArea')?.classList.add('hidden');
        const bp = document.getElementById('btnPlayMovieFile');
        if (bp) {
            bp.textContent = ci ? '▶ Continuar Assistindo' : '▶ Assistir Filme';
            bp.onclick = () => { saveContinueWatching(item); closeModal('detailsModal'); initiatePlay(normalizeSources(item), item.title, 'Filme'); };
        }
    } else {
        document.getElementById('detailMovieArea')?.classList.add('hidden');
        document.getElementById('detailSerieArea')?.classList.remove('hidden');
        const tabs = document.getElementById('seasonTabs');
        if (tabs) tabs.innerHTML = '';
        let resumeSeasonIdx = 0, resumeEpIdx = -1;
        if (ci?.episodeInfo) {
            const match = ci.episodeInfo.match(/T(\d+)\s*E(\d+)/i);
            if (match) { resumeSeasonIdx = parseInt(match[1]) - 1; resumeEpIdx = parseInt(match[2]) - 1; }
        }
        (item.seasons || []).forEach((s, idx) => {
            const tab = document.createElement('div');
            tab.className = 'season-tab' + (idx === resumeSeasonIdx ? ' active' : '');
            tab.textContent = `T${idx + 1}`; tab.tabIndex = 0;
            tab.addEventListener('click', () => {
                document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                if (s.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${s.seasonCoverUrl}')`;
                else if (ba) ba.style.backgroundImage = bd ? `url('${bd}')` : '';
                renderEpList(s.episodes || [], idx, s, item, idx === resumeSeasonIdx ? resumeEpIdx : -1);
            });
            tab.addEventListener('keydown', e => { if (e.key === 'Enter') tab.click(); });
            tabs?.appendChild(tab);
        });
        if (item.seasons?.length) {
            const si = Math.min(resumeSeasonIdx, item.seasons.length - 1);
            const ts = item.seasons[si];
            if (ts?.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${ts.seasonCoverUrl}')`;
            renderEpList(ts?.episodes || [], si, ts, item, si === resumeSeasonIdx ? resumeEpIdx : -1);
        }
    }
    openModal('detailsModal');
    if (ca) ca.scrollTop = 0;
}

function renderEpList(eps, si, sd, ser, rei) {
    const c = document.getElementById('episodesListContainer');
    if (!c) return;
    c.innerHTML = '';
    const fallbackImg = sd?.seasonCoverUrl?.trim() || getBackdropUrl(ser) || getPosterUrl(ser) || '';
    eps.forEach((ep, idx) => {
        const d = document.createElement('div');
        d.className = 'episode-card'; d.tabIndex = 0;
        const th = ep.thumbUrl?.trim() || fallbackImg;
        const dur = ep.duration ? `<span style="color:#888;font-size:10px;margin-left:6px">⏱️ ${ep.duration}</span>` : '';
        const lbl = `T${si + 1} E${idx + 1}`;
        const isResume = idx === rei;
        const rb = isResume ? `<div class="ep-resume-badge">⏳ Onde parou</div>` : '';
        d.innerHTML = `
            <div class="episode-thumb">
                <img src="${th}" loading="lazy" onerror="this.src='${fallbackImg}'">
                <div class="ep-play-overlay"><span>▶</span></div>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:800">${lbl} - ${ep.title || 'Sem Título'}${dur}</div>
                <span style="font-size:11px;color:var(--primary-color);font-weight:700">▶ ${isResume ? 'Continuar' : 'Assistir'}</span>
                ${rb}
            </div>`;
        if (isResume) { d.style.border = '1.5px solid rgba(255,202,40,0.35)'; d.style.background = 'rgba(255,202,40,0.04)'; }
        d.addEventListener('click', () => {
            closeModal('detailsModal');
            saveContinueWatching(activeItem, ep.duration || '', `${lbl} - ${ep.title || ''}`);
            initiatePlay(normalizeEpSources(ep), activeItem.title, `${lbl} - ${ep.title || ''}`);
        });
        d.addEventListener('keydown', e => { if (e.key === 'Enter') d.click(); });
        c.appendChild(d);
    });
    if (rei >= 0) {
        setTimeout(() => {
            const cards = c.querySelectorAll('.episode-card');
            if (cards[rei]) cards[rei].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
    }
}

document.getElementById('btnCloseDetails')?.addEventListener('click', () => {
    window.location.hash = ''; closeModal('detailsModal');
});

// ═══════════════════════════════════════════════════════════════
// PLAYER — COMPLETAMENTE REFEITO E CORRIGIDO
// ═══════════════════════════════════════════════════════════════
const playerModal = document.getElementById('playerModal');
const playerBox = document.getElementById('playerModalBox');
const playerTopbar = document.getElementById('playerTopbar');
const playerVideoArea = document.getElementById('playerVideoArea');
const playerLoading = document.getElementById('playerLoading');

function isPlayerOpen() { return !playerModal?.classList.contains('hidden'); }

// ──────────────────────────────────────────────
// Controles de visibilidade (topbar)
// ──────────────────────────────────────────────
function showControls() {
    if (!isPlayerOpen()) return;
    playerTopbar?.classList.remove('hidden-controls');
    clearTimeout(playerState.controlsTimer);
    playerState.controlsTimer = setTimeout(() => {
        if (isPlayerOpen()) playerTopbar?.classList.add('hidden-controls');
    }, 4000);
}

function setupControlsEvents() {
    // Mouse move — mostra controles
    playerBox?.addEventListener('mousemove', showControls);
    // Touch — mostra controles
    playerBox?.addEventListener('touchstart', showControls, { passive: true });
    // Click no player (fora dos botões) — toggle controles
    playerVideoArea?.addEventListener('click', () => {
        if (playerTopbar?.classList.contains('hidden-controls')) showControls();
        else {
            playerTopbar?.classList.add('hidden-controls');
            clearTimeout(playerState.controlsTimer);
        }
    });
}
setupControlsEvents();

// ──────────────────────────────────────────────
// Fullscreen — CORRIGIDO COMPLETAMENTE
// ──────────────────────────────────────────────
async function requestFullscreen() {
    const el = playerBox;
    if (!el) return;
    try {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        else if (el.mozRequestFullScreen) await el.mozRequestFullScreen();
        else if (el.msRequestFullscreen) await el.msRequestFullscreen();
        // Lock landscape on mobile
        if (screen.orientation?.lock) {
            try { await screen.orientation.lock('landscape'); } catch {}
        }
    } catch (e) { console.warn('Fullscreen error:', e); }
}

async function exitFullscreen() {
    try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) await document.mozCancelFullScreen();
        else if (document.msExitFullscreen) await document.msExitFullscreen();
        if (screen.orientation?.unlock) { try { screen.orientation.unlock(); } catch {} }
    } catch (e) { console.warn('Exit fullscreen error:', e); }
}

function isInFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}

function updateFullscreenBtn() {
    const btn = document.getElementById('btnToggleFullscreen');
    if (btn) btn.textContent = isInFullscreen() ? '⤢' : '⛶';
}

document.getElementById('btnToggleFullscreen')?.addEventListener('click', async e => {
    e.stopPropagation();
    if (isInFullscreen()) await exitFullscreen();
    else await requestFullscreen();
    showControls();
});

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(ev => {
    document.addEventListener(ev, () => { updateFullscreenBtn(); showControls(); });
});

// ──────────────────────────────────────────────
// Reload / Change source
// ──────────────────────────────────────────────
document.getElementById('btnReloadPlayer')?.addEventListener('click', e => {
    e.stopPropagation();
    if (playerState.sources.length) { playByIndex(playerState.currentIndex); showMsg('Recarregando...', 'info'); }
    showControls();
});

document.getElementById('btnChangeSource')?.addEventListener('click', e => {
    e.stopPropagation(); showSourcePanel(); showControls();
});

// ──────────────────────────────────────────────
// Source Panel
// ──────────────────────────────────────────────
function showSourcePanel() {
    const panel = document.getElementById('playerSourcePanel');
    const list = document.getElementById('playerSourceList');
    const sub = document.getElementById('playerSourcePanelSub');
    if (!panel || !list) return;
    if (sub) sub.textContent = `${playerState.sources.length} fontes disponíveis`;
    list.innerHTML = '';
    playerState.sources.forEach((src, idx) => {
        const ad = getAdapter(src.type);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'player-source-option'; btn.tabIndex = 0;
        if (idx === playerState.currentIndex) btn.classList.add('current');
        const isCurrentTag = idx === playerState.currentIndex ? '<span class="src-current-tag">Atual</span>' : '';
        const shortUrl = src.url ? (src.url.length > 55 ? src.url.slice(0, 55) + '…' : src.url) : '';
        btn.innerHTML = `
            <div class="src-top">
                <span class="src-name">${ad.icon} ${src.label || ad.name}${isCurrentTag}</span>
                <span class="src-type" style="color:${ad.color}">${ad.name}</span>
            </div>
            <div class="src-url">${shortUrl}</div>`;
        btn.addEventListener('click', () => { hideSourcePanel(); playerState.currentIndex = idx; playByIndex(idx); });
        list.appendChild(btn);
    });
    panel.classList.remove('hidden');
    showControls();
    setTimeout(() => list.querySelector('.player-source-option')?.focus(), 100);
}

function hideSourcePanel() { document.getElementById('playerSourcePanel')?.classList.add('hidden'); }
document.getElementById('btnCancelSourceSelect')?.addEventListener('click', () => {
    if (playerState.sources.length && playerState.currentIndex >= 0) hideSourcePanel();
    else closePlayer();
});

// ──────────────────────────────────────────────
// Error screen
// ──────────────────────────────────────────────
function showError(title, desc) {
    document.getElementById('playerErrorTitle').textContent = title;
    document.getElementById('playerErrorDesc').textContent = desc;
    const btn = document.getElementById('btnErrorTryAnother');
    if (btn) btn.style.display = playerState.sources.length > 1 ? '' : 'none';
    document.getElementById('playerErrorScreen')?.classList.remove('hidden');
    playerLoading?.classList.add('hidden');
}
function hideError() { document.getElementById('playerErrorScreen')?.classList.add('hidden'); }
document.getElementById('btnErrorTryAnother')?.addEventListener('click', () => { hideError(); showSourcePanel(); });
document.getElementById('btnErrorReload')?.addEventListener('click', () => { hideError(); playByIndex(playerState.currentIndex); });

// ──────────────────────────────────────────────
// Core play function
// ──────────────────────────────────────────────
function clearVideoArea() {
    if (!playerVideoArea) return;
    // Remove apenas os elementos de mídia, mantém o loading screen
    playerVideoArea.querySelectorAll('iframe, video').forEach(el => el.remove());
}

function playByIndex(idx) {
    const src = playerState.sources[idx];
    if (!src?.url?.trim()) { showError('Link inválido', 'A fonte não possui um link válido.'); return; }

    const ad = getAdapter(src.type);
    const finalUrl = ad.fix(src.url);
    playerState.currentIndex = idx;

    // Update title bar
    const titleEl = document.getElementById('playerTitleDisplay');
    const subEl = document.getElementById('playerSubDisplay');
    const badgeEl = document.getElementById('playerProviderBadge');
    if (titleEl) titleEl.textContent = playerState.mainTitle || 'Assistindo';
    if (subEl) subEl.textContent = playerState.subTitle || 'MasterFlix';
    if (badgeEl) {
        badgeEl.textContent = `${ad.icon} ${src.label || ad.name}`;
        badgeEl.style.background = `${ad.color}25`;
        badgeEl.style.borderColor = `${ad.color}60`;
        badgeEl.classList.remove('hidden');
    }

    // Show loading
    playerLoading?.classList.remove('hidden');
    const loadingText = document.getElementById('playerLoadingText');
    const loadingSub = document.getElementById('playerLoadingSub');
    if (loadingText) loadingText.textContent = `Carregando ${ad.name}...`;
    if (loadingSub) loadingSub.textContent = 'Preparando adaptador otimizado';

    hideError();
    hideSourcePanel();
    clearVideoArea();

    // Create media element
    const el = ad.make(finalUrl);

    // Style to fill area
    if (el.tagName === 'IFRAME') {
        el.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            border: none; background: #000;
        `;
    } else if (el.tagName === 'VIDEO') {
        el.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            background: #000; object-fit: contain;
        `;
    }

    // Load handlers
    el.addEventListener('load', () => {
        clearTimeout(playerState.errorTimer);
        setTimeout(() => {
            playerLoading?.classList.add('hidden');
            initAudio();
            if (playerState.audioCtx?.state === 'suspended') playerState.audioCtx.resume();
            setGain(playerState.boostLevel);
            scanAndBoost();
            startBoostInterval();
        }, 400);
    });

    if (el.tagName === 'VIDEO') {
        el.addEventListener('canplay', () => {
            clearTimeout(playerState.errorTimer);
            playerLoading?.classList.add('hidden');
            initAudio();
            if (playerState.audioCtx?.state === 'suspended') playerState.audioCtx.resume();
            setGain(playerState.boostLevel);
            boostElement(el);
        });
        el.addEventListener('error', () => showError(`Falha em ${ad.name}`, 'O vídeo não pôde ser carregado. Tente outra fonte.'));
    }

    playerVideoArea?.appendChild(el);

    // Auto-hide loading after timeout (iframes não disparam 'load' confiavelmente)
    playerState.errorTimer = setTimeout(() => {
        playerLoading?.classList.add('hidden');
    }, ad.timeout);

    showControls();
}

// ──────────────────────────────────────────────
// Initiate play (entry point)
// ──────────────────────────────────────────────
function initiatePlay(sources, mainTitle, subTitle) {
    if (!sources?.length) { showMsg('Nenhum link de vídeo encontrado!', 'error'); return; }
    playerState.sources = sources.slice();
    playerState.currentIndex = 0;
    playerState.mainTitle = mainTitle || '';
    playerState.subTitle = subTitle || '';
    playerState.isOpen = true;

    // Show/hide source change button
    document.getElementById('btnChangeSource')?.classList.toggle('hidden', sources.length <= 1);

    openModal('playerModal');

    if (sources.length === 1) {
        playByIndex(0);
    } else {
        // Multiple sources — show selector
        playerLoading?.classList.add('hidden');
        showSourcePanel();
    }
}

// ──────────────────────────────────────────────
// Close player
// ──────────────────────────────────────────────
function closePlayer() {
    clearTimeout(playerState.controlsTimer);
    clearTimeout(playerState.errorTimer);
    stopBoostInterval();

    if (isInFullscreen()) exitFullscreen();

    clearVideoArea();
    hideError();
    hideSourcePanel();
    playerLoading?.classList.remove('hidden');
    playerTopbar?.classList.remove('hidden-controls');

    playerState.isOpen = false;
    playerState.sources = [];
    playerState.currentIndex = 0;
    playerState.mainTitle = '';
    playerState.subTitle = '';

    // Reset gain
    if (playerState.gainNode) playerState.gainNode.gain.value = 1.0;

    // Reset provider badge
    document.getElementById('playerProviderBadge')?.classList.add('hidden');
    document.getElementById('btnChangeSource')?.classList.add('hidden');
    updateFullscreenBtn();

    closeModal('playerModal');
    renderContinueWatching();
}

document.getElementById('btnClosePlayer')?.addEventListener('click', e => {
    e.stopPropagation(); closePlayer();
});

// ──────────────────────────────────────────────
// Keyboard shortcuts
// ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (isPlayerOpen()) {
        if (e.key === 'Escape') { closePlayer(); return; }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); document.getElementById('btnToggleFullscreen')?.click(); }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); document.getElementById('btnReloadPlayer')?.click(); }
        if (e.key === 'c' || e.key === 'C') { e.preventDefault(); document.getElementById('btnChangeSource')?.click(); }
        showControls(); return;
    }
    // Modals ESC close
    if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009) {
        const modals = ['cropperModal', 'suggestionsAdminModal', 'storageModal', 'suggestionModal', 'creatorModal', 'adminModal', 'profileModal', 'detailsModal', 'forgotSuccessModal', 'forgotPasswordModal'];
        for (const id of modals) {
            const m = document.getElementById(id);
            if (m && !m.classList.contains('hidden')) { closeModal(id); e.preventDefault(); return; }
        }
        if (document.getElementById('sidebarMenu')?.classList.contains('active')) { closeSidebar(); e.preventDefault(); }
    }
});

// ═══════════════════════════════════════════════════════════════
// FORM SUBMIT (SAVE MEDIA)
// ═══════════════════════════════════════════════════════════════
document.getElementById('mediaForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    syncCreatorInputs();

    if (!selectedGenres.length) {
        showMsg('Selecione ao menos 1 gênero!', 'error');
        document.querySelector('.creator-tab[data-tab="info"]')?.click(); return;
    }
    const title = document.getElementById('mediaTitle')?.value.trim();
    if (!title) {
        showMsg('Digite um título!', 'error');
        document.querySelector('.creator-tab[data-tab="info"]')?.click(); return;
    }

    const editId = document.getElementById('editMediaId')?.value;
    let cv = document.getElementById('mediaCoverPreview')?.src || '';
    let bd = document.getElementById('mediaBackdropPreview')?.src || '';
    if (!isValidImageUrl(cv) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) cv = ex.coverUrl; }
    if (!isValidImageUrl(bd) && editId) { const ex = mediaCatalog.find(m => m.id === editId); if (ex) bd = ex.backdropUrl; }

    const payload = {
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
        if (!vs.length) {
            showMsg('Adicione ao menos 1 fonte de vídeo!', 'error');
            document.querySelector('.creator-tab[data-tab="content"]')?.click(); return;
        }
        payload.videoSources = vs.map(s => ({ type: s.type || 'other', label: s.label || getAdapter(s.type).name || 'Fonte', url: s.url.trim() }));
        payload.videoUrl = payload.videoSources[0].url;
    } else {
        const seasons = [];
        for (let si = 0; si < creatorData.seasons.length; si++) {
            const s = creatorData.seasons[si];
            const eps = [];
            for (let ei = 0; ei < (s.episodes || []).length; ei++) {
                const ep = s.episodes[ei];
                const epSrcs = (ep.sources || []).filter(src => src.url?.trim());
                eps.push({
                    title: ep.title?.trim() || `Episódio ${ei + 1}`,
                    duration: ep.duration?.trim() || '',
                    thumbUrl: isValidImageUrl(ep.thumbUrl) ? ep.thumbUrl : '',
                    videoSources: epSrcs.map(src => ({ type: src.type || 'other', label: src.label || getAdapter(src.type).name || 'Fonte', url: src.url.trim() })),
                    videoUrl: epSrcs.length ? epSrcs[0].url.trim() : ''
                });
            }
            seasons.push({ seasonNumber: si + 1, seasonCoverUrl: isValidImageUrl(s.seasonCoverUrl) ? s.seasonCoverUrl : '', episodes: eps });
        }
        payload.seasons = seasons;
    }

    try {
        if (editId) await set(ref(rtdb, "catalog/" + editId), payload);
        else await set(push(ref(rtdb, "catalog")), payload);
        showMsg('Salvo com sucesso! ✅', 'success');
        closeModal('creatorModal');
        resetCreator();
        await loadCatalog();
    } catch (err) { showMsg('Erro ao salvar: ' + err.message, 'error'); }
});

document.getElementById('btnCancelCreator')?.addEventListener('click', () => {
    if (confirm('Descartar alterações?')) { closeModal('creatorModal'); resetCreator(); }
});

function resetCreator() {
    creatorData = { type: 'movie', movieSources: [], seasons: [] };
    uiState.openSeasons.clear(); uiState.openEpisodes.clear();
    selectedGenres = [];
    document.getElementById('mediaForm')?.reset();
    const editId = document.getElementById('editMediaId'); if (editId) editId.value = '';
    document.getElementById('mediaCoverPreview')?.classList.add('hidden');
    document.getElementById('mediaBackdropPreview')?.classList.add('hidden');
    const mt = document.getElementById('mediaType'); if (mt) { mt.value = 'movie'; mt.disabled = false; }
    document.getElementById('movieFileArea')?.classList.remove('hidden');
    document.getElementById('seriesBuilderArea')?.classList.add('hidden');
    renderGenreSelector();
    renderMovieSources();
    renderSeasonsList();
    document.querySelector('.creator-tab[data-tab="info"]')?.click();
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════
window.editMedia = id => {
    const item = mediaCatalog.find(m => m.id === id); if (!item) return;
    resetCreator();
    document.getElementById('editMediaId').value = item.id;
    const ts = document.getElementById('mediaType');
    if (ts) { ts.value = item.type; ts.disabled = true; }
    creatorData.type = item.type;
    document.getElementById('movieFileArea')?.classList.toggle('hidden', item.type !== 'movie');
    document.getElementById('seriesBuilderArea')?.classList.toggle('hidden', item.type === 'movie');
    selectedGenres = Array.isArray(item.genres) && item.genres.length ? [...item.genres] : (item.category ? [item.category] : []);
    renderGenreSelector();
    document.getElementById('mediaTitle').value = item.title || '';
    document.getElementById('mediaYear').value = item.year || '';
    document.getElementById('mediaDuration').value = item.duration || '';
    document.getElementById('mediaDesc').value = item.description || '';
    if (item.coverUrl) { const img = document.getElementById('mediaCoverPreview'); if (img) { img.src = item.coverUrl; img.classList.remove('hidden'); } }
    if (item.backdropUrl) { const img = document.getElementById('mediaBackdropPreview'); if (img) { img.src = item.backdropUrl; img.classList.remove('hidden'); } }
    document.getElementById('creatorTitle').textContent = 'Editar';
    document.getElementById('creatorSubtitle').textContent = 'Ajuste os dados abaixo';

    if (item.type === 'movie') {
        creatorData.movieSources = normalizeSources(item).map(s => ({ id: uid(), ...s }));
        renderMovieSources();
    } else {
        creatorData.seasons = (item.seasons || []).map((s, si) => ({
            id: uid(), seasonNumber: si + 1, seasonCoverUrl: s.seasonCoverUrl || '',
            episodes: (s.episodes || []).map(ep => ({
                id: uid(), title: ep.title || '', duration: ep.duration || '',
                thumbUrl: ep.thumbUrl || '',
                sources: normalizeEpSources(ep).map(src => ({ id: uid(), ...src }))
            }))
        }));
        if (creatorData.seasons[0]) uiState.openSeasons.add(creatorData.seasons[0].id);
        renderSeasonsList();
    }
    closeModal('adminModal');
    openModal('creatorModal');
};

window.deleteMedia = async id => {
    if (!confirm('Apagar este item permanentemente?')) return;
    try { await remove(ref(rtdb, "catalog/" + id)); showMsg('Removido!', 'success'); loadCatalog(); }
    catch { showMsg('Erro ao remover', 'error'); }
};

function renderAdminList() {
    const c = document.getElementById('adminCatalogList'); if (!c) return;
    const sv = normalizeText(document.getElementById('adminSearchInput')?.value || '');
    c.innerHTML = '';
    mediaCatalog.forEach(item => {
        if (sv && !normalizeText(item.title).includes(sv)) return;
        const d = document.createElement('div'); d.className = 'admin-item';
        d.innerHTML = `
            <div>
                <strong>${item.title}</strong>
                <div style="font-size:10px;color:#888">${item.type === 'movie' ? '🎬 Filme' : '📺 Série'}${item.year ? ' • ' + item.year : ''}</div>
            </div>
            <div style="display:flex;gap:6px">
                <button class="btn-secondary" onclick="editMedia('${item.id}')">✏️</button>
                <button class="btn-danger" onclick="deleteMedia('${item.id}')">🗑️</button>
            </div>`;
        c.appendChild(d);
    });
}

document.getElementById('adminSearchInput')?.addEventListener('input', renderAdminList);
document.getElementById('btnCloseAdmin')?.addEventListener('click', () => closeModal('adminModal'));
document.getElementById('btnAddNewFromAdmin')?.addEventListener('click', () => { closeModal('adminModal'); openCreator(); });

function openCreator() {
    resetCreator();
    document.getElementById('creatorTitle').textContent = 'Publicar';
    document.getElementById('creatorSubtitle').textContent = 'Preencha os dados abaixo';
    openModal('creatorModal');
}

// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnCloseSuggestion')?.addEventListener('click', () => closeModal('suggestionModal'));
document.getElementById('btnSendSuggestion')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return showMsg('Faça login primeiro!', 'error');
    const text = document.getElementById('suggestionText')?.value.trim();
    const type = document.getElementById('suggestionType')?.value;
    if (!text || text.length < 5) return showMsg('Escreva mais detalhes!', 'error');
    try {
        await set(push(ref(rtdb, "suggestions")), { userId: user.uid, userEmail: user.email, userName: getCache('name') || user.email.split('@')[0], text, type, timestamp: Date.now() });
        document.getElementById('suggestionText').value = '';
        showMsg('Enviado! Obrigado! 💡', 'success'); closeModal('suggestionModal');
    } catch { showMsg('Erro ao enviar', 'error'); }
});

document.getElementById('btnCloseSuggestionsAdmin')?.addEventListener('click', () => { exitSelectMode(); closeModal('suggestionsAdminModal'); });

async function loadSuggestionsAdmin() {
    try {
        const snap = await get(ref(rtdb, "suggestions"));
        allSuggestions = [];
        if (snap.exists()) { const d = snap.val(); for (const k in d) allSuggestions.push({ id: k, ...d[k] }); }
        allSuggestions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const ct = document.getElementById('suggestionsCountText');
        if (ct) ct.textContent = `${allSuggestions.length} item(s)`;
        renderSuggestionsList();
    } catch {}
}

function renderSuggestionsList() {
    const c = document.getElementById('suggestionsAdminList'); if (!c) return;
    c.innerHTML = '';
    if (!allSuggestions.length) { c.innerHTML = '<p style="text-align:center;color:#666;padding:30px">Nenhuma sugestão.</p>'; return; }
    allSuggestions.forEach(s => {
        const d = document.createElement('div'); d.className = 'suggestion-box';
        const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString('pt-BR') : '?';
        const cb = suggestionsSelectMode ? `<input type="checkbox" class="suggestion-checkbox" data-id="${s.id}" ${selectedSuggestionIds.has(s.id) ? 'checked' : ''}>` : '';
        const del = !suggestionsSelectMode ? `<button class="btn-danger" style="padding:6px 10px;font-size:11px" onclick="deleteSingleSuggestion('${s.id}')">🗑️</button>` : '';
        const badge = s.type === 'bug' ? '🐛 BUG' : '💡 SUGESTÃO';
        d.innerHTML = `
            <div class="sg-header">
                <div style="display:flex;align-items:center;gap:8px">
                    ${cb}
                    <div>
                        <div class="sg-user">${s.userName || '?'} <span style="background:rgba(229,9,20,0.15);padding:1px 6px;border-radius:4px;font-size:9px">${badge}</span></div>
                        <div class="sg-email">${s.userEmail || ''}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px"><span class="sg-date">${date}</span>${del}</div>
            </div>
            <div class="sg-text">${s.text}</div>`;
        if (suggestionsSelectMode) {
            const chk = d.querySelector('.suggestion-checkbox');
            if (chk) chk.addEventListener('change', () => { chk.checked ? selectedSuggestionIds.add(s.id) : selectedSuggestionIds.delete(s.id); });
        }
        c.appendChild(d);
    });
}

function enterSelectMode() {
    suggestionsSelectMode = true; selectedSuggestionIds.clear();
    document.getElementById('btnToggleSelectMode')?.classList.add('hidden');
    document.getElementById('btnDeleteSelectedSuggestions')?.classList.remove('hidden');
    document.getElementById('btnSelectAllSuggestions')?.classList.remove('hidden');
    document.getElementById('btnCancelSelectMode')?.classList.remove('hidden');
    renderSuggestionsList();
}
function exitSelectMode() {
    suggestionsSelectMode = false; selectedSuggestionIds.clear();
    document.getElementById('btnToggleSelectMode')?.classList.remove('hidden');
    document.getElementById('btnDeleteSelectedSuggestions')?.classList.add('hidden');
    document.getElementById('btnSelectAllSuggestions')?.classList.add('hidden');
    document.getElementById('btnCancelSelectMode')?.classList.add('hidden');
    renderSuggestionsList();
}
document.getElementById('btnToggleSelectMode')?.addEventListener('click', enterSelectMode);
document.getElementById('btnCancelSelectMode')?.addEventListener('click', exitSelectMode);
document.getElementById('btnSelectAllSuggestions')?.addEventListener('click', () => {
    if (selectedSuggestionIds.size === allSuggestions.length) selectedSuggestionIds.clear();
    else allSuggestions.forEach(s => selectedSuggestionIds.add(s.id));
    renderSuggestionsList();
});
document.getElementById('btnDeleteSelectedSuggestions')?.addEventListener('click', async () => {
    if (!selectedSuggestionIds.size || !confirm(`Apagar ${selectedSuggestionIds.size} item(s)?`)) return;
    try { for (const id of selectedSuggestionIds) await remove(ref(rtdb, "suggestions/" + id)); showMsg('Apagado!', 'success'); exitSelectMode(); loadSuggestionsAdmin(); } catch {}
});
window.deleteSingleSuggestion = async id => {
    if (!confirm('Apagar esta sugestão?')) return;
    try { await remove(ref(rtdb, "suggestions/" + id)); loadSuggestionsAdmin(); } catch {}
};

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnCloseStorage')?.addEventListener('click', () => closeModal('storageModal'));

async function loadStorageInfo() {
    const c = document.getElementById('storageContent'); if (!c) return;
    c.innerHTML = '<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto 14px;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando...</p></div>';
    try {
        const [cs, us, ss] = await Promise.all([
            get(ref(rtdb, "catalog")).catch(() => null),
            get(ref(rtdb, "users")).catch(() => null),
            get(ref(rtdb, "suggestions")).catch(() => null)
        ]);
        const cd = cs?.exists() ? cs.val() : {};
        const ud = us?.exists() ? us.val() : {};
        const sd = ss?.exists() ? ss.val() : {};
        const cb = estimateJsonBytes(cd), ub = estimateJsonBytes(ud), sb = estimateJsonBytes(sd), tb = cb + ub + sb;
        const cc = Object.keys(cd).length, uc = Object.keys(ud).length, sc = Object.keys(sd).length;
        let mv = 0, sv = 0, te = 0;
        Object.values(cd).forEach(i => { if (i.type === 'movie') mv++; else { sv++; (i.seasons || []).forEach(s => te += (s.episodes || []).length); } });
        const pct = Math.min(100, (tb / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100);
        const free = FIREBASE_RTDB_FREE_LIMIT_BYTES - tb;
        let bc = '#46d369', status = '✅ Saudável';
        if (pct > 50) { bc = '#8bc34a'; }
        if (pct > 70) { bc = '#ff9800'; status = '⚠️ Atenção'; }
        if (pct > 85) { bc = '#ff5722'; status = '🔴 Crítico'; }
        c.innerHTML = `
            <div style="text-align:center;margin-bottom:20px">
                <div style="font-size:38px;font-weight:900;color:${bc}">${pct.toFixed(1)}%</div>
                <div style="font-size:14px;font-weight:800;margin-top:4px">${status}</div>
            </div>
            <div style="margin-bottom:22px">
                <div class="storage-bar-outer"><div class="storage-bar-inner" style="width:${Math.max(2, pct)}%;background:${bc}"></div></div>
                <div class="storage-info"><span>${formatBytes(tb)} usado</span><span>${formatBytes(free)} livre</span></div>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:22px">
                <div class="storage-icon-card"><span class="sto-icon">🎬</span><div class="sto-count">${mv}</div><div class="sto-label">Filmes</div></div>
                <div class="storage-icon-card"><span class="sto-icon">📺</span><div class="sto-count">${sv}</div><div class="sto-label">Séries</div></div>
                <div class="storage-icon-card"><span class="sto-icon">🎞️</span><div class="sto-count">${te}</div><div class="sto-label">Episódios</div></div>
            </div>
            <div class="storage-detail-item"><span class="storage-label">Catálogo (${cc})</span><span class="storage-value">${formatBytes(cb)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">Usuários (${uc})</span><span class="storage-value">${formatBytes(ub)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">Sugestões (${sc})</span><span class="storage-value">${formatBytes(sb)}</span></div>`;
    } catch (e) { c.innerHTML = `<p style="text-align:center;color:#ff5252;padding:20px">${e.message}</p>`; }
}

// ═══════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnOpenProfile')?.addEventListener('click', () => openModal('profileModal'));
document.getElementById('btnCloseProfile')?.addEventListener('click', () => closeModal('profileModal'));

document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    const tc = document.getElementById('themeColorPicker')?.value || '#e50914';
    if (!isTVDevice()) applyTheme(tc);
    const n = document.getElementById('profileNameInput')?.value.trim() || '';
    const b = document.getElementById('profileBioInput')?.value.trim() || '';
    const fg = document.getElementById('profileFavGenreInput')?.value || 'Ação';
    const ph = document.getElementById('profilePhotoPreview')?.src || '';
    const bn = document.getElementById('profileBannerPreview')?.src || '';
    const data = { name: n, bio: b, favGenre: fg, photo: isValidImageUrl(ph) ? ph : '', banner: isValidImageUrl(bn) ? bn : '', themeColor: tc };
    try {
        await set(ref(rtdb, "users/" + user.uid), data);
        if (n) setCache('name', n); if (b) setCache('bio', b); if (fg) setCache('fav_genre', fg);
        if (data.photo) setCache('avatar', data.photo); if (data.banner) setCache('banner', data.banner);
        setCache('theme_color', tc);
        updateAvatarUI(data);
        showMsg('Perfil salvo! ✅', 'success'); closeModal('profileModal');
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
});

async function loadUserProfile(user) {
    if (!user) return;
    try {
        const s = await get(ref(rtdb, "users/" + user.uid));
        if (s.exists()) {
            const data = s.val();
            if (data.name) setCache('name', data.name);
            if (data.bio) setCache('bio', data.bio);
            if (data.favGenre) setCache('fav_genre', data.favGenre);
            if (data.photo) setCache('avatar', data.photo);
            if (data.banner) setCache('banner', data.banner);
            if (data.themeColor) setCache('theme_color', data.themeColor);
            updateAvatarUI(data);
            if (data.themeColor && !isTVDevice()) {
                applyTheme(data.themeColor);
                const p = document.getElementById('themeColorPicker'); if (p) p.value = data.themeColor;
            }
        } else updateAvatarUI({});
    } catch { updateAvatarUI({}); }
}

function resetProfileUI() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('avatarText', 'U'); document.getElementById('avatarImg')?.classList.add('hidden');
    set('profileAvatarBigText', 'U'); document.getElementById('profileAvatarBigImg')?.classList.add('hidden');
    set('profileNameDisplay', 'Usuário'); setVal('profileNameInput', ''); setVal('profileBioInput', '');
    set('profileEmailDisplay', '');
    const pB = document.getElementById('profileBannerImg'); if (pB) pB.src = 'https://placehold.co/600x200/1e1e1e/8c8c8c?text=Banner';
    document.getElementById('profilePhotoPreview')?.classList.add('hidden');
    document.getElementById('profileBannerPreview')?.classList.add('hidden');
    set('sidebarUserName', 'Usuário'); set('sidebarUserEmail', 'email@exemplo.com');
    const sa = document.getElementById('sidebarAvatar'); if (sa) sa.innerHTML = '<span id="sidebarAvatarText">U</span>';
    setVal('themeColorPicker', '#e50914');
}

function updateAvatarUI(data = {}) {
    const un = data.name || getCache('name') || '';
    const ub = data.bio || getCache('bio') || '';
    const ug = data.favGenre || getCache('fav_genre') || '';
    const av = data.photo || getCache('avatar') || '';
    const bn = data.banner || getCache('banner') || '';
    const user = auth.currentUser;
    const letter = un ? un.charAt(0).toUpperCase() : (user ? user.email.charAt(0).toUpperCase() : 'U');

    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };

    if (un) { setText('profileNameDisplay', un); setVal('profileNameInput', un); setText('sidebarUserName', un); }
    else if (user) { const n = user.email.split('@')[0]; setText('sidebarUserName', n); setText('profileNameDisplay', n); }
    if (user) { setText('profileEmailDisplay', user.email); setText('sidebarUserEmail', user.email); }
    if (ub) { setText('profileBioDisplay', `"${ub}"`); setVal('profileBioInput', ub); }
    if (ug) setVal('profileFavGenreInput', ug);
    if (bn) {
        const bI = document.getElementById('profileBannerImg'); if (bI) bI.src = bn;
        const bP = document.getElementById('profileBannerPreview'); if (bP) { bP.src = bn; bP.classList.remove('hidden'); }
    }
    const sa = document.getElementById('sidebarAvatar'); if (sa) sa.innerHTML = '';
    if (av) {
        const aI = document.getElementById('avatarImg'); if (aI) { aI.src = av; aI.classList.remove('hidden'); } document.getElementById('avatarText')?.classList.add('hidden');
        const abI = document.getElementById('profileAvatarBigImg'); if (abI) { abI.src = av; abI.classList.remove('hidden'); } document.getElementById('profileAvatarBigText')?.classList.add('hidden');
        const pP = document.getElementById('profilePhotoPreview'); if (pP) { pP.src = av; pP.classList.remove('hidden'); }
        if (sa) { const img = document.createElement('img'); img.src = av; sa.appendChild(img); }
    } else {
        setText('avatarText', letter); setText('profileAvatarBigText', letter);
        if (sa) sa.innerHTML = `<span id="sidebarAvatarText">${letter}</span>`;
    }
}

document.getElementById('btnChangePasswordFromProfile')?.addEventListener('click', async () => {
    const user = auth.currentUser; if (!user) return;
    if (!confirm(`Enviar link de redefinição para ${user.email}?`)) return;
    try { await sendPasswordResetEmail(auth, user.email); showMsg(`Link enviado para ${user.email}! 📧`, 'success'); }
    catch (e) { showMsg('Erro: ' + e.message, 'error'); }
});

async function handleLogout() {
    try {
        stopBoostInterval();
        currentUserUid = null;
        await signOut(auth);
        resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        document.documentElement.style.setProperty('--primary-glow', 'rgba(229,9,20,0.35)');
        closeModal('profileModal'); closeSidebar();
        activeItem = null; mediaCatalog = []; isAdmin = false;
        renderApp();
        showMsg('Saiu da conta! 👋', 'success');
    } catch { showMsg('Erro ao sair', 'error'); }
}
document.getElementById('btnLogout')?.addEventListener('click', handleLogout);

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnTogglePassword')?.addEventListener('click', () => {
    const pw = document.getElementById('authPassword'); if (!pw) return;
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    document.getElementById('btnTogglePassword').textContent = show ? '🙈' : '👁️';
});

document.getElementById('btnForgotPassword')?.addEventListener('click', () => { closeModal('authOverlay'); openModal('forgotPasswordModal'); });
document.getElementById('btnBackToLogin')?.addEventListener('click', () => { closeModal('forgotPasswordModal'); openModal('authOverlay'); });
document.getElementById('btnCloseForgot')?.addEventListener('click', () => { closeModal('forgotPasswordModal'); openModal('authOverlay'); });
document.getElementById('btnForgotSuccessClose')?.addEventListener('click', () => { closeModal('forgotSuccessModal'); openModal('authOverlay'); });

document.getElementById('forgotPasswordForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail')?.value.trim().toLowerCase();
    if (!email) { showMsg('Digite seu e-mail!', 'error'); return; }
    const btn = document.getElementById('btnSendResetEmail'); const ot = btn?.textContent;
    if (btn) { btn.textContent = '⏳ Enviando...'; btn.disabled = true; }
    try {
        await sendPasswordResetEmail(auth, email);
        closeModal('forgotPasswordModal');
        const el = document.getElementById('forgotSuccessEmail'); if (el) el.textContent = email;
        openModal('forgotSuccessModal');
    } catch (err) { showMsg(translateAuthError(err.code), 'error'); }
    if (btn) { btn.textContent = ot; btn.disabled = false; }
});

const toggleAuth = document.getElementById('toggleAuthMode');
function updateAuthMode() {
    const modal = document.getElementById('authModalBody');
    if (isSignUpMode) modal?.classList.add('signup-mode'); else modal?.classList.remove('signup-mode');
    const sub = document.getElementById('authSubtitle'); if (sub) sub.textContent = isSignUpMode ? 'Crie sua conta gratuita' : 'Entre na sua conta para continuar';
    const btn = document.getElementById('btnAuthSubmit'); if (btn) btn.textContent = isSignUpMode ? 'Criar Conta' : 'Entrar na Conta';
    if (toggleAuth) toggleAuth.innerHTML = isSignUpMode ? 'Já tem conta? <span style="color:var(--primary-color)">Entrar</span>' : 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>';
    clearAuthFields();
}

function clearAuthFields() {
    ['authEmail', 'authPassword', 'authDisplayName'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const pw = document.getElementById('authPassword'); if (pw) pw.type = 'password';
    const btn = document.getElementById('btnTogglePassword'); if (btn) btn.textContent = '👁️';
}

if (toggleAuth) toggleAuth.addEventListener('click', () => { isSignUpMode = !isSignUpMode; updateAuthMode(); });

document.getElementById('authForm')?.addEventListener('submit', async e => {
    e.preventDefault(); if (authProcessing) return;
    authProcessing = true;
    const sb = document.getElementById('btnAuthSubmit'); const ot = sb?.textContent;
    if (sb) { sb.textContent = '⏳ Aguarde...'; sb.disabled = true; }
    const email = document.getElementById('authEmail')?.value.trim().toLowerCase();
    const pass = document.getElementById('authPassword')?.value;
    const displayName = document.getElementById('authDisplayName')?.value.trim() || '';

    if (!email || !pass || pass.length < 6) { showMsg('Preencha todos os campos! (senha mín. 6 caracteres)', 'error'); authProcessing = false; if (sb) { sb.textContent = ot; sb.disabled = false; } return; }
    if (isSignUpMode && !displayName) { showMsg('Digite um nome de exibição!', 'error'); authProcessing = false; if (sb) { sb.textContent = ot; sb.disabled = false; } return; }

    try {
        if (isSignUpMode) {
            if (auth.currentUser) await signOut(auth);
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(rtdb, "users/" + cred.user.uid), { name: displayName, bio: '', favGenre: 'Ação', photo: '', banner: '', themeColor: '#e50914', createdAt: Date.now() });
            showMsg('Conta criada com sucesso! ✅', 'success');
        } else {
            if (auth.currentUser) await signOut(auth);
            await signInWithEmailAndPassword(auth, email, pass);
            showMsg('Bem-vindo ao MasterFlix! 🎬', 'success');
        }
        closeModal('authOverlay'); clearAuthFields();
    } catch (err) { showMsg(translateAuthError(err.code), 'error'); }
    authProcessing = false; if (sb) { sb.textContent = ot; sb.disabled = false; }
});

// ═══════════════════════════════════════════════════════════════
// AUTH STATE
// ═══════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async user => {
    if (user) {
        currentUserUid = user.uid;
        resetProfileUI();
        closeModal('authOverlay');
        clearAuthFields();
        const emailEl = document.getElementById('profileEmailDisplay'); if (emailEl) emailEl.textContent = user.email;
        isAdmin = user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
        ['profileAdminBadge', 'sidebarAdminItem', 'sidebarCreatorItem', 'sidebarSuggestionsAdminItem', 'sidebarStorageItem']
            .forEach(id => document.getElementById(id)?.classList.toggle('hidden', !isAdmin));
        await loadUserProfile(user);
        loadCatalog();
    } else {
        stopBoostInterval();
        currentUserUid = null; isAdmin = false;
        resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        document.documentElement.style.setProperty('--primary-glow', 'rgba(229,9,20,0.35)');
        openModal('authOverlay'); clearAuthFields();
        ['sidebarAdminItem', 'sidebarCreatorItem', 'sidebarSuggestionsAdminItem', 'sidebarStorageItem', 'profileAdminBadge']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));
        isSignUpMode = false; updateAuthMode();
    }
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
clearLegacyCache();
renderGenreSelector();
renderMovieSources();
