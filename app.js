import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getDatabase,
    ref,
    get,
    set,
    push,
    remove,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

/* ═══════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════ */
const EXCLUSIVE_ADMIN_EMAIL = "raiyuri.freefire@gmail.com";
const AVAILABLE_GENRES = [
    "Lançamento",
    "Ação",
    "Aventura",
    "Comédia",
    "Drama",
    "Terror",
    "Suspense",
    "Romance",
    "Ficção Científica",
    "Fantasia",
    "Animação",
    "Documentário",
    "Crime",
    "Família",
    "Anime",
    "Dorama",
    "Musical",
    "Mistério",
    "Guerra",
    "Histórico",
    "Faroeste",
    "Super-Heróis"
];
const FIREBASE_RTDB_FREE_LIMIT_BYTES = 1073741824;
const CONTINUE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_ID_KEY = "mfx_device_id";
const DEVICE_HEARTBEAT_MS = 60000;
const PLAYER_HIDE_DELAY_MS = 8000;
const PLAYER_CURSOR_HIDE_MS = 6500;

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
setPersistence(auth, browserLocalPersistence).catch(() => {});

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
const el = id => document.getElementById(id);
const qs = (s, c = document) => c.querySelector(s);
const qsa = (s, c = document) => Array.from(c.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function normalizeText(t) {
    return t ? t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
}
function getPosterUrl(i) { return i.coverUrl || i.backdropUrl || ""; }
function getBackdropUrl(i) { return i.backdropUrl || i.coverUrl || ""; }
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
function isValidImageUrl(url) {
    if (!url) return false;
    return url.startsWith("http") || url.startsWith("data:image");
}
function formatBytes(b) {
    if (!b) return "0 B";
    const k = 1024, s = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${s[i]}`;
}
function estimateJsonBytes(obj) {
    try { return new Blob([JSON.stringify(obj)]).size; }
    catch { return JSON.stringify(obj).length * 2; }
}
function timeAgo(ts) {
    const d = Date.now() - ts;
    const min = Math.floor(d / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}
function translateAuthError(c) {
    return ({
        "auth/email-already-in-use": "E-mail já cadastrado!",
        "auth/invalid-email": "E-mail inválido.",
        "auth/weak-password": "Senha fraca (mín. 6).",
        "auth/user-not-found": "Conta não encontrada.",
        "auth/wrong-password": "Senha incorreta.",
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/too-many-requests": "Muitas tentativas. Tente mais tarde.",
        "auth/network-request-failed": "Sem internet."
    })[c] || `Erro: ${c}`;
}
function isTVDevice() {
    return /smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(navigator.userAgent.toLowerCase());
}
function isTV() {
    return isTVDevice() || (window.innerWidth >= 1920 && !("ontouchstart" in window));
}
(function setupTVMode() {
    if (isTV()) document.body.classList.add("tv-mode");
    window.addEventListener("resize", () => {
        document.body.classList.toggle("tv-mode", isTV());
    });
})();

function showMsg(text, type = "error") {
    const m = el("msg");
    if (!m) return;
    m.innerText = text;
    m.className = type === "success" ? "msg-success" : type === "info" ? "msg-info" : "msg-error";
    m.classList.remove("hidden");
    clearTimeout(m._timer);
    m._timer = setTimeout(() => m.classList.add("hidden"), 4000);
}

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
let mediaCatalog = [];
let selectedCategory = "Todos";
let isSignUpMode = false;
let selectedGenres = [];
let cropperInstance = null;
let currentCropTarget = null;
let previousModal = null;
let isAdmin = false;
let authProcessing = false;
let currentUserUid = null;
let allSuggestions = [];
let suggestionsSelectMode = false;
let selectedSuggestionIds = new Set();
let dailyViewsMap = {};
let currentPlayingItemId = null;
let currentPlayCountTracked = false;

// player
let currentVideoUrl = "";
let currentSources = [];
let currentSourceIndex = 0;
let currentPlayerMeta = { mainTitle: "", subTitle: "" };
let playerErrorTimer = null;
let isStretchMode = false;
let controlsHideTimer = null;
let cursorHideTimer = null;
let playerControlsLocked = false;
let playerPointerInsideOverlay = false;

// creator
let creatorData = {
    type: "movie",
    movieSources: [],
    seasons: []
};
let uiState = {
    openSeasons: new Set(),
    openEpisodes: new Set()
};

// audio
let audioCtx = null;
let audioGainNode = null;
let boostedElements = new WeakSet();
let audioBoostLevel = 100;
let overlayCleanerInterval = null;

// devices
let deviceHeartbeatInterval = null;

/* ═══════════════════════════════════════════════
   CACHE
═══════════════════════════════════════════════ */
function getUserCacheKey(k) {
    return currentUserUid ? `mfx_${currentUserUid}_${k}` : null;
}
function setUserCache(k, v) {
    const key = getUserCacheKey(k);
    if (key && v != null) localStorage.setItem(key, v);
}
function getUserCache(k) {
    const key = getUserCacheKey(k);
    return key ? localStorage.getItem(key) : null;
}
function clearLegacyCache() {
    [
        "masterflix_user_name",
        "masterflix_user_bio",
        "masterflix_user_fav_genre",
        "masterflix_user_avatar",
        "masterflix_user_banner"
    ].forEach(k => localStorage.removeItem(k));
}
function applyUserTheme(c) {
    if (!c || isTVDevice()) return;
    document.documentElement.style.setProperty("--primary-color", c);
    localStorage.setItem("masterflix_theme_color", c);
    if (currentUserUid) setUserCache("theme_color", c);
}
if (!isTVDevice()) {
    const savedColor = localStorage.getItem("masterflix_theme_color");
    if (savedColor) applyUserTheme(savedColor);
}

/* ═══════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════ */
const openModals = new Set();

function openModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.remove("hidden");
    openModals.add(id);
    document.body.classList.add("modal-open");
}
function closeModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.add("hidden");
    openModals.delete(id);
    if (openModals.size === 0 && !el("sidebarMenu")?.classList.contains("active")) {
        document.body.classList.remove("modal-open");
    }
}
document.addEventListener("click", e => {
    if (!e.target.classList.contains("modal-overlay")) return;
    const protectedIds = ["authOverlay", "playerModal", "cropperModal", "forgotPasswordModal", "forgotSuccessModal"];
    if (!protectedIds.includes(e.target.id)) closeModal(e.target.id);
});

/* ═══════════════════════════════════════════════
   DATE / DAILY VIEWS
═══════════════════════════════════════════════ */
function getTodayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
async function loadTodayViews() {
    try {
        const snap = await get(ref(rtdb, `stats/dailyViews/${getTodayKey()}`));
        dailyViewsMap = snap.exists() ? snap.val() : {};
    } catch {
        dailyViewsMap = {};
    }
    renderFeaturedShowcase();
}
function getTodayViewCount(itemId) {
    return Number(dailyViewsMap?.[itemId] || 0);
}
async function incrementTodayView(itemId) {
    if (!itemId || currentPlayCountTracked) return;
    currentPlayCountTracked = true;
    dailyViewsMap[itemId] = (dailyViewsMap[itemId] || 0) + 1;
    renderFeaturedShowcase();
    try {
        await runTransaction(ref(rtdb, `stats/dailyViews/${getTodayKey()}/${itemId}`), curr => (curr || 0) + 1);
    } catch {}
}

/* ═══════════════════════════════════════════════
   PROVIDERS
═══════════════════════════════════════════════ */
const PROVIDER_ADAPTERS = {
    mixdrop: {
        name: "MixDrop", color: "#00c6ff", icon: "🎬", errorLoadMs: 18000,
        formatUrl(url) {
            let f = url.trim();
            if (f.includes("/f/")) f = f.replace("/f/", "/e/");
            else if (!f.includes("/e/")) {
                const m = f.match(/mixdrop\.[a-z]+\/(?:e\/|f\/)?([a-zA-Z0-9]+)/);
                if (m?.[1]) f = `https://mixdrop.ag/e/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            i.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-popups-to-escape-sandbox");
            i.setAttribute("referrerpolicy", "no-referrer");
            return i;
        }
    },
    streamtape: {
        name: "StreamTape", color: "#f5a623", icon: "📼", errorLoadMs: 18000,
        formatUrl(url) {
            let f = url.trim();
            if (f.includes("/v/")) f = f.replace("/v/", "/e/");
            else if (!f.includes("/e/")) {
                const m = f.match(/streamtape\.[a-z]+\/(?:v|e)\/([a-zA-Z0-9]+)/);
                if (m?.[1]) f = `https://streamtape.com/e/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            i.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
            i.setAttribute("referrerpolicy", "no-referrer");
            return i;
        }
    },
    filemoon: {
        name: "FileMoon", color: "#8e44ad", icon: "🌙", errorLoadMs: 18000,
        formatUrl(url) {
            let f = url.trim();
            if (!f.includes("/e/") && !f.includes("/embed")) {
                const m = f.match(/filemoon\.[a-z]+\/(?:d\/|e\/)?([a-zA-Z0-9]+)/);
                if (m?.[1]) f = `https://filemoon.sx/e/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    voe: {
        name: "VOE", color: "#ff4757", icon: "⚡", errorLoadMs: 18000,
        formatUrl(url) { return url.trim(); },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    doodstream: {
        name: "DoodStream", color: "#f39c12", icon: "🔥", errorLoadMs: 22000,
        formatUrl(url) {
            let f = url.trim();
            if (f.includes("/d/")) f = f.replace("/d/", "/e/");
            else if (!f.includes("/e/")) {
                const m = f.match(/(?:dood[a-z0-9]*\.[a-z]+)\/(?:d\/|e\/)?([a-zA-Z0-9]+)/);
                if (m?.[1]) {
                    const dm = f.match(/(https?:\/\/[^\/]+)/);
                    f = `${dm?.[1] || "https://dood.li"}/e/${m[1]}`;
                }
            }
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    mp4upload: {
        name: "Mp4Upload", color: "#3498db", icon: "📤", errorLoadMs: 18000,
        formatUrl(url) {
            let f = url.trim();
            if (!f.includes("/embed")) {
                const m = f.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/);
                if (m?.[1]) f = `https://www.mp4upload.com/embed-${m[1]}.html`;
            }
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    okru: {
        name: "OK.ru", color: "#ee8208", icon: "📡", errorLoadMs: 18000,
        formatUrl(url) {
            let f = url.trim();
            const m = f.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/);
            if (m?.[1]) f = `https://ok.ru/videoembed/${m[1]}`;
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    drive: {
        name: "Google Drive", color: "#4285f4", icon: "💾", errorLoadMs: 16000,
        formatUrl(url) {
            let f = url.trim();
            const m = f.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (m?.[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
            if (f.includes("open?id=")) {
                const m2 = f.match(/id=([a-zA-Z0-9_-]+)/);
                if (m2?.[1]) return `https://drive.google.com/file/d/${m2[1]}/preview`;
            }
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    yourupload: {
        name: "YourUpload", color: "#27ae60", icon: "⬆️", errorLoadMs: 18000,
        formatUrl(url) {
            let f = url.trim();
            if (!f.includes("/embed/")) {
                const m = f.match(/yourupload\.com\/(?:watch|embed)\/([a-zA-Z0-9]+)/);
                if (m?.[1]) f = `https://www.yourupload.com/embed/${m[1]}`;
            }
            return f;
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    youtube: {
        name: "YouTube", color: "#ff0000", icon: "▶️", errorLoadMs: 12000,
        formatUrl(url) {
            const m = url.trim().match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            return m?.[1] ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : url.trim();
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    vimeo: {
        name: "Vimeo", color: "#17d5ff", icon: "🎥", errorLoadMs: 12000,
        formatUrl(url) {
            const m = url.trim().match(/vimeo\.com\/(?:video\/)?(\d+)/);
            return m?.[1] ? `https://player.vimeo.com/video/${m[1]}?autoplay=1` : url.trim();
        },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    },
    direct: {
        name: "Vídeo Direto", color: "#4caf50", icon: "📹", errorLoadMs: 12000,
        formatUrl(url) { return url.trim(); },
        createElement(url) {
            const v = document.createElement("video");
            v.src = url;
            v.controls = true;
            v.autoplay = true;
            v.playsInline = true;
            v.setAttribute("webkit-playsinline", "true");
            return v;
        }
    },
    other: {
        name: "Outro", color: "#888", icon: "🔗", errorLoadMs: 18000,
        formatUrl(url) { return url.trim(); },
        createElement(url) {
            const i = document.createElement("iframe");
            i.src = url;
            i.allowFullscreen = true;
            i.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
            i.setAttribute("scrolling", "no");
            i.setAttribute("frameborder", "0");
            return i;
        }
    }
};
function getAdapter(type) {
    return PROVIDER_ADAPTERS[type] || PROVIDER_ADAPTERS.other;
}
function detectSourceType(url) {
    if (!url) return "other";
    const u = url.toLowerCase();
    if (u.includes("mixdrop")) return "mixdrop";
    if (u.includes("streamtape")) return "streamtape";
    if (u.includes("filemoon")) return "filemoon";
    if (u.includes("voe.sx") || u.includes("voe.")) return "voe";
    if (u.includes("dood") || u.includes("d0000d") || u.includes("dooood")) return "doodstream";
    if (u.includes("mp4upload")) return "mp4upload";
    if (u.includes("ok.ru")) return "okru";
    if (u.includes("drive.google")) return "drive";
    if (u.includes("yourupload")) return "yourupload";
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
    if (u.includes("vimeo.com")) return "vimeo";
    if (/\.(mp4|m3u8|webm)(\?|$)/i.test(u)) return "direct";
    return "other";
}
function sourceTypeLabel(type) {
    return getAdapter(type).name;
}
function normalizeSources(item) {
    if (Array.isArray(item.videoSources) && item.videoSources.length) return item.videoSources;
    if (item.videoUrl?.trim()) {
        const t = detectSourceType(item.videoUrl);
        return [{ type: t, label: sourceTypeLabel(t), url: item.videoUrl.trim() }];
    }
    return [];
}
function normalizeEpisodeSources(ep) {
    if (Array.isArray(ep.videoSources) && ep.videoSources.length) return ep.videoSources;
    if (ep.videoUrl?.trim()) {
        const t = detectSourceType(ep.videoUrl);
        return [{ type: t, label: sourceTypeLabel(t), url: ep.videoUrl.trim() }];
    }
    return [];
}

/* ═══════════════════════════════════════════════
   SIDEBAR / HEADER
═══════════════════════════════════════════════ */
function openSidebar() {
    el("sidebarMenu")?.classList.add("active");
    el("sidebarOverlay")?.classList.add("active");
    el("menuToggleBtn")?.classList.add("active");
    document.body.classList.add("modal-open");
}
function closeSidebar() {
    el("sidebarMenu")?.classList.remove("active");
    el("sidebarOverlay")?.classList.remove("active");
    el("menuToggleBtn")?.classList.remove("active");
    if (openModals.size === 0) document.body.classList.remove("modal-open");
}
el("menuToggleBtn")?.addEventListener("click", () => {
    if (el("sidebarMenu")?.classList.contains("active")) closeSidebar();
    else openSidebar();
});
el("sidebarCloseBtn")?.addEventListener("click", closeSidebar);
el("sidebarOverlay")?.addEventListener("click", closeSidebar);

el("brandLogoBtn")?.addEventListener("click", () => {
    selectedCategory = "Todos";
    updateCategoryChips();
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", () => {
    el("mainHeader")?.classList.toggle("scrolled", window.scrollY > 50);
}, { passive: true });

qsa(".sidebar-item").forEach(item => {
    const act = () => {
        const a = item.dataset.nav;
        qsa(".sidebar-item").forEach(i => i.classList.remove("active"));
        if (["home", "movies", "series", "continue"].includes(a)) item.classList.add("active");
        closeSidebar();

        if (a === "home") {
            selectedCategory = "Todos";
            updateCategoryChips();
            renderApp();
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (a === "movies") {
            selectedCategory = "Filmes";
            updateCategoryChips();
            renderApp();
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (a === "series") {
            selectedCategory = "Séries";
            updateCategoryChips();
            renderApp();
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (a === "continue") {
            const row = el("continueRow");
            if (row && !row.classList.contains("hidden")) row.scrollIntoView({ behavior: "smooth" });
            else showMsg("Nada em andamento!", "info");
        } else if (a === "suggestions") {
            openModal("suggestionModal");
        } else if (a === "profile") {
            openProfileModal();
        } else if (a === "admin") {
            renderAdminCatalogList();
            openModal("adminModal");
        } else if (a === "creator") {
            openCreator();
        } else if (a === "suggestionsAdmin") {
            loadSuggestionsAdmin();
            openModal("suggestionsAdminModal");
        } else if (a === "storage") {
            loadStorageInfo();
            openModal("storageModal");
        } else if (a === "logout") {
            if (confirm("Sair da conta?")) handleLogout();
        }
    };
    item.addEventListener("click", act);
    item.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            act();
        }
    });
});

function updateCategoryChips() {
    qsa(".category-chip").forEach(c => c.classList.toggle("active", c.dataset.cat === selectedCategory));
}
qsa(".category-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        selectedCategory = chip.dataset.cat;
        updateCategoryChips();
        renderApp();
    });
});

/* ═══════════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════════ */
const searchBox = el("searchBox");
const searchInput = el("searchInput");
const searchDropdown = el("searchResultsDropdown");

el("searchIconBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    if (searchBox?.classList.contains("active")) {
        if (!searchInput?.value.trim()) searchBox.classList.remove("active");
    } else {
        searchBox?.classList.add("active");
        setTimeout(() => searchInput?.focus(), 220);
    }
});
searchInput?.addEventListener("input", () => {
    const v = searchInput.value.trim();
    if (v) {
        searchBox?.classList.add("has-text");
        renderSearchDropdown(v);
    } else {
        searchBox?.classList.remove("has-text");
        searchDropdown?.classList.remove("visible");
    }
});
el("searchClearBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    if (searchInput) searchInput.value = "";
    searchBox?.classList.remove("has-text");
    searchDropdown?.classList.remove("visible");
    searchInput?.focus();
});
document.addEventListener("click", e => {
    const wrapper = el("searchWrapper");
    if (wrapper && !wrapper.contains(e.target)) {
        searchDropdown?.classList.remove("visible");
        if (!searchInput?.value.trim()) searchBox?.classList.remove("active");
    }
});

function smartSearch(q) {
    const nq = normalizeText(q);
    if (!nq) return [];
    const scored = [];
    mediaCatalog.forEach(i => {
        const t = normalizeText(i.title);
        if (!t) return;
        let s = 0;
        if (t === nq) s = 10000;
        else if (t.startsWith(nq)) s = 1000 - t.length;
        else if (t.includes(nq)) s = 100 - t.length;
        else {
            const words = nq.split(" ").filter(Boolean);
            const hits = words.filter(w => t.includes(w)).length;
            if (hits) s = hits * 20;
        }
        if (s > 0) scored.push({ item: i, score: s });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map(x => x.item);
}
function highlightMatch(t, q) {
    const nt = normalizeText(t), nq = normalizeText(q), i = nt.indexOf(nq);
    if (i === -1) return t;
    return t.substring(0, i) + "<mark>" + t.substring(i, i + q.length) + "</mark>" + t.substring(i + q.length);
}
function renderSearchDropdown(query) {
    if (!searchDropdown) return;
    const results = smartSearch(query);
    searchDropdown.innerHTML = "";
    if (!results.length) {
        searchDropdown.innerHTML = `<div class="search-no-results"><span class="search-empty-icon">🔍</span><div>Nenhum resultado</div></div>`;
    } else {
        searchDropdown.innerHTML = `<div class="search-results-header">🔍 ${results.length} resultado(s)</div>`;
        results.forEach(item => {
            const d = document.createElement("div");
            d.className = "search-result-item";
            d.tabIndex = 0;
            const p = getPosterUrl(item);
            const tl = item.type === "movie" ? "Filme" : "Série";
            const gs = getItemGenres(item);
            d.innerHTML = `
                <img class="search-result-thumb" src="${p}" loading="lazy" onerror="this.style.display='none'">
                <div class="search-result-info">
                    <div class="search-result-title">${highlightMatch(item.title, query)}</div>
                    <div class="search-result-meta">
                        <span class="type-badge">${tl}</span>
                        ${item.year ? `<span>${item.year}</span>` : ""}
                        ${gs.length ? `<span>${gs.slice(0, 2).join(", ")}</span>` : ""}
                    </div>
                </div>
            `;
            const openItem = () => {
                searchDropdown.classList.remove("visible");
                if (searchInput) searchInput.value = "";
                searchBox?.classList.remove("has-text");
                window.location.hash = `#/midia/${item.id}`;
                openDetails(item);
            };
            d.addEventListener("click", openItem);
            d.addEventListener("keydown", e => { if (e.key === "Enter") openItem(); });
            searchDropdown.appendChild(d);
        });
    }
    searchDropdown.classList.add("visible");
}

/* ═══════════════════════════════════════════════
   FEATURED SHOWCASE
═══════════════════════════════════════════════ */
function sortByDailyViews(items) {
    return [...items].sort((a, b) => {
        const av = getTodayViewCount(a.id);
        const bv = getTodayViewCount(b.id);
        const ay = parseInt(a.year || "0", 10) || 0;
        const by = parseInt(b.year || "0", 10) || 0;
        return bv - av || by - ay || a.title.localeCompare(b.title);
    });
}
function getFeaturedItems() {
    if (!mediaCatalog.length) return [];

    if (selectedCategory === "Todos") {
        const movies = sortByDailyViews(mediaCatalog.filter(i => i.type === "movie")).slice(0, 2);
        const series = sortByDailyViews(mediaCatalog.filter(i => i.type === "serie")).slice(0, 2);
        return [...series, ...movies].sort((a, b) => getTodayViewCount(b.id) - getTodayViewCount(a.id));
    }

    if (selectedCategory === "Filmes") {
        return sortByDailyViews(mediaCatalog.filter(i => i.type === "movie")).slice(0, 4);
    }

    if (selectedCategory === "Séries") {
        return sortByDailyViews(mediaCatalog.filter(i => i.type === "serie")).slice(0, 4);
    }

    return sortByDailyViews(mediaCatalog.filter(i => itemMatchesCategory(i, selectedCategory))).slice(0, 4);
}
function renderFeaturedShowcase() {
    const grid = el("featuredGrid");
    const heading = el("featuredHeading");
    const sub = el("featuredSub");
    if (!grid || !heading || !sub) return;

    if (selectedCategory === "Todos") {
        heading.innerText = "Top 4 de hoje";
        sub.innerText = "As 2 séries mais assistidas do dia e os 2 filmes mais assistidos do dia.";
    } else if (selectedCategory === "Filmes") {
        heading.innerText = "Filmes em alta hoje";
        sub.innerText = "Os filmes mais assistidos do dia por quem está usando o MasterFlix.";
    } else if (selectedCategory === "Séries") {
        heading.innerText = "Séries em alta hoje";
        sub.innerText = "As séries mais assistidas do dia por quem está usando o MasterFlix.";
    } else {
        heading.innerText = `${selectedCategory} em alta`;
        sub.innerText = `Os títulos mais assistidos de hoje em ${selectedCategory}.`;
    }

    const items = getFeaturedItems();
    grid.innerHTML = "";

    if (!items.length) {
        grid.innerHTML = `<div class="featured-empty">Nenhum destaque disponível ainda.</div>`;
        return;
    }

    const tmpl = el("featuredCardTemplate");
    items.forEach((item, idx) => {
        const node = tmpl.content.cloneNode(true);
        const card = node.querySelector(".featured-card");
        const bg = node.querySelector(".featured-card-bg");
        const rank = node.querySelector(".featured-rank");
        const badge = node.querySelector(".featured-card-badge");
        const watch = node.querySelector(".featured-card-watch");
        const title = node.querySelector(".featured-card-title");
        const meta = node.querySelector(".featured-card-meta");
        const desc = node.querySelector(".featured-card-desc");
        const btnPlay = node.querySelector(".featured-mini-btn.play");
        const btnInfo = node.querySelector(".featured-mini-btn.info");

        const bd = getBackdropUrl(item) || getPosterUrl(item);
        if (bd) bg.style.backgroundImage = `url('${bd}')`;
        rank.innerText = `#${idx + 1}`;
        badge.innerText = item.type === "movie" ? "🎬 Filme em alta" : "📺 Série em alta";
        watch.innerText = `👁️ ${getTodayViewCount(item.id)} views hoje`;
        title.innerText = item.title;
        meta.innerHTML = `
            <span>${item.type === "movie" ? "Filme" : "Série"}</span>
            ${item.year ? `<span class="dot">•</span><span>${item.year}</span>` : ""}
            ${item.duration ? `<span class="dot">•</span><span>${item.duration}</span>` : ""}
            ${getItemGenres(item).length ? `<span class="dot">•</span><span>${getItemGenres(item).slice(0, 2).join(", ")}</span>` : ""}
        `;
        desc.innerText = item.description || "Sem descrição disponível.";

        const openDetailsItem = () => {
            window.location.hash = `#/midia/${item.id}`;
            openDetails(item);
        };

        card.addEventListener("click", openDetailsItem);
        card.addEventListener("keydown", e => { if (e.key === "Enter") openDetailsItem(); });

        btnPlay.addEventListener("click", e => {
            e.stopPropagation();
            if (item.type === "movie") {
                saveContinueWatching(item, item.duration || "");
                initiatePlay(normalizeSources(item), item.title, "Filme", item.id);
            } else {
                openDetails(item);
            }
        });
        btnInfo.addEventListener("click", e => {
            e.stopPropagation();
            openDetails(item);
        });

        grid.appendChild(node);
    });
}

/* ═══════════════════════════════════════════════
   GENRES
═══════════════════════════════════════════════ */
function renderGenreSelector() {
    const c = el("genreSelectorContainer");
    if (!c) return;
    c.innerHTML = "";
    AVAILABLE_GENRES.forEach(g => {
        const t = document.createElement("div");
        t.className = "genre-tag";
        if (selectedGenres.includes(g)) t.classList.add("selected");
        t.textContent = g;
        t.onclick = () => {
            const i = selectedGenres.indexOf(g);
            if (i >= 0) selectedGenres.splice(i, 1);
            else selectedGenres.push(g);
            renderGenreSelector();
        };
        c.appendChild(t);
    });
    const ct = el("genreCounter");
    if (ct) {
        ct.textContent = selectedGenres.length === 0 ? "⚠️ Selecione ao menos 1" : `✓ ${selectedGenres.length}: ${selectedGenres.join(", ")}`;
        ct.style.color = selectedGenres.length === 0 ? "#ff9800" : "var(--primary-color)";
    }
}

/* ═══════════════════════════════════════════════
   CREATOR TABS
═══════════════════════════════════════════════ */
qsa(".creator-tab").forEach(tab => {
    tab.onclick = () => {
        syncCreatorInputsToState();
        qsa(".creator-tab").forEach(t => t.classList.remove("active"));
        qsa(".creator-tab-content").forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        qs(`[data-tab-content="${tab.dataset.tab}"]`)?.classList.add("active");
    };
});

/* ═══════════════════════════════════════════════
   CREATOR SOURCES
═══════════════════════════════════════════════ */
function renderMovieSources() {
    const container = el("movieSourcesList");
    if (!container) return;
    container.innerHTML = "";

    if (!creatorData.movieSources.length) {
        container.innerHTML = `<div class="source-empty-state">Nenhuma fonte. Clique em <strong>+ Adicionar Fonte</strong>.</div>`;
        return;
    }

    const tmpl = el("videoSourceItemTemplate");
    creatorData.movieSources.forEach((src, idx) => {
        const clone = tmpl.content.cloneNode(true);
        const card = clone.querySelector(".source-item-card");
        const typeSelect = card.querySelector(".source-type-select");
        const titleInput = card.querySelector(".source-title-input");
        const urlInput = card.querySelector(".source-url-input");

        card.querySelector(".source-item-badge").textContent = `Fonte ${idx + 1}`;
        typeSelect.value = src.type || "";
        titleInput.value = src.label || "";
        urlInput.value = src.url || "";

        const usedTypes = creatorData.movieSources.filter((_, i) => i !== idx).map(s => s.type).filter(Boolean);
        Array.from(typeSelect.options).forEach(opt => {
            if (opt.value && opt.value !== "other" && opt.value !== src.type && usedTypes.includes(opt.value)) {
                opt.disabled = true;
            }
        });

        typeSelect.onchange = () => {
            const nt = typeSelect.value;
            if (nt && nt !== "other" && creatorData.movieSources.some((s, i) => i !== idx && s.type === nt)) {
                showMsg(`Já existe "${sourceTypeLabel(nt)}"!`, "error");
                typeSelect.value = src.type || "";
                return;
            }
            creatorData.movieSources[idx].type = nt;
            if (!creatorData.movieSources[idx].label && nt) creatorData.movieSources[idx].label = sourceTypeLabel(nt);
            renderMovieSources();
        };
        titleInput.oninput = () => creatorData.movieSources[idx].label = titleInput.value;
        urlInput.oninput = () => {
            creatorData.movieSources[idx].url = urlInput.value;
            if (!creatorData.movieSources[idx].type && urlInput.value) {
                const d = detectSourceType(urlInput.value);
                if (d !== "other" && !creatorData.movieSources.some((s, i) => i !== idx && s.type === d)) {
                    creatorData.movieSources[idx].type = d;
                    if (!creatorData.movieSources[idx].label) creatorData.movieSources[idx].label = sourceTypeLabel(d);
                    renderMovieSources();
                }
            }
        };

        card.querySelector("[data-action='remove-source']").onclick = () => {
            creatorData.movieSources.splice(idx, 1);
            renderMovieSources();
        };

        if (src.type) {
            const ad = getAdapter(src.type);
            const tag = document.createElement("div");
            tag.className = "source-preview-tag";
            tag.textContent = `${ad.icon} ${ad.name}`;
            card.appendChild(tag);
        }

        container.appendChild(card);
    });
}
el("btnAddMovieSource")?.addEventListener("click", () => {
    creatorData.movieSources.push({ id: uid(), type: "", label: "", url: "" });
    renderMovieSources();
});

/* ═══════════════════════════════════════════════
   CREATOR SEASONS / EPISODES
═══════════════════════════════════════════════ */
function syncCreatorInputsToState() {
    if (creatorData.type !== "serie") return;
    creatorData.seasons.forEach(s => {
        (s.episodes || []).forEach(ep => {
            const titleEl = qs(`[data-ep-title="${ep.id}"]`);
            const durEl = qs(`[data-ep-duration="${ep.id}"]`);
            if (titleEl) ep.title = titleEl.value;
            if (durEl) ep.duration = durEl.value;
        });
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
    const container = qs(`[data-ep-sources="${ep.id}"]`);
    if (!container) return;
    container.innerHTML = "";
    const sources = ep.sources || [];

    if (!sources.length) {
        container.innerHTML = `<div class="source-empty-state" style="font-size:11px">Sem fontes. Clique em + Adicionar Fonte.</div>`;
        return;
    }

    const tmpl = el("videoSourceItemTemplate");
    sources.forEach((src, sidx) => {
        const clone = tmpl.content.cloneNode(true);
        const card = clone.querySelector(".source-item-card");
        const ts = card.querySelector(".source-type-select");
        const ti = card.querySelector(".source-title-input");
        const ui = card.querySelector(".source-url-input");

        card.querySelector(".source-item-badge").textContent = `Fonte ${sidx + 1}`;
        ts.value = src.type || "";
        ti.value = src.label || "";
        ui.value = src.url || "";

        const usedTypes = sources.filter((_, i) => i !== sidx).map(s => s.type).filter(Boolean);
        Array.from(ts.options).forEach(opt => {
            if (opt.value && opt.value !== "other" && opt.value !== src.type && usedTypes.includes(opt.value)) {
                opt.disabled = true;
            }
        });

        ts.onchange = () => {
            const nt = ts.value;
            if (nt && nt !== "other" && sources.some((s, i) => i !== sidx && s.type === nt)) {
                showMsg("Tipo duplicado neste episódio!", "error");
                ts.value = src.type || "";
                return;
            }
            src.type = nt;
            if (!src.label && nt) src.label = sourceTypeLabel(nt);
            renderEpisodeSources(ep);
        };
        ti.oninput = () => src.label = ti.value;
        ui.oninput = () => {
            src.url = ui.value;
            if (!src.type && ui.value) {
                const d = detectSourceType(ui.value);
                if (d !== "other" && !sources.some((s, i) => i !== sidx && s.type === d)) {
                    src.type = d;
                    if (!src.label) src.label = sourceTypeLabel(d);
                    renderEpisodeSources(ep);
                }
            }
        };
        card.querySelector("[data-action='remove-source']").onclick = () => {
            sources.splice(sidx, 1);
            renderEpisodeSources(ep);
        };

        container.appendChild(card);
    });
}
function renderEpisodesList(season) {
    const container = qs(`[data-ep-list="${season.id}"]`);
    if (!container) return;
    container.innerHTML = "";
    const episodes = season.episodes || [];

    if (!episodes.length) {
        container.innerHTML = `<div class="empty-list-state" style="padding:14px;font-size:11px"><span class="empty-icon" style="font-size:24px">🎬</span>Nenhum episódio</div>`;
        return;
    }

    episodes.forEach((ep, ei) => {
        const isOpen = uiState.openEpisodes.has(ep.id);
        const hasSource = ep.sources?.some(s => s.url?.trim());
        const sourceCount = ep.sources?.filter(s => s.url?.trim()).length || 0;

        const acc = document.createElement("div");
        acc.className = "episode-accordion" + (isOpen ? " open" : "");
        acc.innerHTML = `
            <div class="episode-accordion-header" data-toggle-episode="${ep.id}">
                <div class="episode-accordion-header-left">
                    <span class="ep-number-badge">${ei + 1}</span>
                    <div class="ep-info-mini">
                        <div class="ep-info-mini-title">${ep.title || `Episódio ${ei + 1}`}</div>
                        <div class="ep-info-mini-sub">
                            ${ep.duration ? `⏱️ ${ep.duration}` : ""}
                            ${hasSource ? `<span class="ok-badge">✓ ${sourceCount} fonte(s)</span>` : `<span class="warn-badge">⚠ sem fonte</span>`}
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
                    <input type="text" data-ep-title="${ep.id}" value="${(ep.title || "").replace(/"/g, "&quot;")}" autocomplete="off">
                </div>
                <div class="input-group">
                    <label>Duração</label>
                    <input type="text" data-ep-duration="${ep.id}" value="${(ep.duration || "").replace(/"/g, "&quot;")}" placeholder="Ex: 45m" autocomplete="off">
                </div>
                <div class="input-group">
                    <label>🖼️ Thumbnail (opcional)</label>
                    <label class="file-upload-box" id="epThumbBox_${ep.id}">
                        <span class="file-upload-label">📸 Escolher</span>
                        <input type="file" id="eti_${ep.id}" accept="image/*" class="hidden">
                        <img id="etp_${ep.id}" src="${ep.thumbUrl || ""}" class="file-preview-img ${ep.thumbUrl ? "" : "hidden"}">
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

        qs(`[data-toggle-episode="${ep.id}"]`, acc).onclick = e => {
            if (e.target.closest("button")) return;
            syncCreatorInputsToState();
            if (uiState.openEpisodes.has(ep.id)) uiState.openEpisodes.delete(ep.id);
            else uiState.openEpisodes.add(ep.id);
            renderSeasonsList();
        };
        qs(`[data-remove-episode="${season.id}|${ep.id}"]`, acc).onclick = e => {
            e.stopPropagation();
            if (!confirm("Remover este episódio?")) return;
            const idx = season.episodes.findIndex(x => x.id === ep.id);
            if (idx >= 0) {
                season.episodes.splice(idx, 1);
                uiState.openEpisodes.delete(ep.id);
                renderSeasonsList();
            }
        };
        qs(`[data-add-source="${ep.id}"]`, acc).onclick = () => {
            ep.sources = ep.sources || [];
            ep.sources.push({ id: uid(), type: "", label: "", url: "" });
            renderSeasonsList();
        };
        qs(`[data-ep-title="${ep.id}"]`, acc).oninput = e => ep.title = e.target.value;
        qs(`[data-ep-duration="${ep.id}"]`, acc).oninput = e => ep.duration = e.target.value;

        el(`epThumbBox_${ep.id}`)?.addEventListener("click", ev => {
            if (ev.target.closest("input")) return;
            ev.preventDefault();
            openCropperForFile(`eti_${ep.id}`, `etp_${ep.id}`, 16 / 9, url => {
                ep.thumbUrl = url;
            });
        });
    });
}
function renderSeasonsList() {
    const c = el("seasonsList");
    if (!c) return;
    c.innerHTML = "";

    if (!creatorData.seasons.length) {
        c.innerHTML = `<div class="empty-list-state"><span class="empty-icon">📺</span>Nenhuma temporada. Adicione a primeira!</div>`;
        return;
    }

    creatorData.seasons.forEach((season, si) => {
        const isOpen = uiState.openSeasons.has(season.id);
        const epCount = (season.episodes || []).length;
        const hasContent = (season.episodes || []).some(ep => ep.sources?.some(s => s.url?.trim()));

        const acc = document.createElement("div");
        acc.className = "season-accordion" + (isOpen ? " open" : "");
        acc.innerHTML = `
            <div class="season-header" data-toggle-season="${season.id}">
                <div class="season-header-left">
                    <div class="season-toggle-icon">▶</div>
                    <div>
                        <div class="season-title">Temporada ${si + 1}</div>
                        <div class="season-subtitle">${epCount} episódio(s) ${hasContent ? '• <span style="color:#4caf50">✓ com fontes</span>' : ""}</div>
                    </div>
                </div>
                <div class="season-header-actions">
                    <button type="button" class="season-mini-btn danger" data-remove-season="${season.id}" title="Remover temporada">🗑️</button>
                </div>
            </div>
            <div class="season-body">
                <div class="input-group">
                    <label>🖼️ Foto da Temporada (opcional)</label>
                    <label class="file-upload-box" id="seasonCoverBox_${season.id}">
                        <span class="file-upload-label">📁 Escolher imagem</span>
                        <input type="file" id="sci_${season.id}" accept="image/*" class="hidden">
                        <img id="scp_${season.id}" src="${season.seasonCoverUrl || ""}" class="file-preview-img ${season.seasonCoverUrl ? "" : "hidden"}">
                    </label>
                </div>
                <label style="font-size:11px;font-weight:800;color:var(--primary-color);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:block">🎬 Episódios</label>
                <div data-ep-list="${season.id}"></div>
                <button type="button" class="add-btn-block" data-add-episode="${season.id}" style="margin-top:10px">+ Novo Episódio</button>
            </div>
        `;
        c.appendChild(acc);
        renderEpisodesList(season);

        qs(`[data-toggle-season="${season.id}"]`, acc).onclick = e => {
            if (e.target.closest("button")) return;
            syncCreatorInputsToState();
            if (uiState.openSeasons.has(season.id)) uiState.openSeasons.delete(season.id);
            else uiState.openSeasons.add(season.id);
            renderSeasonsList();
        };
        qs(`[data-remove-season="${season.id}"]`, acc).onclick = e => {
            e.stopPropagation();
            if (!confirm("Remover esta temporada e todos os episódios?")) return;
            const idx = creatorData.seasons.findIndex(s => s.id === season.id);
            if (idx >= 0) {
                creatorData.seasons.splice(idx, 1);
                uiState.openSeasons.delete(season.id);
                renderSeasonsList();
            }
        };
        qs(`[data-add-episode="${season.id}"]`, acc).onclick = () => {
            const newEp = { id: uid(), title: `Episódio ${(season.episodes?.length || 0) + 1}`, duration: "45m", thumbUrl: "", sources: [] };
            season.episodes = season.episodes || [];
            season.episodes.push(newEp);
            uiState.openEpisodes.add(newEp.id);
            renderSeasonsList();
        };

        el(`seasonCoverBox_${season.id}`)?.addEventListener("click", ev => {
            if (ev.target.closest("input")) return;
            ev.preventDefault();
            openCropperForFile(`sci_${season.id}`, `scp_${season.id}`, 16 / 9, url => {
                season.seasonCoverUrl = url;
            });
        });
    });
}
el("btnAddSeasonBtn")?.addEventListener("click", () => {
    const newSeason = { id: uid(), seasonNumber: creatorData.seasons.length + 1, seasonCoverUrl: "", episodes: [] };
    const firstEp = { id: uid(), title: "Episódio 1", duration: "45m", thumbUrl: "", sources: [] };
    newSeason.episodes.push(firstEp);
    creatorData.seasons.push(newSeason);
    uiState.openSeasons.add(newSeason.id);
    uiState.openEpisodes.add(firstEp.id);
    renderSeasonsList();
});
el("mediaType")?.addEventListener("change", e => {
    creatorData.type = e.target.value;
    el("movieFileArea")?.classList.toggle("hidden", creatorData.type !== "movie");
    el("seriesBuilderArea")?.classList.toggle("hidden", creatorData.type === "movie");
    const lbl = el("mediaDurationLabel");
    if (lbl) lbl.innerText = creatorData.type === "movie" ? "Duração" : "Duração Média";
    if (creatorData.type === "serie" && !creatorData.seasons.length) {
        const season = { id: uid(), seasonNumber: 1, seasonCoverUrl: "", episodes: [] };
        const ep = { id: uid(), title: "Episódio 1", duration: "45m", thumbUrl: "", sources: [] };
        season.episodes.push(ep);
        creatorData.seasons.push(season);
        uiState.openSeasons.add(season.id);
        uiState.openEpisodes.add(ep.id);
        renderSeasonsList();
    }
});

/* ═══════════════════════════════════════════════
   CROPPER
═══════════════════════════════════════════════ */
function openCropperForFile(inputId, previewId, ar, onDone) {
    const fileInput = el(inputId);
    const preview = el(previewId);
    if (!fileInput) return;

    previousModal = !el("creatorModal")?.classList.contains("hidden")
        ? "creatorModal"
        : !el("profileModal")?.classList.contains("hidden")
            ? "profileModal"
            : null;

    currentCropTarget = { preview, onDone };
    fileInput.value = "";

    fileInput.onchange = e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const tmp = new Image();
            tmp.onload = () => {
                const cropImg = el("cropperImage");
                if (cropImg) cropImg.src = ev.target.result;

                if (previousModal) closeModal(previousModal);
                openModal("cropperModal");

                cropperInstance?.destroy();
                cropperInstance = new Cropper(cropImg, {
                    aspectRatio: ar || NaN,
                    viewMode: 1,
                    autoCropArea: 1,
                    responsive: true,
                    crop() {
                        const cv = cropperInstance.getCroppedCanvas({ width: 800 });
                        if (!cv) return;
                        const u = cv.toDataURL("image/jpeg", 0.9);
                        ["prevMobile", "prevPC", "prevTV"].forEach(id => {
                            const im = el(id);
                            if (im) im.src = u;
                        });
                    }
                });
            };
            tmp.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };

    fileInput.click();
}
el("btnConfirmCrop")?.addEventListener("click", () => {
    if (!cropperInstance || !currentCropTarget) return;
    const cv = cropperInstance.getCroppedCanvas({ width: 1200 });
    if (cv && currentCropTarget.preview) {
        const dataUrl = cv.toDataURL("image/jpeg", 0.92);
        currentCropTarget.preview.src = dataUrl;
        currentCropTarget.preview.classList.remove("hidden");
        currentCropTarget.onDone?.(dataUrl);
    }
    cropperInstance?.destroy();
    cropperInstance = null;
    closeModal("cropperModal");
    if (previousModal) openModal(previousModal);
});
el("btnCloseCropper")?.addEventListener("click", () => {
    cropperInstance?.destroy();
    cropperInstance = null;
    closeModal("cropperModal");
    if (previousModal) openModal(previousModal);
});

el("profilePhotoFile")?.closest(".file-upload-box")?.addEventListener("click", e => {
    if (e.target.closest("input")) return;
    e.preventDefault();
    openCropperForFile("profilePhotoFile", "profilePhotoPreview", 1, () => {});
});
el("profileBannerFile")?.closest(".file-upload-box")?.addEventListener("click", e => {
    if (e.target.closest("input")) return;
    e.preventDefault();
    openCropperForFile("profileBannerFile", "profileBannerPreview", 16 / 9, url => {
        const bg = el("profileBannerImg");
        if (bg) bg.src = url;
    });
});
el("mediaCoverFile")?.closest(".file-upload-box")?.addEventListener("click", e => {
    if (e.target.closest("input")) return;
    e.preventDefault();
    openCropperForFile("mediaCoverFile", "mediaCoverPreview", 0.6666, () => {});
});
el("mediaBackdropFile")?.closest(".file-upload-box")?.addEventListener("click", e => {
    if (e.target.closest("input")) return;
    e.preventDefault();
    openCropperForFile("mediaBackdropFile", "mediaBackdropPreview", 1.7777, () => {});
});

/* ═══════════════════════════════════════════════
   CATALOG / CONTINUE
═══════════════════════════════════════════════ */
async function loadCatalog() {
    try {
        const snap = await get(ref(rtdb, "catalog"));
        mediaCatalog = [];
        if (snap.exists()) {
            const d = snap.val();
            for (const k in d) {
                const i = { id: k, ...d[k] };
                if (!Array.isArray(i.genres)) i.genres = i.category ? [i.category] : [];
                mediaCatalog.push(i);
            }
        }
        renderApp();
        renderAdminCatalogList();
        handleHashRouting();
    } catch (e) {
        showMsg("Erro ao carregar catálogo: " + e.message, "error");
    }
}
function getContinueList() {
    if (!currentUserUid) return [];
    try {
        return JSON.parse(localStorage.getItem(`mfx_${currentUserUid}_continue`) || "[]");
    } catch {
        return [];
    }
}
function saveContinueList(list) {
    if (currentUserUid) localStorage.setItem(`mfx_${currentUserUid}_continue`, JSON.stringify(list));
}
function cleanExpiredContinue() {
    let list = getContinueList();
    const now = Date.now();
    list = list.filter(i => (now - (i.lastWatched || 0)) < CONTINUE_EXPIRE_MS);
    saveContinueList(list);
    return list;
}
function saveContinueWatching(item, extra = "", episodeInfo = null) {
    if (!currentUserUid) return;
    let list = getContinueList().filter(i => i.id !== item.id);
    list.unshift({
        id: item.id,
        title: item.title,
        type: item.type,
        coverUrl: getBackdropUrl(item) || getPosterUrl(item),
        duration: item.duration || extra,
        lastWatched: Date.now(),
        episodeInfo
    });
    if (list.length > 30) list.pop();
    saveContinueList(list);
    renderContinueWatching();
}
function removeContinueItem(id) {
    saveContinueList(getContinueList().filter(i => i.id !== id));
    renderContinueWatching();
}
function getContinueInfo(id) {
    return getContinueList().find(i => i.id === id) || null;
}
function renderContinueWatching() {
    const row = el("continueRow");
    const car = el("continueCarousel");
    if (!row || !car) return;
    car.innerHTML = "";

    if (!currentUserUid) {
        row.classList.add("hidden");
        return;
    }

    let list = cleanExpiredContinue();

    if (selectedCategory === "Filmes") list = list.filter(i => i.type === "movie");
    else if (selectedCategory === "Séries") list = list.filter(i => i.type === "serie");
    else if (selectedCategory !== "Todos") {
        list = list.filter(i => {
            const original = mediaCatalog.find(m => m.id === i.id);
            return original && getItemGenres(original).includes(selectedCategory);
        });
    }

    if (!list.length) {
        row.classList.add("hidden");
        return;
    }

    row.classList.remove("hidden");

    list.forEach(item => {
        const card = document.createElement("div");
        card.className = "continue-card";
        card.tabIndex = 0;
        card.innerHTML = `
            <img src="${item.coverUrl || ""}" loading="lazy">
            <button class="continue-remove-btn" aria-label="Remover">✕</button>
            <div class="continue-play-icon">▶</div>
            <div class="continue-info">
                <div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</div>
                ${item.episodeInfo ? `<div class="continue-ep-badge">▶ ${item.episodeInfo}</div>` : ""}
                <div class="continue-duration">${item.lastWatched ? "🕐 " + timeAgo(item.lastWatched) : ""}</div>
            </div>
        `;
        card.querySelector(".continue-remove-btn").onclick = e => {
            e.stopPropagation();
            removeContinueItem(item.id);
        };
        card.onclick = () => {
            const original = mediaCatalog.find(m => m.id === item.id);
            if (original) openDetails(original);
        };
        card.onkeydown = e => { if (e.key === "Enter") card.click(); };
        car.appendChild(card);
    });
}
function renderApp() {
    const mc = el("moviesCarousel");
    const sc = el("seriesCarousel");
    const mr = el("moviesRow");
    const sr = el("seriesRow");
    if (!mc || !sc || !mr || !sr) return;

    mc.innerHTML = "";
    sc.innerHTML = "";

    mr.classList.toggle("hidden", selectedCategory === "Séries");
    sr.classList.toggle("hidden", selectedCategory === "Filmes");

    mediaCatalog.forEach(item => {
        if (!itemMatchesCategory(item, selectedCategory)) return;
        const card = document.createElement("div");
        card.className = "media-card";
        card.tabIndex = 0;
        const ps = getPosterUrl(item);
        const gs = getItemGenres(item);
        const tg = gs.length ? gs[0] : item.type === "movie" ? "Filme" : "Série";

        if (ps) {
            card.innerHTML = `
                <img class="media-card-poster" src="${ps}" loading="lazy" onerror="this.style.display='none'">
                <div class="media-card-overlay">
                    <span class="media-card-tag">${tg}</span>
                    <div class="media-card-title">${item.title}</div>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="media-card-poster-fallback">🎬</div>
                <div class="media-card-overlay">
                    <span class="media-card-tag">${tg}</span>
                    <div class="media-card-title">${item.title}</div>
                </div>
            `;
        }

        card.onclick = () => {
            window.location.hash = `#/midia/${item.id}`;
            openDetails(item);
        };
        card.onkeydown = e => { if (e.key === "Enter") card.click(); };

        if (item.type === "movie") mc.appendChild(card);
        else sc.appendChild(card);
    });

    renderContinueWatching();
    renderFeaturedShowcase();
}

/* ═══════════════════════════════════════════════
   HASH
═══════════════════════════════════════════════ */
function handleHashRouting() {
    const h = window.location.hash;
    if (h.startsWith("#/midia/")) {
        const item = mediaCatalog.find(m => m.id === h.replace("#/midia/", ""));
        if (item) openDetails(item);
    }
}
window.addEventListener("hashchange", handleHashRouting);

/* ═══════════════════════════════════════════════
   DETAILS
═══════════════════════════════════════════════ */
function openDetails(item) {
    const bd = getBackdropUrl(item);
    const ba = el("detailBackdropArea");
    if (ba) {
        if (bd) ba.style.backgroundImage = `url('${bd}')`;
        else ba.style.background = "#1a1a1a";
    }

    const ps = getPosterUrl(item);
    const dp = el("detailPoster");
    if (dp) {
        if (ps) {
            dp.src = ps;
            dp.style.display = "block";
        } else dp.style.display = "none";
    }

    el("detailTitle").innerText = item.title;
    el("detailMeta").innerText = `${item.type === "movie" ? "FILME" : "SÉRIE"} • ${item.year || ""}${item.duration ? " • ⏱️ " + item.duration : ""}`;

    const gd = el("detailGenres");
    if (gd) {
        gd.innerHTML = "";
        getItemGenres(item).forEach(g => {
            const b = document.createElement("span");
            b.style.cssText = "padding:5px 14px;background:rgba(229,9,20,0.12);border:1px solid rgba(229,9,20,0.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary-color);text-transform:uppercase";
            b.textContent = g;
            gd.appendChild(b);
        });
    }

    el("detailDesc").innerText = item.description || "";
    const continueInfo = getContinueInfo(item.id);
    const contentArea = el("detailsContentArea");

    if (item.type === "movie") {
        el("detailMovieArea")?.classList.remove("hidden");
        el("detailSerieArea")?.classList.add("hidden");
        const btn = el("btnPlayMovieFile");
        btn.innerText = continueInfo ? "▶ Continuar Assistindo" : "▶ Assistir Filme";
        btn.onclick = () => {
            saveContinueWatching(item, item.duration || "");
            closeModal("detailsModal");
            initiatePlay(normalizeSources(item), item.title, "Filme", item.id);
        };
    } else {
        el("detailMovieArea")?.classList.add("hidden");
        el("detailSerieArea")?.classList.remove("hidden");
        const tabs = el("seasonTabs");
        tabs.innerHTML = "";

        let resumeSeason = 0, resumeEp = -1;
        if (continueInfo?.episodeInfo) {
            const match = continueInfo.episodeInfo.match(/T(\d+)\s*E(\d+)/i);
            if (match) {
                resumeSeason = parseInt(match[1]) - 1;
                resumeEp = parseInt(match[2]) - 1;
            }
        }

        (item.seasons || []).forEach((s, idx) => {
            const tab = document.createElement("div");
            tab.className = `season-tab ${idx === resumeSeason ? "active" : ""}`;
            tab.innerText = `T${idx + 1}`;
            tab.tabIndex = 0;
            tab.onclick = () => {
                qsa(".season-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                if (s.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${s.seasonCoverUrl}')`;
                else if (ba) ba.style.backgroundImage = bd ? `url('${bd}')` : "";
                renderEpisodeListView(s.episodes || [], idx, s, item, idx === resumeSeason ? resumeEp : -1);
            };
            tab.onkeydown = e => { if (e.key === "Enter") tab.click(); };
            tabs.appendChild(tab);
        });

        if (item.seasons?.length) {
            const i = item.seasons[resumeSeason] ? resumeSeason : 0;
            const s = item.seasons[i];
            if (s.seasonCoverUrl?.trim() && ba) ba.style.backgroundImage = `url('${s.seasonCoverUrl}')`;
            renderEpisodeListView(s.episodes || [], i, s, item, i === resumeSeason ? resumeEp : -1);
        }
    }

    openModal("detailsModal");
    if (contentArea) contentArea.scrollTop = 0;
}
function renderEpisodeListView(eps, si, seasonData, serie, resumeEpIndex) {
    const c = el("episodesListContainer");
    if (!c) return;
    c.innerHTML = "";

    const fallbackImg = seasonData?.seasonCoverUrl?.trim() || getBackdropUrl(serie) || getPosterUrl(serie) || "";

    eps.forEach((ep, idx) => {
        const d = document.createElement("div");
        d.className = "episode-card";
        d.tabIndex = 0;
        const th = ep.thumbUrl?.trim() || fallbackImg;
        const label = `T${si + 1} E${idx + 1}`;
        const isResume = idx === resumeEpIndex;
        d.innerHTML = `
            <div class="episode-thumb">
                <img src="${th}" loading="lazy" onerror="this.src='${fallbackImg}'">
                <div class="ep-play-overlay"><span>▶</span></div>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:800">${label} - ${ep.title || "Sem Título"}${ep.duration ? `<span style="color:#888;font-size:10px;margin-left:6px">⏱️ ${ep.duration}</span>` : ""}</div>
                <span style="font-size:11px;color:var(--primary-color);font-weight:700">▶ ${isResume ? "Continuar" : "Assistir"}</span>
                ${isResume ? `<div class="ep-resume-badge">⏳ Onde parou</div>` : ""}
            </div>
        `;
        if (isResume) {
            d.style.border = "1.5px solid rgba(255,202,40,0.35)";
            d.style.background = "rgba(255,202,40,0.04)";
        }

        const playEp = () => {
            closeModal("detailsModal");
            saveContinueWatching(serie, ep.duration || "", `${label} - ${ep.title || ""}`);
            initiatePlay(normalizeEpisodeSources(ep), serie.title, `${label} - ${ep.title || ""}`, serie.id);
        };
        d.onclick = playEp;
        d.onkeydown = e => { if (e.key === "Enter") playEp(); };
        c.appendChild(d);
    });

    if (resumeEpIndex >= 0) {
        setTimeout(() => {
            const cards = c.querySelectorAll(".episode-card");
            if (cards[resumeEpIndex]) cards[resumeEpIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 140);
    }
}
el("btnCloseDetails")?.addEventListener("click", () => {
    window.location.hash = "";
    closeModal("detailsModal");
});

/* ═══════════════════════════════════════════════
   PLAYER
═══════════════════════════════════════════════ */
const playerBox = el("playerModalBox");
const playerTopbar = el("playerTopbar");
const playerBottombar = el("playerBottombar");
const playerContainer = el("playerContainerView");
const playerLoading = el("playerLoading");
const playerRevealBtn = el("playerRevealBtn");
const playerSourceSelector = el("playerSourceSelector");
const playerErrorScreen = el("playerErrorScreen");
const btnToggleFullscreen = el("btnToggleFullscreen");
const playerNativeFsPill = el("playerNativeFsPill");

function isPlayerOpen() {
    return !el("playerModal")?.classList.contains("hidden");
}
function isInFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function setPlayerControlsVisible(visible) {
    if (!playerTopbar || !playerBottombar || !playerBox) return;
    playerTopbar.classList.toggle("is-hidden", !visible);
    playerBottombar.classList.toggle("is-hidden", !visible);
    playerBox.classList.toggle("cursor-hidden", !visible);
    playerBox.classList.toggle("controls-visible", visible);
}
function shouldKeepPlayerControlsVisible() {
    return playerControlsLocked ||
        !playerSourceSelector?.classList.contains("hidden") ||
        !playerErrorScreen?.classList.contains("hidden") ||
        playerPointerInsideOverlay;
}
function clearPlayerHideTimers() {
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
}
function schedulePlayerControlsHide() {
    clearPlayerHideTimers();
    if (!isPlayerOpen() || shouldKeepPlayerControlsVisible()) return;

    controlsHideTimer = setTimeout(() => {
        if (shouldKeepPlayerControlsVisible()) return;
        setPlayerControlsVisible(false);
    }, PLAYER_HIDE_DELAY_MS);

    if (!("ontouchstart" in window)) {
        cursorHideTimer = setTimeout(() => {
            if (shouldKeepPlayerControlsVisible()) return;
            playerBox?.classList.add("cursor-hidden");
        }, PLAYER_CURSOR_HIDE_MS);
    }
}
function showPlayerControls(lock = false) {
    if (!isPlayerOpen()) return;
    if (lock) playerControlsLocked = true;
    setPlayerControlsVisible(true);
    schedulePlayerControlsHide();
}
function unlockPlayerControls() {
    playerControlsLocked = false;
    schedulePlayerControlsHide();
}
function showSourceSelector() {
    if (!playerSourceSelector) return;
    const list = el("playerSourceList");
    if (!list) return;

    playerControlsLocked = true;
    hidePlayerError();
    playerLoading?.classList.add("hidden");

    el("playerTitleDisplay").innerText = currentPlayerMeta.mainTitle || "Escolha uma fonte";
    el("playerSubDisplay").innerText = currentPlayerMeta.subTitle || "MasterFlix";
    el("playerProviderBadge")?.classList.add("hidden");
    el("playerSourceSelectorSub").innerText = `${currentSources.length} fonte(s) disponíveis`;
    list.innerHTML = "";

    currentSources.forEach((src, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "player-source-btn";
        btn.tabIndex = 0;
        if (idx === currentSourceIndex && currentVideoUrl) btn.classList.add("current");
        const ad = getAdapter(src.type);
        const title = src.label || ad.name;
        const short = src.url ? (src.url.length > 55 ? src.url.slice(0, 55) + "…" : src.url) : "";
        const currentTag = idx === currentSourceIndex && currentVideoUrl ? `<span class="current-tag">Atual</span>` : "";
        btn.innerHTML = `
            <div class="source-btn-top">
                <span class="source-btn-title">${ad.icon} ${title}${currentTag}</span>
                <span class="source-btn-type" style="color:${ad.color}">${ad.name}</span>
            </div>
            <div class="source-btn-url">${short}</div>
        `;
        btn.onclick = () => {
            hideSourceSelector();
            currentSourceIndex = idx;
            playSourceByIndex(idx);
        };
        list.appendChild(btn);
    });

    playerSourceSelector.classList.remove("hidden");
    showPlayerControls(true);
    setTimeout(() => list.querySelector(".player-source-btn")?.focus(), 120);
}
function hideSourceSelector() {
    playerSourceSelector?.classList.add("hidden");
    unlockPlayerControls();
}
function showPlayerError(desc, name) {
    el("playerErrorTitle").textContent = `Falha em ${name || "reprodução"}`;
    el("playerErrorDesc").textContent = desc || "Tente outra fonte.";
    el("btnErrorTryAnother").style.display = currentSources.length > 1 ? "" : "none";
    playerErrorScreen?.classList.remove("hidden");
    playerLoading?.classList.add("hidden");
    showPlayerControls(true);
}
function hidePlayerError() {
    playerErrorScreen?.classList.add("hidden");
    unlockPlayerControls();
}
function resetNativeFullscreenUI() {
    btnToggleFullscreen?.classList.remove("native-hidden");
    playerNativeFsPill?.classList.remove("visible");
}
function setNativeFullscreenDetected(hideCustom) {
    if (hideCustom) {
        btnToggleFullscreen?.classList.add("native-hidden");
        playerNativeFsPill?.classList.add("visible");
    } else {
        btnToggleFullscreen?.classList.remove("native-hidden");
        playerNativeFsPill?.classList.remove("visible");
    }
}
function detectNativeFullscreenAvailability(mediaEl, sourceType) {
    resetNativeFullscreenUI();

    // 1) vídeo HTML5 com controls: geralmente já tem fullscreen nativo
    if (mediaEl?.tagName === "VIDEO" && mediaEl.controls) {
        setNativeFullscreenDetected(true);
        return;
    }

    // 2) alguns players conhecidos já têm fullscreen interno muito confiável
    if (["youtube", "vimeo"].includes(sourceType)) {
        setNativeFullscreenDetected(true);
        return;
    }

    // 3) tentativa same-origin
    if (mediaEl?.tagName === "IFRAME") {
        setTimeout(() => {
            try {
                const doc = mediaEl.contentDocument;
                if (!doc) return;
                const candidate = doc.querySelector(`
                    [aria-label*="fullscreen" i],
                    [title*="fullscreen" i],
                    button[aria-label*="full screen" i],
                    button[title*="full screen" i],
                    .fullscreen,
                    .vjs-fullscreen-control
                `);
                if (candidate) setNativeFullscreenDetected(true);
            } catch {
                // cross-origin: mantém nosso botão
            }
        }, 1200);
    }
}

playerRevealBtn?.addEventListener("click", e => {
    e.stopPropagation();
    showPlayerControls();
});
playerRevealBtn?.addEventListener("mouseenter", () => playerPointerInsideOverlay = true);
playerRevealBtn?.addEventListener("mouseleave", () => {
    playerPointerInsideOverlay = false;
    schedulePlayerControlsHide();
});

playerTopbar?.addEventListener("mouseenter", () => playerPointerInsideOverlay = true);
playerTopbar?.addEventListener("mouseleave", () => {
    playerPointerInsideOverlay = false;
    schedulePlayerControlsHide();
});
playerBottombar?.addEventListener("mouseenter", () => playerPointerInsideOverlay = true);
playerBottombar?.addEventListener("mouseleave", () => {
    playerPointerInsideOverlay = false;
    schedulePlayerControlsHide();
});

playerBox?.addEventListener("mousemove", () => showPlayerControls());
playerBox?.addEventListener("touchstart", () => showPlayerControls(), { passive: true });
playerBox?.addEventListener("click", e => {
    if (e.target.closest("button, .audio-boost-pill, .player-source-btn, .player-source-selector-card")) return;
    showPlayerControls();
});

["fullscreenchange", "webkitfullscreenchange"].forEach(evt => {
    document.addEventListener(evt, () => {
        if (!isPlayerOpen()) return;
        const btn = el("btnToggleFullscreen");
        if (btn) btn.innerHTML = isInFullscreen() ? "⤢" : "⛶";
        showPlayerControls();
    });
});

btnToggleFullscreen?.addEventListener("click", async e => {
    e.stopPropagation();
    try {
        if (!isInFullscreen()) {
            if (playerBox?.requestFullscreen) await playerBox.requestFullscreen();
            else if (playerBox?.webkitRequestFullscreen) await playerBox.webkitRequestFullscreen();
            try { await screen.orientation?.lock?.("landscape"); } catch {}
        } else {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
            try { screen.orientation?.unlock?.(); } catch {}
        }
    } catch {}
    showPlayerControls();
});

el("btnToggleStretch")?.addEventListener("click", e => {
    e.stopPropagation();
    isStretchMode = !isStretchMode;
    playerContainer?.classList.toggle("stretch-mode", isStretchMode);
    const btn = el("btnToggleStretch");
    if (btn) {
        btn.classList.toggle("active", isStretchMode);
        btn.innerHTML = isStretchMode ? "⇲" : "⇱";
    }
    showMsg(isStretchMode ? "📐 Esticado" : "🖼️ Ajustado", "success");
    showPlayerControls();
});
el("btnReloadPlayer")?.addEventListener("click", e => {
    e.stopPropagation();
    if (currentVideoUrl) {
        playSourceByIndex(currentSourceIndex);
        showMsg("Recarregando...", "info");
    }
});
el("btnChangeSource")?.addEventListener("click", e => {
    e.stopPropagation();
    showSourceSelector();
});
el("btnCancelSourceSelection")?.addEventListener("click", () => {
    if (currentVideoUrl) hideSourceSelector();
    else closePlayer();
});
el("btnErrorTryAnother")?.addEventListener("click", () => {
    hidePlayerError();
    showSourceSelector();
});
el("btnErrorReload")?.addEventListener("click", () => {
    hidePlayerError();
    playSourceByIndex(currentSourceIndex);
});

function initiatePlay(sources, mainTitle, subTitle, itemId = null) {
    if (!sources?.length) {
        showMsg("Nenhum link disponível!", "error");
        return;
    }
    currentSources = sources.slice();
    currentPlayerMeta = { mainTitle, subTitle };
    currentPlayingItemId = itemId;
    currentPlayCountTracked = false;
    openModal("playerModal");
    el("btnChangeSource")?.classList.toggle("hidden", currentSources.length <= 1);

    if (currentSources.length === 1) {
        currentSourceIndex = 0;
        playSourceByIndex(0);
    } else {
        showSourceSelector();
    }
}
function playSourceByIndex(idx) {
    const src = currentSources[idx];
    if (!src?.url) {
        showMsg("Link inválido!", "error");
        return;
    }

    const ad = getAdapter(src.type);
    const finalUrl = ad.formatUrl(src.url);
    currentVideoUrl = finalUrl;
    currentSourceIndex = idx;

    el("playerTitleDisplay").innerText = currentPlayerMeta.mainTitle || "Assistindo";
    el("playerSubDisplay").innerText = currentPlayerMeta.subTitle || "MasterFlix";

    const badge = el("playerProviderBadge");
    if (badge) {
        badge.innerHTML = `${ad.icon} ${src.label || ad.name}`;
        badge.style.background = `${ad.color}30`;
        badge.style.borderColor = `${ad.color}80`;
        badge.classList.remove("hidden");
    }

    resetNativeFullscreenUI();
    playerLoading?.classList.remove("hidden");
    el("playerLoadingText").textContent = `Carregando ${ad.name}...`;
    el("playerLoadingSub").textContent = "Player otimizado";
    hidePlayerError();
    hideSourceSelector();

    playerContainer?.querySelectorAll("iframe, video").forEach(n => n.remove());

    if (isStretchMode) {
        isStretchMode = false;
        playerContainer?.classList.remove("stretch-mode");
        const btn = el("btnToggleStretch");
        if (btn) {
            btn.classList.remove("active");
            btn.innerHTML = "⇱";
        }
    }

    const booster = el("audioBoostSlider");
    if (booster) booster.value = 100;
    setAudioBoost(100);

    const mediaEl = ad.createElement(finalUrl);

    mediaEl.addEventListener("load", () => {
        detectNativeFullscreenAvailability(mediaEl, src.type);
        setTimeout(() => playerLoading?.classList.add("hidden"), 450);
        clearTimeout(playerErrorTimer);
        setTimeout(() => {
            scanAndBoostAudio();
            incrementTodayView(currentPlayingItemId);
        }, 1200);
    });

    if (mediaEl.tagName === "VIDEO") {
        mediaEl.addEventListener("canplay", () => {
            detectNativeFullscreenAvailability(mediaEl, src.type);
            setTimeout(() => playerLoading?.classList.add("hidden"), 220);
            clearTimeout(playerErrorTimer);
            incrementTodayView(currentPlayingItemId);
        });
        mediaEl.addEventListener("play", () => incrementTodayView(currentPlayingItemId));
        mediaEl.addEventListener("error", () => {
            showPlayerError("Vídeo não disponível.", ad.name);
        });
    }

    playerContainer?.appendChild(mediaEl);
    clearTimeout(playerErrorTimer);
    playerErrorTimer = setTimeout(() => {
        playerLoading?.classList.add("hidden");
    }, ad.errorLoadMs);

    startOverlayCleaner();
    showPlayerControls();

    const tip = el("playerTip");
    if (tip) {
        setTimeout(() => {
            if (!isPlayerOpen()) return;
            tip.classList.add("show");
            setTimeout(() => tip.classList.remove("show"), 4500);
        }, 2500);
    }

    const scanInterval = setInterval(() => {
        if (!isPlayerOpen()) {
            clearInterval(scanInterval);
            return;
        }
        scanAndBoostAudio();
    }, 5000);
}
function closePlayer() {
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
    clearTimeout(playerErrorTimer);

    if (isInFullscreen()) {
        try { document.exitFullscreen?.(); } catch {}
        try { document.webkitExitFullscreen?.(); } catch {}
        try { screen.orientation?.unlock?.(); } catch {}
    }

    playerContainer?.querySelectorAll("iframe, video").forEach(elm => elm.remove());
    playerContainer?.classList.remove("stretch-mode");
    playerLoading?.classList.remove("hidden");
    hidePlayerError();
    hideSourceSelector();
    closeModal("playerModal");
    stopOverlayCleaner();
    resetNativeFullscreenUI();

    currentVideoUrl = "";
    currentSources = [];
    currentSourceIndex = 0;
    currentPlayingItemId = null;
    currentPlayCountTracked = false;
    isStretchMode = false;
    playerControlsLocked = false;
    playerPointerInsideOverlay = false;

    el("btnChangeSource")?.classList.add("hidden");
    el("playerProviderBadge")?.classList.add("hidden");
    const stretchBtn = el("btnToggleStretch");
    if (stretchBtn) {
        stretchBtn.classList.remove("active");
        stretchBtn.innerHTML = "⇱";
    }

    if (audioGainNode) audioGainNode.gain.value = 1.0;
    const b = el("audioBoostSlider");
    if (b) b.value = 100;
    setAudioBoost(100);
    setPlayerControlsVisible(true);
    renderContinueWatching();
}
el("btnClosePlayer")?.addEventListener("click", e => {
    e.stopPropagation();
    closePlayer();
});

/* áudio */
function initAudioContext() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioGainNode = audioCtx.createGain();
        audioGainNode.connect(audioCtx.destination);
        audioGainNode.gain.value = 1.0;
    } catch {}
}
function boostMediaElement(elm) {
    if (!audioCtx || !audioGainNode || boostedElements.has(elm)) return;
    try {
        const src = audioCtx.createMediaElementSource(elm);
        src.connect(audioGainNode);
        boostedElements.add(elm);
    } catch {}
}
function scanAndBoostAudio() {
    if (!audioCtx) return;
    document.querySelectorAll("video, audio").forEach(boostMediaElement);
    try {
        const iframe = qs("#playerContainerView iframe");
        if (iframe?.contentDocument) {
            iframe.contentDocument.querySelectorAll("video, audio").forEach(boostMediaElement);
        }
    } catch {}
}
function setAudioBoost(pct) {
    audioBoostLevel = pct;
    initAudioContext();
    audioCtx?.resume?.().catch(() => {});
    if (audioGainNode) audioGainNode.gain.value = pct / 100;
    scanAndBoostAudio();

    const icon = el("audioBoostIcon");
    const val = el("audioBoostValue");
    if (val) val.textContent = pct + "%";
    if (icon && val) {
        if (pct <= 100) {
            icon.textContent = "🔈";
            val.style.color = "#aaa";
        } else if (pct <= 200) {
            icon.textContent = "🔊";
            val.style.color = "#fff";
        } else {
            icon.textContent = "🔊";
            val.style.color = pct <= 350 ? "#ff9800" : "#ff5252";
        }
    }
}
el("audioBoostSlider")?.addEventListener("input", e => {
    setAudioBoost(parseInt(e.target.value));
});
el("audioBoostSlider")?.addEventListener("pointerdown", () => showPlayerControls(true));
el("audioBoostSlider")?.addEventListener("pointerup", () => unlockPlayerControls());
el("audioBoostSlider")?.addEventListener("blur", () => unlockPlayerControls());
el("audioBoostIcon")?.addEventListener("click", () => {
    const slider = el("audioBoostSlider");
    if (!slider) return;
    slider.value = audioBoostLevel > 100 ? 100 : 200;
    setAudioBoost(parseInt(slider.value));
    showPlayerControls();
});

/* limpar overlay chato */
function startOverlayCleaner() {
    if (overlayCleanerInterval) return;
    overlayCleanerInterval = setInterval(() => {
        if (!isPlayerOpen()) return;
        try {
            const iframe = document.querySelector("#playerContainerView iframe");
            if (!iframe?.contentDocument) return;
            const doc = iframe.contentDocument;
            doc.querySelectorAll("div, aside, section, span").forEach(node => {
                const s = doc.defaultView?.getComputedStyle(node);
                if (!s) return;
                const isOverlay = (s.position === "fixed" || s.position === "absolute") && ((parseInt(s.zIndex) || 0) > 100);
                if (isOverlay && node.offsetWidth > iframe.clientWidth * 0.6 && node.offsetHeight > iframe.clientHeight * 0.4 && !node.querySelector("video")) {
                    node.style.display = "none";
                    node.style.pointerEvents = "none";
                }
            });
        } catch {}
    }, 2200);
}
function stopOverlayCleaner() {
    if (overlayCleanerInterval) {
        clearInterval(overlayCleanerInterval);
        overlayCleanerInterval = null;
    }
}

/* shortcuts */
document.addEventListener("keydown", e => {
    if (!isPlayerOpen()) return;
    if (e.key === "Escape") {
        closePlayer();
        return;
    }
    if (e.key === "f" || e.key === "F") btnToggleFullscreen?.click();
    if (e.key === "s" || e.key === "S") el("btnToggleStretch")?.click();
    if (e.key === "r" || e.key === "R") el("btnReloadPlayer")?.click();
    if (e.key === "c" || e.key === "C") el("btnChangeSource")?.click();
    if (e.key === "ArrowUp") {
        e.preventDefault();
        const sl = el("audioBoostSlider");
        if (sl) {
            sl.value = Math.min(500, parseInt(sl.value) + 25);
            setAudioBoost(parseInt(sl.value));
        }
    }
    if (e.key === "ArrowDown") {
        e.preventDefault();
        const sl = el("audioBoostSlider");
        if (sl) {
            sl.value = Math.max(100, parseInt(sl.value) - 25);
            setAudioBoost(parseInt(sl.value));
        }
    }
    showPlayerControls();
});

/* ═══════════════════════════════════════════════
   FORM SAVE
═══════════════════════════════════════════════ */
el("mediaForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    syncCreatorInputsToState();

    if (!selectedGenres.length) {
        showMsg("Selecione ao menos 1 gênero!", "error");
        qs('.creator-tab[data-tab="info"]')?.click();
        return;
    }

    const editId = el("editMediaId")?.value;
    const title = el("mediaTitle")?.value.trim() || "";
    if (!title) {
        showMsg("Digite um título!", "error");
        qs('.creator-tab[data-tab="info"]')?.click();
        return;
    }

    let cv = el("mediaCoverPreview")?.src || "";
    let bd = el("mediaBackdropPreview")?.src || "";
    if (!isValidImageUrl(cv) && editId) {
        const ex = mediaCatalog.find(m => m.id === editId);
        if (ex) cv = ex.coverUrl;
    }
    if (!isValidImageUrl(bd) && editId) {
        const ex = mediaCatalog.find(m => m.id === editId);
        if (ex) bd = ex.backdropUrl;
    }

    const payload = {
        type: creatorData.type,
        genres: [...selectedGenres],
        category: selectedGenres[0],
        title,
        year: el("mediaYear")?.value.trim() || "",
        duration: el("mediaDuration")?.value.trim() || "",
        description: el("mediaDesc")?.value.trim() || "",
        coverUrl: isValidImageUrl(cv) ? cv : "",
        backdropUrl: isValidImageUrl(bd) ? bd : ""
    };

    if (creatorData.type === "movie") {
        const vs = creatorData.movieSources.filter(s => s.url?.trim());
        if (!vs.length) {
            showMsg("Adicione ao menos 1 fonte de vídeo!", "error");
            qs('.creator-tab[data-tab="content"]')?.click();
            return;
        }
        const used = vs.map(s => s.type).filter(t => t && t !== "other");
        const dup = used.find((t, i) => used.indexOf(t) !== i);
        if (dup) {
            showMsg(`Fonte duplicada: ${sourceTypeLabel(dup)}`, "error");
            return;
        }
        payload.videoSources = vs.map(s => ({
            type: s.type || "other",
            label: s.label || sourceTypeLabel(s.type) || "Fonte",
            url: s.url.trim()
        }));
        payload.videoUrl = payload.videoSources[0].url;
    } else {
        const builtSeasons = [];
        for (let si = 0; si < creatorData.seasons.length; si++) {
            const s = creatorData.seasons[si];
            const builtEpisodes = [];
            for (let ei = 0; ei < (s.episodes || []).length; ei++) {
                const ep = s.episodes[ei];
                const epSrc = (ep.sources || []).filter(src => src.url?.trim());
                const epUsed = epSrc.map(src => src.type).filter(t => t && t !== "other");
                const epDup = epUsed.find((t, i) => epUsed.indexOf(t) !== i);
                if (epDup) {
                    showMsg(`T${si + 1}E${ei + 1}: fonte duplicada "${sourceTypeLabel(epDup)}"`, "error");
                    return;
                }
                builtEpisodes.push({
                    title: ep.title?.trim() || `Episódio ${ei + 1}`,
                    duration: ep.duration?.trim() || "",
                    thumbUrl: isValidImageUrl(ep.thumbUrl) ? ep.thumbUrl : "",
                    videoSources: epSrc.map(src => ({
                        type: src.type || "other",
                        label: src.label || sourceTypeLabel(src.type) || "Fonte",
                        url: src.url.trim()
                    })),
                    videoUrl: epSrc.length ? epSrc[0].url.trim() : ""
                });
            }
            builtSeasons.push({
                seasonNumber: si + 1,
                seasonCoverUrl: isValidImageUrl(s.seasonCoverUrl) ? s.seasonCoverUrl : "",
                episodes: builtEpisodes
            });
        }
        payload.seasons = builtSeasons;
    }

    try {
        if (editId) await set(ref(rtdb, "catalog/" + editId), payload);
        else await set(push(ref(rtdb, "catalog")), payload);
        showMsg("Salvo com sucesso! ✅", "success");
        closeModal("creatorModal");
        resetCreator();
        await loadCatalog();
    } catch (err) {
        showMsg("Erro: " + err.message, "error");
    }
});
el("btnCancelCreator")?.addEventListener("click", () => {
    if (confirm("Descartar alterações?")) {
        closeModal("creatorModal");
        resetCreator();
    }
});
function resetCreator() {
    creatorData = { type: "movie", movieSources: [], seasons: [] };
    uiState.openSeasons.clear();
    uiState.openEpisodes.clear();
    selectedGenres = [];
    el("mediaForm")?.reset();
    if (el("editMediaId")) el("editMediaId").value = "";
    el("mediaCoverPreview")?.classList.add("hidden");
    el("mediaBackdropPreview")?.classList.add("hidden");
    el("mediaType").disabled = false;
    renderGenreSelector();
    renderMovieSources();
    renderSeasonsList();
    qs('.creator-tab[data-tab="info"]')?.click();
}

/* ═══════════════════════════════════════════════
   ADMIN
═══════════════════════════════════════════════ */
window.editMedia = id => {
    const i = mediaCatalog.find(m => m.id === id);
    if (!i) return;

    resetCreator();
    el("editMediaId").value = i.id;

    const typeSel = el("mediaType");
    typeSel.value = i.type;
    typeSel.disabled = true;

    creatorData.type = i.type;
    el("movieFileArea")?.classList.toggle("hidden", i.type !== "movie");
    el("seriesBuilderArea")?.classList.toggle("hidden", i.type === "movie");

    selectedGenres = Array.isArray(i.genres) && i.genres.length ? [...i.genres] : (i.category ? [i.category] : []);
    renderGenreSelector();

    el("mediaTitle").value = i.title || "";
    el("mediaYear").value = i.year || "";
    el("mediaDuration").value = i.duration || "";
    el("mediaDesc").value = i.description || "";

    if (i.coverUrl) {
        const img = el("mediaCoverPreview");
        img.src = i.coverUrl;
        img.classList.remove("hidden");
    }
    if (i.backdropUrl) {
        const img = el("mediaBackdropPreview");
        img.src = i.backdropUrl;
        img.classList.remove("hidden");
    }

    el("creatorTitle").innerText = "Editar";
    el("creatorSubtitle").innerText = "Ajuste os dados abaixo";

    if (i.type === "movie") {
        creatorData.movieSources = normalizeSources(i).map(s => ({ id: uid(), ...s }));
        renderMovieSources();
    } else {
        creatorData.seasons = (i.seasons || []).map((s, si) => ({
            id: uid(),
            seasonNumber: si + 1,
            seasonCoverUrl: s.seasonCoverUrl || "",
            episodes: (s.episodes || []).map(ep => ({
                id: uid(),
                title: ep.title || "",
                duration: ep.duration || "",
                thumbUrl: ep.thumbUrl || "",
                sources: normalizeEpisodeSources(ep).map(src => ({ id: uid(), ...src }))
            }))
        }));
        if (creatorData.seasons[0]) uiState.openSeasons.add(creatorData.seasons[0].id);
        renderSeasonsList();
    }

    closeModal("adminModal");
    openModal("creatorModal");
};
window.deleteMedia = async id => {
    if (!confirm("Apagar este item?")) return;
    try {
        await remove(ref(rtdb, "catalog/" + id));
        showMsg("Removido!", "success");
        loadCatalog();
    } catch {
        showMsg("Erro ao apagar!", "error");
    }
};
function renderAdminCatalogList() {
    const c = el("adminCatalogList");
    if (!c) return;
    const sv = normalizeText(el("adminSearchInput")?.value || "");
    c.innerHTML = "";
    mediaCatalog.forEach(i => {
        if (sv && !normalizeText(i.title).includes(sv)) return;
        const d = document.createElement("div");
        d.className = "admin-item";
        d.innerHTML = `
            <div>
                <strong>${i.title}</strong>
                <div style="font-size:10px;color:#888">${i.type === "movie" ? "🎬 Filme" : "📺 Série"}${i.year ? " • " + i.year : ""}</div>
            </div>
            <div style="display:flex;gap:6px">
                <button class="btn-secondary" onclick="editMedia('${i.id}')">✏️</button>
                <button class="btn-danger" onclick="deleteMedia('${i.id}')">🗑️</button>
            </div>
        `;
        c.appendChild(d);
    });
}
el("adminSearchInput")?.addEventListener("input", renderAdminCatalogList);
el("btnCloseAdmin")?.addEventListener("click", () => closeModal("adminModal"));
el("btnAddNewFromAdmin")?.addEventListener("click", () => {
    closeModal("adminModal");
    openCreator();
});
function openCreator() {
    resetCreator();
    el("mediaType").disabled = false;
    el("creatorTitle").innerText = "Publicar";
    el("creatorSubtitle").innerText = "Preencha os dados abaixo";
    openModal("creatorModal");
}

/* ═══════════════════════════════════════════════
   SUGGESTIONS / STORAGE
═══════════════════════════════════════════════ */
el("btnCloseSuggestion")?.addEventListener("click", () => closeModal("suggestionModal"));
el("btnSendSuggestion")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return showMsg("Faça login primeiro!", "error");
    const text = el("suggestionText")?.value.trim();
    const type = el("suggestionType")?.value;
    if (!text || text.length < 5) return showMsg("Escreva mais detalhes!", "error");
    try {
        await set(push(ref(rtdb, "suggestions")), {
            userId: user.uid,
            userEmail: user.email,
            userName: getUserCache("name") || user.email.split("@")[0],
            text,
            type,
            timestamp: Date.now()
        });
        el("suggestionText").value = "";
        showMsg("Enviado!", "success");
        closeModal("suggestionModal");
    } catch {
        showMsg("Erro ao enviar!", "error");
    }
});

el("btnCloseSuggestionsAdmin")?.addEventListener("click", () => {
    exitSelectMode();
    closeModal("suggestionsAdminModal");
});
async function loadSuggestionsAdmin() {
    try {
        const snap = await get(ref(rtdb, "suggestions"));
        allSuggestions = [];
        if (snap.exists()) {
            const d = snap.val();
            for (const k in d) allSuggestions.push({ id: k, ...d[k] });
        }
        allSuggestions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        el("suggestionsCountText").textContent = `${allSuggestions.length} item(s)`;
        renderSuggestionsList();
    } catch {}
}
function renderSuggestionsList() {
    const c = el("suggestionsAdminList");
    if (!c) return;
    c.innerHTML = "";
    if (!allSuggestions.length) {
        c.innerHTML = `<p style="text-align:center;color:#666;padding:30px">Vazio.</p>`;
        return;
    }
    allSuggestions.forEach(s => {
        const d = document.createElement("div");
        d.className = "suggestion-box";
        const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString("pt-BR") : "?";
        const cb = suggestionsSelectMode ? `<input type="checkbox" class="suggestion-checkbox" data-id="${s.id}" ${selectedSuggestionIds.has(s.id) ? "checked" : ""}>` : "";
        const del = !suggestionsSelectMode ? `<button class="btn-danger" onclick="deleteSingleSuggestion('${s.id}')">🗑️</button>` : "";
        const badge = s.type === "bug" ? "🐛 BUG" : "💡 SUG";
        d.innerHTML = `
            <div class="sg-header">
                <div style="display:flex;align-items:center;gap:8px">${cb}
                    <div>
                        <div class="sg-user">${s.userName || "?"} ${badge}</div>
                        <div class="sg-email">${s.userEmail || ""}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px"><span class="sg-date">${date}</span>${del}</div>
            </div>
            <div class="sg-text">${s.text}</div>
        `;
        if (suggestionsSelectMode) {
            const chk = d.querySelector(".suggestion-checkbox");
            chk.onchange = () => {
                if (chk.checked) selectedSuggestionIds.add(s.id);
                else selectedSuggestionIds.delete(s.id);
            };
        }
        c.appendChild(d);
    });
}
function enterSelectMode() {
    suggestionsSelectMode = true;
    selectedSuggestionIds.clear();
    el("btnToggleSelectMode")?.classList.add("hidden");
    el("btnDeleteSelectedSuggestions")?.classList.remove("hidden");
    el("btnSelectAllSuggestions")?.classList.remove("hidden");
    el("btnCancelSelectMode")?.classList.remove("hidden");
    renderSuggestionsList();
}
function exitSelectMode() {
    suggestionsSelectMode = false;
    selectedSuggestionIds.clear();
    el("btnToggleSelectMode")?.classList.remove("hidden");
    el("btnDeleteSelectedSuggestions")?.classList.add("hidden");
    el("btnSelectAllSuggestions")?.classList.add("hidden");
    el("btnCancelSelectMode")?.classList.add("hidden");
    renderSuggestionsList();
}
el("btnToggleSelectMode")?.addEventListener("click", enterSelectMode);
el("btnCancelSelectMode")?.addEventListener("click", exitSelectMode);
el("btnSelectAllSuggestions")?.addEventListener("click", () => {
    if (selectedSuggestionIds.size === allSuggestions.length) selectedSuggestionIds.clear();
    else allSuggestions.forEach(s => selectedSuggestionIds.add(s.id));
    renderSuggestionsList();
});
el("btnDeleteSelectedSuggestions")?.addEventListener("click", async () => {
    if (!selectedSuggestionIds.size || !confirm(`Apagar ${selectedSuggestionIds.size}?`)) return;
    try {
        for (const id of selectedSuggestionIds) await remove(ref(rtdb, "suggestions/" + id));
        showMsg("OK!", "success");
        exitSelectMode();
        loadSuggestionsAdmin();
    } catch {}
});
window.deleteSingleSuggestion = async id => {
    if (!confirm("Apagar?")) return;
    try {
        await remove(ref(rtdb, "suggestions/" + id));
        loadSuggestionsAdmin();
    } catch {}
};

el("btnCloseStorage")?.addEventListener("click", () => closeModal("storageModal"));
async function loadStorageInfo() {
    const c = el("storageContent");
    if (!c) return;
    c.innerHTML = `<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto 14px;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando...</p></div>`;
    try {
        const [cs, us, ss] = await Promise.all([
            get(ref(rtdb, "catalog")).catch(() => null),
            get(ref(rtdb, "users")).catch(() => null),
            get(ref(rtdb, "suggestions")).catch(() => null)
        ]);
        const cd = cs?.exists() ? cs.val() : {};
        const ud = us?.exists() ? us.val() : {};
        const sd = ss?.exists() ? ss.val() : {};
        const cb = estimateJsonBytes(cd);
        const ub = estimateJsonBytes(ud);
        const sb = estimateJsonBytes(sd);
        const tb = cb + ub + sb;
        const cc = Object.keys(cd).length;
        const uc = Object.keys(ud).length;
        const scount = Object.keys(sd).length;

        let mc = 0, sc2 = 0, te = 0;
        Object.values(cd).forEach(i => {
            if (i.type === "movie") mc++;
            else {
                sc2++;
                (i.seasons || []).forEach(s => te += (s.episodes || []).length);
            }
        });

        const pct = Math.min(100, (tb / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100);
        const free = FIREBASE_RTDB_FREE_LIMIT_BYTES - tb;
        let bc = "#4caf50", st = "✅ Saudável";
        if (pct > 50) bc = "#8bc34a";
        if (pct > 70) { bc = "#ff9800"; st = "⚠️ Atenção"; }
        if (pct > 85) { bc = "#ff5722"; st = "🔴 Crítico"; }

        c.innerHTML = `
            <div style="text-align:center;margin-bottom:20px">
                <div style="font-size:38px;font-weight:900;color:${bc}">${pct.toFixed(1)}%</div>
                <div style="font-size:14px;font-weight:800;margin-top:4px">${st}</div>
            </div>
            <div style="margin-bottom:22px">
                <div class="storage-bar-outer"><div class="storage-bar-inner" style="width:${Math.max(2, pct)}%;background:${bc}"></div></div>
                <div class="storage-info"><span>${formatBytes(tb)} usado</span><span>${formatBytes(free)} livre</span></div>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:22px">
                <div class="storage-icon-card"><span class="sto-icon">🎬</span><div class="sto-count">${mc}</div><div class="sto-label">Filmes</div></div>
                <div class="storage-icon-card"><span class="sto-icon">📺</span><div class="sto-count">${sc2}</div><div class="sto-label">Séries</div></div>
                <div class="storage-icon-card"><span class="sto-icon">🎞️</span><div class="sto-count">${te}</div><div class="sto-label">Episódios</div></div>
            </div>
            <div class="storage-detail-item"><span class="storage-label">Catálogo (${cc})</span><span class="storage-value">${formatBytes(cb)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">Usuários (${uc})</span><span class="storage-value">${formatBytes(ub)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">Sugestões (${scount})</span><span class="storage-value">${formatBytes(sb)}</span></div>
        `;
    } catch (e) {
        c.innerHTML = `<p style="text-align:center;color:#ff5252">${e.message}</p>`;
    }
}

/* ═══════════════════════════════════════════════
   PROFILE
═══════════════════════════════════════════════ */
function openProfileModal() {
    openModal("profileModal");
    updateDevicesCountBadge();
}
function resetProfileUI() {
    const setTxt = (id, txt) => { const node = el(id); if (node) node.innerText = txt; };
    const setVal = (id, val) => { const node = el(id); if (node) node.value = val; };

    setTxt("avatarText", "U");
    el("avatarImg")?.classList.add("hidden");
    el("avatarText")?.classList.remove("hidden");
    setTxt("profileAvatarBigText", "U");
    el("profileAvatarBigImg")?.classList.add("hidden");
    el("profileAvatarBigText")?.classList.remove("hidden");
    setTxt("profileNameDisplay", "Usuário");
    setTxt("profileEmailDisplay", "");
    setTxt("profileBioDisplay", `"Maratonando!"`);
    setVal("profileNameInput", "");
    setVal("profileBioInput", "");
    const pB = el("profileBannerImg");
    if (pB) pB.src = "https://placehold.co/600x200/1e1e1e/8c8c8c?text=Banner";
    el("profilePhotoPreview")?.classList.add("hidden");
    el("profileBannerPreview")?.classList.add("hidden");
    setTxt("sidebarUserName", "Usuário");
    setTxt("sidebarUserEmail", "email@exemplo.com");
    const sa = el("sidebarAvatar");
    if (sa) sa.innerHTML = "<span>U</span>";
    setVal("themeColorPicker", "#e50914");
}
function updateUserAvatarUI(data = {}) {
    const user = auth.currentUser;
    const name = data.name || getUserCache("name") || "";
    const bio = data.bio || getUserCache("bio") || "";
    const fav = data.favGenre || getUserCache("fav_genre") || "";
    const avatar = data.photo || getUserCache("avatar") || "";
    const banner = data.banner || getUserCache("banner") || "";
    const letter = name ? name.charAt(0).toUpperCase() : (user ? user.email.charAt(0).toUpperCase() : "U");

    const setTxt = (id, txt) => { const node = el(id); if (node) node.innerText = txt; };
    const setVal = (id, val) => { const node = el(id); if (node) node.value = val; };

    if (name) {
        setTxt("profileNameDisplay", name);
        setVal("profileNameInput", name);
        setTxt("sidebarUserName", name);
    } else if (user) {
        const fallback = user.email.split("@")[0];
        setTxt("profileNameDisplay", fallback);
        setTxt("sidebarUserName", fallback);
    }

    if (user) {
        setTxt("profileEmailDisplay", user.email);
        setTxt("sidebarUserEmail", user.email);
    }

    if (bio) {
        setTxt("profileBioDisplay", `"${bio}"`);
        setVal("profileBioInput", bio);
    }
    if (fav) setVal("profileFavGenreInput", fav);

    if (banner) {
        const bI = el("profileBannerImg");
        const bP = el("profileBannerPreview");
        if (bI) bI.src = banner;
        if (bP) {
            bP.src = banner;
            bP.classList.remove("hidden");
        }
    }

    const sa = el("sidebarAvatar");
    if (sa) sa.innerHTML = "";

    if (avatar) {
        const aI = el("avatarImg");
        const abI = el("profileAvatarBigImg");
        const pP = el("profilePhotoPreview");
        if (aI) { aI.src = avatar; aI.classList.remove("hidden"); }
        el("avatarText")?.classList.add("hidden");
        if (abI) { abI.src = avatar; abI.classList.remove("hidden"); }
        el("profileAvatarBigText")?.classList.add("hidden");
        if (pP) { pP.src = avatar; pP.classList.remove("hidden"); }
        if (sa) {
            const img = document.createElement("img");
            img.src = avatar;
            sa.appendChild(img);
        }
    } else {
        setTxt("avatarText", letter);
        setTxt("profileAvatarBigText", letter);
        if (sa) sa.innerHTML = `<span>${letter}</span>`;
    }
}
async function loadUserProfile(user) {
    if (!user) return;
    try {
        const s = await get(ref(rtdb, "users/" + user.uid));
        if (s.exists()) {
            const data = s.val();
            if (data.name) setUserCache("name", data.name);
            if (data.bio) setUserCache("bio", data.bio);
            if (data.favGenre) setUserCache("fav_genre", data.favGenre);
            if (data.photo) setUserCache("avatar", data.photo);
            if (data.banner) setUserCache("banner", data.banner);
            if (data.themeColor) setUserCache("theme_color", data.themeColor);
            updateUserAvatarUI(data);
            if (data.themeColor && !isTVDevice()) {
                applyUserTheme(data.themeColor);
                const picker = el("themeColorPicker");
                if (picker) picker.value = data.themeColor;
            }
        } else {
            updateUserAvatarUI({});
        }
    } catch {
        updateUserAvatarUI({});
    }
}
el("btnSaveProfile")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    const tc = el("themeColorPicker")?.value || "#e50914";
    if (!isTVDevice()) applyUserTheme(tc);

    const n = el("profileNameInput")?.value.trim() || "";
    const b = el("profileBioInput")?.value.trim() || "";
    const fg = el("profileFavGenreInput")?.value || "Ação";
    const ph = el("profilePhotoPreview")?.src || "";
    const bn = el("profileBannerPreview")?.src || "";

    const data = {
        name: n,
        bio: b,
        favGenre: fg,
        photo: isValidImageUrl(ph) ? ph : "",
        banner: isValidImageUrl(bn) ? bn : "",
        themeColor: tc
    };

    try {
        await set(ref(rtdb, "users/" + user.uid), data);
        if (n) setUserCache("name", n);
        if (b) setUserCache("bio", b);
        if (fg) setUserCache("fav_genre", fg);
        if (data.photo) setUserCache("avatar", data.photo);
        if (data.banner) setUserCache("banner", data.banner);
        setUserCache("theme_color", tc);
        updateUserAvatarUI(data);
        showMsg("Salvo! ✅", "success");
        closeModal("profileModal");
    } catch (e) {
        showMsg("Erro: " + e.message, "error");
    }
});
el("btnChangePasswordFromProfile")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm(`Enviar link de redefinição para ${user.email}?`)) return;
    try {
        await sendPasswordResetEmail(auth, user.email);
        showMsg(`Link enviado para ${user.email}!`, "success");
    } catch (e) {
        showMsg("Erro: " + e.message, "error");
    }
});
async function handleLogout() {
    try {
        const user = auth.currentUser;
        if (user) {
            const deviceId = getOrCreateDeviceId();
            try { await remove(ref(rtdb, `devices/${user.uid}/${deviceId}`)); } catch {}
        }
        stopDeviceHeartbeat();
        currentUserUid = null;
        await signOut(auth);
        resetProfileUI();
        document.documentElement.style.setProperty("--primary-color", "#e50914");
        closeModal("profileModal");
        closeSidebar();
        mediaCatalog = [];
        isAdmin = false;
        renderApp();
        showMsg("Saiu! 👋", "success");
    } catch {
        showMsg("Erro ao sair!", "error");
    }
}
el("btnLogout")?.addEventListener("click", handleLogout);

/* ═══════════════════════════════════════════════
   DEVICES
═══════════════════════════════════════════════ */
function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = "dev_" + uid() + "_" + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}
function detectDeviceInfo() {
    const ua = navigator.userAgent;
    let type = "desktop", icon = "💻", name = "Desktop";
    if (/tablet|ipad/i.test(ua) && !/mobile/i.test(ua)) { type = "tablet"; icon = "📱"; name = "Tablet"; }
    else if (/mobile|android|iphone|ipod/i.test(ua)) { type = "mobile"; icon = "📱"; name = "Celular"; }
    else if (/smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(ua)) { type = "tv"; icon = "📺"; name = "Smart TV"; }

    let browser = "Navegador";
    if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
    else if (/firefox/i.test(ua)) browser = "Firefox";
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
    else if (/edg/i.test(ua)) browser = "Edge";
    else if (/opera|opr/i.test(ua)) browser = "Opera";

    let os = "OS Desconhecido";
    if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
    else if (/windows/i.test(ua)) os = "Windows";
    else if (/android/i.test(ua)) os = "Android";
    else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
    else if (/mac/i.test(ua)) os = "macOS";
    else if (/linux/i.test(ua)) os = "Linux";

    return { type, icon, name, browser, os };
}
async function registerCurrentDevice(user) {
    if (!user) return;
    const deviceId = getOrCreateDeviceId();
    const info = detectDeviceInfo();
    const data = {
        deviceId,
        type: info.type,
        icon: info.icon,
        name: info.name,
        browser: info.browser,
        os: info.os,
        userAgent: navigator.userAgent.substring(0, 200),
        firstLogin: Date.now(),
        lastActive: Date.now()
    };
    try {
        const snap = await get(ref(rtdb, `devices/${user.uid}/${deviceId}`));
        if (snap.exists()) data.firstLogin = snap.val().firstLogin || Date.now();
        await set(ref(rtdb, `devices/${user.uid}/${deviceId}`), data);
        startDeviceHeartbeat(user.uid, deviceId);
    } catch {}
}
function startDeviceHeartbeat(userId, deviceId) {
    stopDeviceHeartbeat();
    deviceHeartbeatInterval = setInterval(async () => {
        try { await set(ref(rtdb, `devices/${userId}/${deviceId}/lastActive`), Date.now()); } catch {}
    }, DEVICE_HEARTBEAT_MS);
}
function stopDeviceHeartbeat() {
    if (deviceHeartbeatInterval) {
        clearInterval(deviceHeartbeatInterval);
        deviceHeartbeatInterval = null;
    }
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
    } catch {}
}
el("btnOpenDevicesModal")?.addEventListener("click", () => {
    closeModal("profileModal");
    openDevicesModal();
});
el("btnCloseDevices")?.addEventListener("click", () => {
    closeModal("devicesModal");
    openModal("profileModal");
});
async function openDevicesModal() {
    openModal("devicesModal");
    const list = el("devicesList");
    const info = el("devicesInfoText");
    if (list) list.innerHTML = `<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto;width:32px;height:32px"></div></div>`;
    if (info) info.textContent = "Carregando dispositivos...";

    const user = auth.currentUser;
    if (!user) return;
    try {
        const snap = await get(ref(rtdb, `devices/${user.uid}`));
        const currentId = getOrCreateDeviceId();
        if (!snap.exists()) {
            if (list) list.innerHTML = `<p style="text-align:center;color:#666;padding:30px">Nenhum dispositivo</p>`;
            return;
        }

        const devices = Object.values(snap.val());
        devices.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
        if (info) info.textContent = `${devices.length} dispositivo(s) ativos`;

        list.innerHTML = "";
        devices.forEach(d => {
            const isCurrent = d.deviceId === currentId;
            const item = document.createElement("div");
            item.className = "device-item" + (isCurrent ? " current-device" : "");
            const lastSeen = d.lastActive ? timeAgo(d.lastActive) : "?";
            const firstDate = d.firstLogin ? new Date(d.firstLogin).toLocaleDateString("pt-BR") : "?";
            item.innerHTML = `
                <div class="device-icon-big">${d.icon || "📱"}</div>
                <div class="device-info">
                    <div class="device-name">${d.name || "Dispositivo"} ${isCurrent ? `<span class="device-current-tag">ESTE APARELHO</span>` : ""}</div>
                    <div class="device-meta">
                        <span>🌐 ${d.browser || "?"}</span>
                        <span>💻 ${d.os || "?"}</span>
                    </div>
                    <div class="device-meta" style="margin-top:1px">
                        <span>🕐 Ativo ${lastSeen}</span>
                        <span>📅 Desde ${firstDate}</span>
                    </div>
                </div>
                ${!isCurrent ? `<button type="button" class="device-remove-btn" data-remove-dev="${d.deviceId}" title="Encerrar sessão">✕</button>` : ""}
            `;
            list.appendChild(item);
        });

        list.querySelectorAll("[data-remove-dev]").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Encerrar sessão neste dispositivo?")) return;
                await removeDevice(user.uid, btn.dataset.removeDev);
                openDevicesModal();
                updateDevicesCountBadge();
                showMsg("Sessão encerrada!", "success");
            };
        });
    } catch (e) {
        if (list) list.innerHTML = `<p style="text-align:center;color:#ff5252;padding:20px">${e.message}</p>`;
    }
}
el("btnLogoutAllDevices")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm("Encerrar todas as outras sessões ativas?")) return;
    const currentId = getOrCreateDeviceId();
    await removeAllOtherDevices(user.uid, currentId);
    showMsg("Outras sessões encerradas!", "success");
    openDevicesModal();
    updateDevicesCountBadge();
});
async function updateDevicesCountBadge() {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const snap = await get(ref(rtdb, `devices/${user.uid}`));
        const count = snap.exists() ? Object.keys(snap.val()).length : 1;
        const badge = el("devicesCountBadge");
        if (badge) badge.textContent = count;
    } catch {}
}

/* ═══════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════ */
function clearAuthFields() {
    ["authEmail", "authPassword", "authDisplayName"].forEach(id => {
        const field = el(id);
        if (field) field.value = "";
    });
    const pw = el("authPassword");
    if (pw) pw.type = "password";
    const btn = el("btnTogglePassword");
    if (btn) btn.textContent = "👁️";
}
function updateAuthMode() {
    const modal = el("authModalBody");
    if (isSignUpMode) modal?.classList.add("signup-mode");
    else modal?.classList.remove("signup-mode");

    el("authSubtitle").innerText = isSignUpMode ? "Crie sua conta gratuita" : "Entre na sua conta para continuar";
    el("btnAuthSubmit").innerText = isSignUpMode ? "Criar Conta" : "Entrar na Conta";
    const toggle = el("toggleAuthMode");
    if (toggle) toggle.innerHTML = isSignUpMode
        ? 'Já tem conta? <span style="color:var(--primary-color)">Entrar</span>'
        : 'Não tem conta? <span style="color:var(--primary-color)">Crie agora</span>';
    clearAuthFields();
}
el("btnTogglePassword")?.addEventListener("click", () => {
    const pw = el("authPassword");
    if (!pw) return;
    const isPass = pw.type === "password";
    pw.type = isPass ? "text" : "password";
    el("btnTogglePassword").textContent = isPass ? "🙈" : "👁️";
});
el("toggleAuthMode")?.addEventListener("click", () => {
    isSignUpMode = !isSignUpMode;
    updateAuthMode();
});
el("btnForgotPassword")?.addEventListener("click", () => {
    closeModal("authOverlay");
    openModal("forgotPasswordModal");
});
el("btnBackToLogin")?.addEventListener("click", () => {
    closeModal("forgotPasswordModal");
    openModal("authOverlay");
});
el("btnCloseForgot")?.addEventListener("click", () => {
    closeModal("forgotPasswordModal");
    openModal("authOverlay");
});
el("btnForgotSuccessClose")?.addEventListener("click", () => {
    closeModal("forgotSuccessModal");
    openModal("authOverlay");
});
el("forgotPasswordForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const email = el("forgotEmail")?.value.trim().toLowerCase();
    if (!email) return showMsg("Digite seu e-mail!", "error");
    const btn = el("btnSendResetEmail");
    const old = btn?.innerText;
    if (btn) { btn.innerText = "⏳ Enviando..."; btn.disabled = true; }
    try {
        await sendPasswordResetEmail(auth, email);
        closeModal("forgotPasswordModal");
        el("forgotSuccessEmail").textContent = email;
        openModal("forgotSuccessModal");
    } catch (err) {
        showMsg(translateAuthError(err.code), "error");
    }
    if (btn) { btn.innerText = old; btn.disabled = false; }
});
el("authForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (authProcessing) return;
    authProcessing = true;

    const sb = el("btnAuthSubmit");
    const old = sb?.innerText;
    if (sb) { sb.innerText = "⏳ Aguarde..."; sb.disabled = true; }

    const email = el("authEmail")?.value.trim().toLowerCase();
    const pass = el("authPassword")?.value;
    const displayName = el("authDisplayName")?.value.trim() || "";

    if (!email || !pass || pass.length < 6) {
        showMsg("Preencha tudo! Senha mín. 6", "error");
        authProcessing = false;
        if (sb) { sb.innerText = old; sb.disabled = false; }
        return;
    }
    if (isSignUpMode && !displayName) {
        showMsg("Digite um nome de exibição!", "error");
        authProcessing = false;
        if (sb) { sb.innerText = old; sb.disabled = false; }
        return;
    }

    try {
        if (isSignUpMode) {
            if (auth.currentUser) await signOut(auth);
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(rtdb, "users/" + cred.user.uid), {
                name: displayName,
                bio: "",
                favGenre: "Ação",
                photo: "",
                banner: "",
                themeColor: "#e50914",
                createdAt: Date.now()
            });
            showMsg("Conta criada! ✅", "success");
        } else {
            if (auth.currentUser) await signOut(auth);
            await signInWithEmailAndPassword(auth, email, pass);
            showMsg("Bem-vindo! 🎬", "success");
        }
        closeModal("authOverlay");
        clearAuthFields();
    } catch (err) {
        showMsg(translateAuthError(err.code), "error");
    }

    authProcessing = false;
    if (sb) { sb.innerText = old; sb.disabled = false; }
});

/* ═══════════════════════════════════════════════
   MISC BUTTONS
═══════════════════════════════════════════════ */
el("btnOpenProfile")?.addEventListener("click", openProfileModal);
el("btnCloseProfile")?.addEventListener("click", () => closeModal("profileModal"));
el("btnCloseCreator")?.addEventListener("click", () => {
    if (confirm("Fechar sem salvar?")) {
        closeModal("creatorModal");
        resetCreator();
    }
});

/* ═══════════════════════════════════════════════
   GLOBAL ESC / BACK
═══════════════════════════════════════════════ */
document.addEventListener("keydown", e => {
    if (isPlayerOpen()) return;
    if (e.key === "Escape" || e.key === "GoBack" || e.keyCode === 10009) {
        const modals = [
            "devicesModal",
            "forgotPasswordModal",
            "forgotSuccessModal",
            "detailsModal",
            "profileModal",
            "adminModal",
            "creatorModal",
            "suggestionModal",
            "suggestionsAdminModal",
            "storageModal",
            "cropperModal"
        ];
        for (const id of modals) {
            const m = el(id);
            if (m && !m.classList.contains("hidden")) {
                closeModal(id);
                e.preventDefault();
                return;
            }
        }
        if (el("sidebarMenu")?.classList.contains("active")) {
            closeSidebar();
            e.preventDefault();
        }
    }
});

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
clearLegacyCache();
renderGenreSelector();
renderMovieSources();
renderSeasonsList();
setAudioBoost(100);

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUserUid = user.uid;
        resetProfileUI();
        closeModal("authOverlay");
        clearAuthFields();

        isAdmin = user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
        [
            "profileAdminBadge",
            "sidebarAdminItem",
            "sidebarCreatorItem",
            "sidebarSuggestionsAdminItem",
            "sidebarStorageItem"
        ].forEach(id => el(id)?.classList.toggle("hidden", !isAdmin));

        await loadUserProfile(user);
        await registerCurrentDevice(user);
        await Promise.all([loadCatalog(), loadTodayViews()]);
    } else {
        stopDeviceHeartbeat();
        currentUserUid = null;
        isAdmin = false;
        resetProfileUI();
        document.documentElement.style.setProperty("--primary-color", "#e50914");
        openModal("authOverlay");
        clearAuthFields();
        [
            "sidebarAdminItem",
            "sidebarCreatorItem",
            "sidebarSuggestionsAdminItem",
            "sidebarStorageItem",
            "profileAdminBadge"
        ].forEach(id => el(id)?.classList.add("hidden"));
        isSignUpMode = false;
        updateAuthMode();
    }
});
