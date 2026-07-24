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

// Player Vars
let currentVideoUrl = '';
let currentVideoTitle = '';
let currentVideoSub = '';

// Audio Booster
let audioContext = null;
let gainNode = null;
let audioSource = null;
let audioBoosterActive = false;

// ========== TV DETECTION ==========
function isTVDevice() {
    return /smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(navigator.userAgent.toLowerCase());
}

function isTV() {
    return isTVDevice() || (window.innerWidth >= 1920 && !('ontouchstart' in window));
}

function setupTVMode() {
    if (isTV()) {
        document.body.classList.add('tv-mode');
    }
    window.addEventListener('resize', () => {
        if (isTV()) document.body.classList.add('tv-mode');
        else document.body.classList.remove('tv-mode');
    });
}
setupTVMode();

// ========== HELPERS ==========
function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('hidden'); document.body.classList.add('modal-open'); }
}
function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('hidden'); document.body.classList.remove('modal-open'); }
}

function normalizeText(t) {
    if (!t) return '';
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function getPosterUrl(i) { return i.coverUrl || i.backdropUrl || ''; }
function getBackdropUrl(i) { return i.backdropUrl || i.coverUrl || ''; }
function getItemGenres(i) {
    if (Array.isArray(i.genres) && i.genres.length > 0) return i.genres;
    if (i.category) return [i.category];
    return [];
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
    m.className = type === 'success' ? 'msg-success' : 'msg-error';
    m.classList.remove('hidden');
    setTimeout(() => m.classList.add('hidden'), 4000);
}

function formatVideoUrl(u) {
    if (!u) return '';
    let f = u.trim();
    if (f.includes('mixdrop.')) {
        if (f.includes('/f/')) f = f.replace('/f/', '/e/');
        else if (!f.includes('/e/')) {
            const m = f.match(/(?:mixdrop\.[a-z]+)\/(?:e\/|f\/)?([a-zA-Z0-9]+)/);
            if (m && m[1]) f = `https://mixdrop.top/e/${m[1]}`;
        }
    }
    return f;
}

function formatBytes(b) {
    if (b === 0) return '0 B';
    const k = 1024;
    const s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
}
function estimateJsonBytes(obj) {
    try { return new Blob([JSON.stringify(obj)]).size; }
    catch (e) { return JSON.stringify(obj).length * 2; }
}
function translateAuthError(c) {
    const e = {
        'auth/email-already-in-use': 'E-mail já cadastrado!',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'Senha fraca (mínimo 6 caracteres).',
        'auth/user-not-found': 'Conta não encontrada.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde.',
        'auth/network-request-failed': 'Sem conexão com internet.'
    };
    return e[c] || `Erro: ${c}`;
}
function timeAgo(ts) {
    const d = Date.now() - ts;
    const min = Math.floor(d / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}m atrás`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h atrás`;
    const days = Math.floor(h / 24);
    if (days === 1) return 'ontem';
    return `${days}d atrás`;
}

// ========== USER CACHE ==========
function getUserCacheKey(key) {
    if (!currentUserUid) return null;
    return `mfx_${currentUserUid}_${key}`;
}
function setUserCache(key, value) {
    const k = getUserCacheKey(key);
    if (k && value) localStorage.setItem(k, value);
}
function getUserCache(key) {
    const k = getUserCacheKey(key);
    if (!k) return null;
    return localStorage.getItem(k);
}
function clearLegacyCache() {
    ['masterflix_user_name', 'masterflix_user_bio', 'masterflix_user_fav_genre',
     'masterflix_user_avatar', 'masterflix_user_banner'].forEach(k => localStorage.removeItem(k));
}
function applyUserTheme(c) {
    if (!c || isTVDevice()) return;
    document.documentElement.style.setProperty('--primary-color', c);
    localStorage.setItem('masterflix_theme_color', c);
    if (currentUserUid) setUserCache('theme_color', c);
}

if (!isTVDevice()) {
    const sc = localStorage.getItem('masterflix_theme_color');
    if (sc) document.documentElement.style.setProperty('--primary-color', sc);
}

window.onscroll = () => {
    const h = document.getElementById('mainHeader');
    if (h) {
        if (window.scrollY > 50) h.classList.add('scrolled');
        else h.classList.remove('scrolled');
    }
};

// ========== SIDEBAR ==========
function openSidebar() {
    document.getElementById('sidebarMenu').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.getElementById('menuToggleBtn').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeSidebar() {
    document.getElementById('sidebarMenu').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
    document.getElementById('menuToggleBtn').classList.remove('active');
    document.body.classList.remove('modal-open');
}

document.getElementById('menuToggleBtn').onclick = () => {
    if (document.getElementById('sidebarMenu').classList.contains('active')) closeSidebar();
    else openSidebar();
};
document.getElementById('sidebarCloseBtn').onclick = closeSidebar;
document.getElementById('sidebarOverlay').onclick = closeSidebar;

document.querySelectorAll('.sidebar-item').forEach(item => {
    item.onclick = () => {
        const a = item.dataset.nav;
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        if (['home', 'movies', 'series', 'continue'].includes(a)) item.classList.add('active');
        closeSidebar();
        if (a === 'home') { selectedCategory = "Todos"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if (a === 'movies') { selectedCategory = "Filmes"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 300, behavior: 'smooth' }); }
        else if (a === 'series') { selectedCategory = "Séries"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 300, behavior: 'smooth' }); }
        else if (a === 'continue') {
            const r = document.getElementById('continueRow');
            if (!r.classList.contains('hidden')) r.scrollIntoView({ behavior: 'smooth' });
            else showMsg('Nada em andamento!', 'error');
        }
        else if (a === 'suggestions') openModal('suggestionModal');
        else if (a === 'profile') openModal('profileModal');
        else if (a === 'admin') { renderAdminCatalogList(); openModal('adminModal'); }
        else if (a === 'creator') openCreator();
        else if (a === 'suggestionsAdmin') { loadSuggestionsAdmin(); openModal('suggestionsAdminModal'); }
        else if (a === 'storage') { loadStorageInfo(); openModal('storageModal'); }
        else if (a === 'logout') { if (confirm('Sair da conta?')) handleLogout(); }
    };
});

function updateCategoryChips() {
    document.querySelectorAll('.category-chip').forEach(c =>
        c.classList.toggle('active', c.dataset.cat === selectedCategory)
    );
}
document.querySelectorAll('.category-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedCategory = chip.dataset.cat;
        renderApp();
    };
});

// ========== GENRE SELECTOR ==========
function renderGenreSelector() {
    const c = document.getElementById('genreSelectorContainer');
    if (!c) return;
    c.innerHTML = '';
    AVAILABLE_GENRES.forEach(g => {
        const t = document.createElement('div');
        t.className = 'genre-tag';
        if (selectedGenres.includes(g)) t.classList.add('selected');
        t.textContent = g;
        t.onclick = () => {
            const i = selectedGenres.indexOf(g);
            if (i >= 0) selectedGenres.splice(i, 1);
            else selectedGenres.push(g);
            renderGenreSelector();
        };
        c.appendChild(t);
    });
    const ct = document.getElementById('genreCounter');
    if (ct) {
        if (selectedGenres.length === 0) {
            ct.textContent = '⚠️ Selecione ao menos 1';
            ct.style.color = '#ff9800';
        } else {
            ct.textContent = `✓ ${selectedGenres.length}: ${selectedGenres.join(', ')}`;
            ct.style.color = 'var(--primary-color)';
        }
    }
}

// ========== CROPPER ==========
window.triggerCropModal = function (inputId, previewId, ar) {
    const fi = document.getElementById(inputId);
    currentTargetPreview = document.getElementById(previewId);
    fi.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const tmp = new Image();
            tmp.onload = () => {
                if (tmp.naturalWidth <= 800 && tmp.naturalHeight <= 800) {
                    if (currentTargetPreview) {
                        currentTargetPreview.src = ev.target.result;
                        currentTargetPreview.classList.remove('hidden');
                    }
                    fi.value = "";
                    return;
                }
                document.getElementById('cropperImage').src = ev.target.result;
                if (!document.getElementById('profileModal').classList.contains('hidden')) {
                    previousModal = 'profileModal'; closeModal('profileModal');
                } else if (!document.getElementById('creatorModal').classList.contains('hidden')) {
                    previousModal = 'creatorModal'; closeModal('creatorModal');
                }
                openModal('cropperModal');
                if (cropperInstance) cropperInstance.destroy();
                cropperInstance = new Cropper(document.getElementById('cropperImage'), {
                    aspectRatio: ar || NaN, viewMode: 1, autoCropArea: 1, responsive: true,
                    crop() {
                        const cv = cropperInstance.getCroppedCanvas({ width: 800 });
                        if (cv) {
                            const u = cv.toDataURL('image/jpeg', 0.9);
                            document.getElementById('prevMobile').src = u;
                            document.getElementById('prevPC').src = u;
                            document.getElementById('prevTV').src = u;
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

document.getElementById('btnConfirmCrop').onclick = () => {
    if (!cropperInstance) return;
    const cv = cropperInstance.getCroppedCanvas({ width: 1200 });
    if (cv && currentTargetPreview) {
        currentTargetPreview.src = cv.toDataURL('image/jpeg', 0.92);
        currentTargetPreview.classList.remove('hidden');
    }
    closeModal('cropperModal');
    if (previousModal) openModal(previousModal);
    if (cropperInstance) cropperInstance.destroy();
};
document.getElementById('btnCloseCropper').onclick = () => {
    closeModal('cropperModal');
    if (previousModal) openModal(previousModal);
    if (cropperInstance) cropperInstance.destroy();
};

// ========== SEARCH PRO ==========
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchResultsDropdown');

document.getElementById('searchIconBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchBox.classList.contains('active')) {
        if (searchInput.value.trim() === '') searchBox.classList.remove('active');
    } else {
        searchBox.classList.add('active');
        setTimeout(() => searchInput.focus(), 250);
    }
});

searchInput.addEventListener('input', () => {
    const v = searchInput.value.trim();
    if (v.length > 0) {
        searchBox.classList.add('has-text');
        renderSearchDropdown(v);
    } else {
        searchBox.classList.remove('has-text');
        searchDropdown.classList.remove('visible');
    }
});

document.getElementById('searchClearBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    searchInput.value = '';
    searchBox.classList.remove('has-text');
    searchDropdown.classList.remove('visible');
    searchInput.focus();
});

function smartSearch(q) {
    const nq = normalizeText(q);
    if (!nq) return [];
    const sc = [];
    mediaCatalog.forEach(i => {
        const t = normalizeText(i.title);
        if (!t) return;
        let s = 0;
        if (t === nq) s = 10000;
        else if (t.startsWith(nq)) s = 1000 - t.length;
        else if (t.includes(nq)) s = 100 - t.length;
        else {
            // Busca por palavras
            const words = nq.split(' ');
            const matchCount = words.filter(w => t.includes(w)).length;
            if (matchCount > 0) s = matchCount * 20;
        }
        if (s > 0) sc.push({ item: i, score: s });
    });
    sc.sort((a, b) => b.score - a.score);
    return sc.slice(0, 10).map(s => s.item);
}

function highlightMatch(t, q) {
    const nt = normalizeText(t), nq = normalizeText(q);
    const i = nt.indexOf(nq);
    if (i === -1) return t;
    return t.substring(0, i) + '<mark>' + t.substring(i, i + q.length) + '</mark>' + t.substring(i + q.length);
}

function renderSearchDropdown(query) {
    const results = smartSearch(query);
    searchDropdown.innerHTML = '';

    if (results.length === 0) {
        searchDropdown.innerHTML = `
            <div class="search-no-results">
                <span class="search-empty-icon">🔍</span>
                <div>Nenhum resultado para "<strong>${query}</strong>"</div>
            </div>`;
    } else {
        searchDropdown.innerHTML = `<div class="search-results-header">🔍 ${results.length} resultado(s)</div>`;
        results.forEach(item => {
            const d = document.createElement('div');
            d.className = 'search-result-item';
            d.tabIndex = 0;
            const p = getPosterUrl(item) || 'https://via.placeholder.com/50x70?text=?';
            const tl = item.type === 'movie' ? 'Filme' : 'Série';
            const gs = getItemGenres(item);
            const genreText = gs.length > 0 ? gs.slice(0, 2).join(', ') : '';
            d.innerHTML = `
                <img class="search-result-thumb" src="${p}" loading="lazy" onerror="this.style.display='none'">
                <div class="search-result-info">
                    <div class="search-result-title">${highlightMatch(item.title, query)}</div>
                    <div class="search-result-meta">
                        <span class="type-badge">${tl}</span>
                        ${item.year ? '<span>' + item.year + '</span>' : ''}
                        ${genreText ? '<span>' + genreText + '</span>' : ''}
                    </div>
                </div>`;
            d.onclick = () => {
                searchDropdown.classList.remove('visible');
                searchInput.value = '';
                searchBox.classList.remove('has-text');
                window.location.hash = `#/midia/${item.id}`;
                openDetails(item);
            };
            d.onkeydown = (e) => { if (e.key === 'Enter') d.click(); };
            searchDropdown.appendChild(d);
        });
    }
    searchDropdown.classList.add('visible');
}

// Keyboard nav in search
searchInput.addEventListener('keydown', (e) => {
    const items = searchDropdown.querySelectorAll('.search-result-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[0]?.focus();
    }
});

searchDropdown.addEventListener('keydown', (e) => {
    const items = [...searchDropdown.querySelectorAll('.search-result-item')];
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && idx < items.length - 1) {
        e.preventDefault(); items[idx + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) items[idx - 1]?.focus();
        else searchInput.focus();
    } else if (e.key === 'Escape') {
        searchDropdown.classList.remove('visible');
        searchInput.focus();
    }
});

document.addEventListener('click', (e) => {
    if (!document.getElementById('searchWrapper').contains(e.target)) {
        searchDropdown.classList.remove('visible');
        if (searchInput.value.trim() === '') searchBox.classList.remove('active');
    }
});

// ========== HASH ROUTING ==========
function handleHashRouting() {
    const h = window.location.hash;
    if (h.startsWith('#/midia/')) {
        const id = h.replace('#/midia/', '');
        const i = mediaCatalog.find(m => m.id === id);
        if (i) openDetails(i);
    }
}
window.addEventListener('hashchange', handleHashRouting);

// ========== MEDIA TYPE SWITCH ==========
document.getElementById('mediaType').onchange = (e) => {
    const t = e.target.value;
    if (t === 'movie') {
        document.getElementById('movieFileArea').classList.remove('hidden');
        document.getElementById('seriesBuilderArea').classList.add('hidden');
        document.getElementById('mediaDurationLabel').innerText = "Duração (Ex: 2h 10m)";
    } else {
        document.getElementById('movieFileArea').classList.add('hidden');
        document.getElementById('seriesBuilderArea').classList.remove('hidden');
        document.getElementById('mediaDurationLabel').innerText = "Duração Média (Ex: 45m/ep)";
        if (seasonsBuilder.length === 0) addSeason();
    }
};

// ========== SEASONS BUILDER ==========
function renderSeasonsBuilder() {
    const c = document.getElementById('seasonsList');
    c.innerHTML = "";
    seasonsBuilder.forEach((s, si) => {
        const d = document.createElement('div');
        d.style.cssText = "background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin-top:14px;";
        d.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                <strong style="color:var(--primary-color);">Temporada ${si + 1}</strong>
                <button type="button" class="btn-secondary" onclick="addEpisode(${si})">+ EP</button>
            </div>
            <div class="input-group"><label>Foto Temporada</label>
                <div class="file-upload-box" onclick="triggerCropModal('seasonCoverFile_${si}','seasonCoverPrev_${si}',16/9)">
                    <span class="file-upload-label">📁</span>
                    <input type="file" id="seasonCoverFile_${si}" accept="image/*" class="hidden">
                    <img id="seasonCoverPrev_${si}" src="${s.seasonCoverUrl || ''}" class="file-preview-img ${s.seasonCoverUrl ? '' : 'hidden'}">
                </div>
            </div>
            <div id="episodesListBuilder_${si}"></div>`;
        c.appendChild(d);
        const el = d.querySelector(`#episodesListBuilder_${si}`);
        (s.episodes || []).forEach((ep, ei) => {
            const ed = document.createElement('div');
            ed.style.cssText = "background:#111;padding:12px;margin-top:10px;border-radius:8px;";
            ed.innerHTML = `
                <strong style="font-size:10px;color:#888;">EP ${ei + 1}</strong>
                <div class="input-group"><label>Título</label><input type="text" id="epTitle_${si}_${ei}" value="${ep.title || ''}"></div>
                <div class="input-group"><label>Duração</label><input type="text" id="epDuration_${si}_${ei}" value="${ep.duration || ''}"></div>
                <div class="input-group"><label>Thumb</label>
                    <div class="file-upload-box" onclick="triggerCropModal('epThumbFile_${si}_${ei}','epThumbPrev_${si}_${ei}',16/9)">
                        <span class="file-upload-label">📸</span>
                        <input type="file" id="epThumbFile_${si}_${ei}" accept="image/*" class="hidden">
                        <img id="epThumbPrev_${si}_${ei}" src="${ep.thumbUrl || ''}" class="file-preview-img ${ep.thumbUrl ? '' : 'hidden'}">
                    </div>
                </div>
                <div class="input-group"><label>Link Vídeo</label><input type="text" id="epVideoUrl_${si}_${ei}" value="${ep.videoUrl || ''}"></div>`;
            el.appendChild(ed);
        });
    });
}

function addSeason() {
    seasonsBuilder.push({
        seasonNumber: seasonsBuilder.length + 1, seasonCoverUrl: '',
        episodes: [{ title: 'Episódio 1', duration: '45m', videoUrl: '', thumbUrl: '' }]
    });
    renderSeasonsBuilder();
}
window.addEpisode = (si) => {
    seasonsBuilder[si].episodes.push({
        title: `Episódio ${seasonsBuilder[si].episodes.length + 1}`,
        duration: '45m', videoUrl: '', thumbUrl: ''
    });
    renderSeasonsBuilder();
};
document.getElementById('btnAddSeasonBtn').onclick = addSeason;

// ========== CATALOG ==========
async function loadCatalog() {
    try {
        const snap = await get(ref(rtdb, "catalog"));
        mediaCatalog = [];
        if (snap.exists()) {
            const d = snap.val();
            for (let k in d) {
                const i = { id: k, ...d[k] };
                if (!Array.isArray(i.genres)) i.genres = i.category ? [i.category] : [];
                mediaCatalog.push(i);
            }
        }
        renderApp();
        renderAdminCatalogList();
        handleHashRouting();
    } catch (e) {
        console.error("Erro carregar catálogo:", e);
        showMsg('Erro: ' + e.message, 'error');
    }
}

// ========== CONTINUE WATCHING ==========
function getContinueList() {
    if (!currentUserUid) return [];
    try { return JSON.parse(localStorage.getItem(`mfx_${currentUserUid}_continue`) || '[]'); }
    catch { return []; }
}
function saveContinueList(list) {
    if (!currentUserUid) return;
    localStorage.setItem(`mfx_${currentUserUid}_continue`, JSON.stringify(list));
}
function cleanExpiredContinue() {
    let list = getContinueList();
    const now = Date.now();
    const before = list.length;
    list = list.filter(item => (now - (item.lastWatched || 0)) < CONTINUE_EXPIRE_MS);
    if (list.length !== before) saveContinueList(list);
    return list;
}
function saveContinueWatching(mi, extra = '', episodeInfo = null) {
    if (!currentUserUid) return;
    let cl = getContinueList();
    cl = cl.filter(i => i.id !== mi.id);
    cl.unshift({
        id: mi.id, title: mi.title, type: mi.type,
        coverUrl: getBackdropUrl(mi) || getPosterUrl(mi),
        duration: mi.duration || extra || '',
        lastWatched: Date.now(), episodeInfo: episodeInfo
    });
    if (cl.length > 30) cl.pop();
    saveContinueList(cl);
    renderContinueWatching();
}
function removeContinueItem(id) {
    let cl = getContinueList();
    cl = cl.filter(i => i.id !== id);
    saveContinueList(cl);
    renderContinueWatching();
}
function getContinueInfo(id) {
    return getContinueList().find(i => i.id === id) || null;
}

function renderContinueWatching() {
    const cr = document.getElementById('continueRow');
    const cc = document.getElementById('continueCarousel');
    cc.innerHTML = "";
    if (!currentUserUid) { cr.classList.add('hidden'); return; }
    let list = cleanExpiredContinue();
    if (selectedCategory === "Filmes") list = list.filter(i => i.type === 'movie');
    else if (selectedCategory === "Séries") list = list.filter(i => i.type === 'serie');
    else if (selectedCategory !== "Todos") {
        list = list.filter(i => {
            const o = mediaCatalog.find(m => m.id === i.id);
            if (!o) return false;
            return getItemGenres(o).includes(selectedCategory);
        });
    }
    if (list.length === 0) { cr.classList.add('hidden'); return; }
    cr.classList.remove('hidden');
    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'continue-card';
        card.tabIndex = 0;
        const lastText = item.lastWatched ? timeAgo(item.lastWatched) : '';
        const epText = item.episodeInfo ? `<div class="continue-ep-badge">▶ ${item.episodeInfo}</div>` : '';
        card.innerHTML = `
            <img src="${item.coverUrl || 'https://via.placeholder.com/300x180?text=?'}" loading="lazy">
            <button class="continue-remove-btn" aria-label="Remover">✕</button>
            <div class="continue-play-icon">▶</div>
            <div class="continue-info">
                <div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.title}</div>
                ${epText}
                <div class="continue-duration">${lastText ? '🕐 ' + lastText : ''}</div>
            </div>`;
        card.querySelector('.continue-remove-btn').onclick = (e) => {
            e.stopPropagation();
            removeContinueItem(item.id);
            showMsg('Removido!', 'success');
        };
        card.onclick = () => {
            const o = mediaCatalog.find(m => m.id === item.id);
            if (o) openDetails(o);
        };
        card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
        cc.appendChild(card);
    });
}

// ========== RENDER APP ==========
function renderApp() {
    const mc = document.getElementById('moviesCarousel');
    const sc = document.getElementById('seriesCarousel');
    const mr = document.getElementById('moviesRow');
    const sr = document.getElementById('seriesRow');
    mc.innerHTML = ""; sc.innerHTML = "";

    if (selectedCategory === "Filmes") { mr.classList.remove('hidden'); sr.classList.add('hidden'); }
    else if (selectedCategory === "Séries") { mr.classList.add('hidden'); sr.classList.remove('hidden'); }
    else { mr.classList.remove('hidden'); sr.classList.remove('hidden'); }

    mediaCatalog.forEach(item => {
        if (!itemMatchesCategory(item, selectedCategory)) return;
        const card = document.createElement('div');
        card.className = 'media-card';
        card.tabIndex = 0;
        const ps = getPosterUrl(item);
        const gs = getItemGenres(item);
        const tg = gs.length > 0 ? gs[0] : (item.type === 'movie' ? 'Filme' : 'Série');
        if (ps) {
            card.innerHTML = `
                <img class="media-card-poster" src="${ps}" loading="lazy" onerror="this.parentElement.querySelector('.media-card-poster-fallback')?.classList.remove('hidden');this.style.display='none';">
                <div class="media-card-poster-fallback hidden" style="position:absolute;inset:0;">🎬</div>
                <div class="media-card-overlay">
                    <span class="media-card-tag">${tg}</span>
                    <div class="media-card-title">${item.title}</div>
                </div>`;
        } else {
            card.innerHTML = `
                <div class="media-card-poster-fallback">🎬</div>
                <div class="media-card-overlay">
                    <span class="media-card-tag">${tg}</span>
                    <div class="media-card-title">${item.title}</div>
                </div>`;
        }
        card.onclick = () => {
            window.location.hash = `#/midia/${item.id}`;
            openDetails(item);
        };
        card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
        if (item.type === 'movie') mc.appendChild(card);
        else sc.appendChild(card);
    });

    renderContinueWatching();
    if (mediaCatalog.length > 0 && !activeItem) setHero(mediaCatalog[0]);
}

function setHero(item) {
    activeItem = item;
    document.getElementById('heroTitle').innerText = item.title;
    document.getElementById('heroDesc').innerText = item.description || '';
    const gs = getItemGenres(item);
    const tl = item.type === 'movie' ? '🎬 FILME' : '📺 SÉRIE';
    document.getElementById('heroMeta').innerHTML = `
        <strong>${tl}</strong>
        ${item.year ? ` <span class="dot">•</span> ${item.year}` : ''}
        ${item.duration ? ` <span class="dot">•</span> ⏱️ ${item.duration}` : ''}
        ${gs.length > 0 ? ` <span class="dot">•</span> ${gs.slice(0, 3).join(', ')}` : ''}`;
    const bd = getBackdropUrl(item);
    if (bd) document.getElementById('heroBackdrop').style.backgroundImage = `url('${bd}')`;
    document.getElementById('heroPlayBtn').onclick = () => {
        if (item.type === 'movie' && item.videoUrl) {
            saveContinueWatching(item, item.duration || '');
            playVideo(item.videoUrl, item.title, 'Filme');
        } else openDetails(item);
    };
    document.getElementById('heroInfoBtn').onclick = () => openDetails(item);
}

// ========== DETAILS ==========
function openDetails(item) {
    activeItem = item;
    const bd = getBackdropUrl(item);
    const ba = document.getElementById('detailBackdropArea');
    if (bd) ba.style.backgroundImage = `url('${bd}')`;
    else ba.style.background = '#1a1a1a';

    const ps = getPosterUrl(item);
    const dp = document.getElementById('detailPoster');
    if (ps) { dp.src = ps; dp.style.display = 'block'; } else dp.style.display = 'none';

    document.getElementById('detailTitle').innerText = item.title;
    document.getElementById('detailMeta').innerText =
        `${item.type === 'movie' ? 'FILME' : 'SÉRIE'} • ${item.year || ''}${item.duration ? ' • ⏱️ ' + item.duration : ''}`;

    const gd = document.getElementById('detailGenres');
    gd.innerHTML = '';
    getItemGenres(item).forEach(g => {
        const b = document.createElement('span');
        b.style.cssText = 'padding:5px 14px;background:rgba(229,9,20,0.12);border:1px solid rgba(229,9,20,0.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary-color);text-transform:uppercase;';
        b.textContent = g;
        gd.appendChild(b);
    });
    document.getElementById('detailDesc').innerText = item.description || '';

    const continueInfo = getContinueInfo(item.id);
    const contentArea = document.getElementById('detailsContentArea');

    if (item.type === 'movie') {
        document.getElementById('detailMovieArea').classList.remove('hidden');
        document.getElementById('detailSerieArea').classList.add('hidden');
        const btnPlay = document.getElementById('btnPlayMovieFile');
        btnPlay.innerText = continueInfo ? '▶ Continuar Assistindo' : '▶ Assistir Filme';
        btnPlay.onclick = () => {
            saveContinueWatching(item, item.duration || '');
            playVideo(item.videoUrl, item.title, 'Filme');
        };
        openModal('detailsModal');
        contentArea.scrollTop = 0;
        setTimeout(() => btnPlay.focus(), 150);
    } else {
        document.getElementById('detailMovieArea').classList.add('hidden');
        document.getElementById('detailSerieArea').classList.remove('hidden');
        const tabs = document.getElementById('seasonTabs');
        tabs.innerHTML = "";

        let resumeSeasonIdx = 0, resumeEpIdx = -1;
        if (continueInfo && continueInfo.episodeInfo) {
            const match = continueInfo.episodeInfo.match(/T(\d+)\s*E(\d+)/i);
            if (match) {
                resumeSeasonIdx = parseInt(match[1]) - 1;
                resumeEpIdx = parseInt(match[2]) - 1;
            }
        }

        (item.seasons || []).forEach((s, idx) => {
            const tab = document.createElement('div');
            tab.className = `season-tab ${idx === resumeSeasonIdx ? 'active' : ''}`;
            tab.innerText = `T${idx + 1}`;
            tab.tabIndex = 0;
            tab.onclick = () => {
                document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                if (s.seasonCoverUrl && s.seasonCoverUrl.trim())
                    ba.style.backgroundImage = `url('${s.seasonCoverUrl}')`;
                else ba.style.backgroundImage = bd ? `url('${bd}')` : '';
                renderEpisodesList(s.episodes || [], idx, s, item, idx === resumeSeasonIdx ? resumeEpIdx : -1);
            };
            tab.onkeydown = (e) => {
                if (e.key === 'Enter') tab.click();
                else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = tab.nextElementSibling;
                    if (next) { next.focus(); next.click(); }
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prev = tab.previousElementSibling;
                    if (prev) { prev.focus(); prev.click(); }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const firstEp = document.querySelector('#episodesListContainer .episode-card');
                    if (firstEp) firstEp.focus();
                }
            };
            tabs.appendChild(tab);
        });

        if (item.seasons && item.seasons.length > 0) {
            const targetIdx = item.seasons[resumeSeasonIdx] ? resumeSeasonIdx : 0;
            const targetSeason = item.seasons[targetIdx];
            if (targetSeason.seasonCoverUrl && targetSeason.seasonCoverUrl.trim())
                ba.style.backgroundImage = `url('${targetSeason.seasonCoverUrl}')`;
            renderEpisodesList(
                targetSeason.episodes || [], targetIdx, targetSeason, item,
                targetIdx === resumeSeasonIdx ? resumeEpIdx : -1
            );
        }

        openModal('detailsModal');
        contentArea.scrollTop = 0;

        // Scroll tabs to active
        setTimeout(() => {
            const activeTab = document.querySelector('.season-tab.active');
            if (activeTab) {
                activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                activeTab.focus();
            }
        }, 200);
    }
}

function renderEpisodesList(eps, si, sd, ser, resumeEpIdx) {
    const c = document.getElementById('episodesListContainer');
    c.innerHTML = "";
    const fallbackImage = (sd && sd.seasonCoverUrl && sd.seasonCoverUrl.trim() !== '')
        ? sd.seasonCoverUrl
        : (getBackdropUrl(ser) || getPosterUrl(ser) || 'https://via.placeholder.com/150x90?text=?');

    eps.forEach((ep, idx) => {
        const d = document.createElement('div');
        d.className = 'episode-card';
        d.tabIndex = 0;
        const th = (ep.thumbUrl && ep.thumbUrl.trim() !== '') ? ep.thumbUrl : fallbackImage;
        const dur = ep.duration ? `<span style="color:#888;font-size:10px;margin-left:6px;">⏱️ ${ep.duration}</span>` : '';
        const epLabel = `T${si + 1} E${idx + 1}`;
        const isResumePoint = (idx === resumeEpIdx);
        const resumeBadge = isResumePoint ? `<div class="ep-resume-badge">⏳ Onde parou</div>` : '';

        d.onclick = () => {
            closeModal('detailsModal');
            saveContinueWatching(activeItem, ep.duration || '', `${epLabel} - ${ep.title || ''}`);
            playVideo(ep.videoUrl, activeItem.title, `${epLabel} - ${ep.title}`);
        };
        d.onkeydown = (e) => {
            if (e.key === 'Enter') d.click();
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = d.nextElementSibling;
                if (next) next.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = d.previousElementSibling;
                if (prev) prev.focus();
                else {
                    const activeTab = document.querySelector('.season-tab.active');
                    if (activeTab) activeTab.focus();
                }
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const tabs = document.querySelectorAll('.season-tab');
                const activeTab = document.querySelector('.season-tab.active');
                if (activeTab) {
                    const tabArr = [...tabs];
                    const ci = tabArr.indexOf(activeTab);
                    let ni = e.key === 'ArrowRight' ? ci + 1 : ci - 1;
                    if (ni >= 0 && ni < tabArr.length) {
                        tabArr[ni].focus();
                        tabArr[ni].click();
                    }
                }
            }
        };
        d.innerHTML = `
            <div class="episode-thumb">
                <img src="${th}" loading="lazy" onerror="this.src='${fallbackImage}'">
                <div class="ep-play-overlay"><span>▶</span></div>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:800;">${epLabel} - ${ep.title || 'Sem Título'}${dur}</div>
                <span style="font-size:11px;color:var(--primary-color);font-weight:700;">▶ ${isResumePoint ? 'Continuar' : 'Assistir'}</span>
                ${resumeBadge}
            </div>`;
        if (isResumePoint) {
            d.style.border = '1.5px solid rgba(255,202,40,0.35)';
            d.style.background = 'rgba(255,202,40,0.04)';
        }
        c.appendChild(d);
    });

    if (resumeEpIdx >= 0) {
        setTimeout(() => {
            const cards = c.querySelectorAll('.episode-card');
            if (cards[resumeEpIdx]) {
                cards[resumeEpIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 150);
    }
}

document.getElementById('btnCloseDetails').onclick = () => {
    window.location.hash = '';
    closeModal('detailsModal');
};

// ========== AUDIO BOOSTER (Web Audio API) ==========
function initAudioBooster() {
    if (audioContext) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
        gainNode.gain.value = 1.0;
    } catch (e) {
        console.warn('AudioContext not available:', e);
    }
}

function applyAudioBoost(value) {
    // value: 100 = normal, 600 = 6x boost
    const multiplier = value / 100;
    if (gainNode) {
        gainNode.gain.value = multiplier;
    }
    // Also try to boost iframe audio via postMessage (limited)
    const iframe = document.querySelector('#playerContainerView iframe');
    if (iframe) {
        try {
            // For same-origin iframes we could access contentWindow
            // For cross-origin, we use the Web Audio approach on page-level audio
        } catch (e) { }
    }
    document.getElementById('audioBoosterValue').textContent = value + '%';
    const label = document.querySelector('.audio-booster-label');
    if (value > 100) {
        label.textContent = '🔊';
        document.getElementById('audioBoosterValue').style.color =
            value > 300 ? '#ff5252' : value > 200 ? '#ff9800' : 'var(--primary-color)';
    } else {
        label.textContent = '🔈';
        document.getElementById('audioBoosterValue').style.color = 'var(--primary-color)';
    }
}

document.getElementById('audioBoosterSlider').addEventListener('input', (e) => {
    initAudioBooster();
    applyAudioBoost(parseInt(e.target.value));
});

// Create a hidden audio element that captures page audio
function setupPageAudioCapture() {
    initAudioBooster();
    if (!audioContext) return;

    // We'll intercept any audio/video elements on the page
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                    try {
                        if (!node._boosted) {
                            const source = audioContext.createMediaElementSource(node);
                            source.connect(gainNode);
                            node._boosted = true;
                        }
                    } catch (e) { }
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ========== PLAYER ==========
const playerBox = document.getElementById('playerModalBox');
const playerControls = document.getElementById('playerControlsTop');
const playerContainer = document.getElementById('playerContainerView');
const playerLoading = document.getElementById('playerLoading');

function isPlayerOpen() {
    return !document.getElementById('playerModal').classList.contains('hidden');
}
function isInFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function showPlayerControls() {
    if (!isPlayerOpen()) return;
    playerControls.classList.remove('is-hidden');
    playerBox.classList.remove('cursor-hidden');
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
    controlsHideTimer = setTimeout(() => playerControls.classList.add('is-hidden'), 4000);
    if (!('ontouchstart' in window)) {
        cursorHideTimer = setTimeout(() => playerBox.classList.add('cursor-hidden'), 3500);
    }
}

playerBox.addEventListener('mousemove', showPlayerControls);
playerBox.addEventListener('touchstart', showPlayerControls, { passive: true });
['fullscreenchange', 'webkitfullscreenchange'].forEach(e => {
    document.addEventListener(e, () => { if (isPlayerOpen()) showPlayerControls(); });
});

document.getElementById('btnToggleFullscreen').onclick = (e) => {
    e.stopPropagation();
    if (!isInFullscreen()) {
        if (playerBox.requestFullscreen) playerBox.requestFullscreen();
        else if (playerBox.webkitRequestFullscreen) playerBox.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    showPlayerControls();
};

document.getElementById('btnToggleStretch').onclick = (e) => {
    e.stopPropagation();
    playerContainer.classList.toggle('stretch-mode');
    showMsg(playerContainer.classList.contains('stretch-mode') ? '📐 Modo Esticado' : '🖼️ Modo Normal', 'success');
    showPlayerControls();
};

document.getElementById('btnReloadPlayer').onclick = (e) => {
    e.stopPropagation();
    if (!currentVideoUrl) return;
    const iframe = playerContainer.querySelector('iframe');
    if (iframe) {
        const src = iframe.src;
        iframe.src = '';
        setTimeout(() => { iframe.src = src; }, 100);
    }
    playerLoading.classList.remove('hidden');
    setTimeout(() => playerLoading.classList.add('hidden'), 2000);
    showMsg('Recarregando...', 'success');
};

function playVideo(rawUrl, mainTitle, subTitle) {
    if (!rawUrl) { showMsg('Sem link de vídeo!', 'error'); return; }
    const url = formatVideoUrl(rawUrl);
    currentVideoUrl = url;
    currentVideoTitle = mainTitle;
    currentVideoSub = subTitle;

    document.getElementById('playerTitleDisplay').innerText = mainTitle || 'Assistindo';
    document.getElementById('playerSubDisplay').innerText = subTitle || 'MasterFlix';

    const old = playerContainer.querySelector('iframe');
    if (old) old.remove();
    playerContainer.classList.remove('stretch-mode');
    playerLoading.classList.remove('hidden');

    // Reset audio booster
    document.getElementById('audioBoosterSlider').value = 100;
    applyAudioBoost(100);

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms allow-orientation-lock');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('webkitallowfullscreen', 'true');
    iframe.setAttribute('mozallowfullscreen', 'true');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('scrolling', 'no');
    iframe.onload = () => setTimeout(() => playerLoading.classList.add('hidden'), 500);
    playerContainer.appendChild(iframe);

    openModal('playerModal');
    showPlayerControls();
    setupPageAudioCapture();

    // Show tip
    setTimeout(() => {
        const tip = document.getElementById('playerTip');
        if (tip && isPlayerOpen()) {
            tip.classList.add('show');
            setTimeout(() => tip.classList.remove('show'), 5000);
        }
    }, 3000);

    setTimeout(() => playerLoading.classList.add('hidden'), 6000);
}

function closePlayer() {
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
    if (isInFullscreen()) {
        try { document.exitFullscreen(); } catch (e) { }
    }
    const iframe = playerContainer.querySelector('iframe');
    if (iframe) iframe.remove();
    playerContainer.classList.remove('stretch-mode');
    playerLoading.classList.remove('hidden');
    closeModal('playerModal');
    playerBox.classList.remove('cursor-hidden');
    playerControls.classList.remove('is-hidden');
    currentVideoUrl = '';
    renderContinueWatching();

    // Reset audio
    if (gainNode) gainNode.gain.value = 1.0;
    document.getElementById('audioBoosterSlider').value = 100;
    document.getElementById('audioBoosterValue').textContent = '100%';
}

document.getElementById('btnClosePlayer').onclick = (e) => {
    e.stopPropagation();
    closePlayer();
};

// Keyboard shortcuts in player
document.addEventListener('keydown', (e) => {
    if (!isPlayerOpen()) return;
    if (e.key === 'Escape') { closePlayer(); return; }
    if (e.key === 'f' || e.key === 'F') document.getElementById('btnToggleFullscreen').click();
    if (e.key === 's' || e.key === 'S') document.getElementById('btnToggleStretch').click();
    if (e.key === 'r' || e.key === 'R') document.getElementById('btnReloadPlayer').click();
    // Volume up/down with arrow keys
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        const slider = document.getElementById('audioBoosterSlider');
        slider.value = Math.min(600, parseInt(slider.value) + 20);
        initAudioBooster();
        applyAudioBoost(parseInt(slider.value));
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const slider = document.getElementById('audioBoosterSlider');
        slider.value = Math.max(100, parseInt(slider.value) - 20);
        initAudioBooster();
        applyAudioBoost(parseInt(slider.value));
    }
    showPlayerControls();
});

// ========== FORM SUBMIT ==========
document.getElementById('mediaForm').onsubmit = async (e) => {
    e.preventDefault();
    if (selectedGenres.length === 0) { showMsg('Selecione 1 gênero!', 'error'); return; }
    const editId = document.getElementById('editMediaId').value;
    const type = document.getElementById('mediaType').value;
    let cv = document.getElementById('mediaCoverPreview').src;
    let bd = document.getElementById('mediaBackdropPreview').src;
    if ((!cv || cv.includes('window.location')) && editId) {
        const ex = mediaCatalog.find(m => m.id === editId);
        if (ex) cv = ex.coverUrl;
    }
    if ((!bd || bd.includes('window.location')) && editId) {
        const ex = mediaCatalog.find(m => m.id === editId);
        if (ex) bd = ex.backdropUrl;
    }
    let payload = {
        type, genres: [...selectedGenres], category: selectedGenres[0],
        title: document.getElementById('mediaTitle').value.trim(),
        year: document.getElementById('mediaYear').value.trim(),
        duration: document.getElementById('mediaDuration').value.trim(),
        description: document.getElementById('mediaDesc').value.trim(),
        coverUrl: (cv && !cv.includes('window.location')) ? cv : '',
        backdropUrl: (bd && !bd.includes('window.location')) ? bd : ''
    };
    if (type === 'movie') {
        payload.videoUrl = document.getElementById('movieVideoUrl').value.trim();
    } else {
        const us = [];
        for (let si = 0; si < seasonsBuilder.length; si++) {
            const s = seasonsBuilder[si];
            let sc = document.getElementById(`seasonCoverPrev_${si}`)?.src || (s.seasonCoverUrl || '');
            if (sc.includes('window.location')) sc = '';
            const ue = [];
            for (let ei = 0; ei < (s.episodes || []).length; ei++) {
                let et = document.getElementById(`epThumbPrev_${si}_${ei}`)?.src || (s.episodes[ei].thumbUrl || '');
                if (et.includes('window.location')) et = '';
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
        showMsg('Salvo com sucesso! ✅', 'success');
        closeModal('creatorModal');
        document.getElementById('mediaForm').reset();
        seasonsBuilder = []; selectedGenres = [];
        await loadCatalog();
    } catch (err) { showMsg('Erro: ' + err.message, 'error'); }
};

// ========== ADMIN ==========
window.editMedia = (id) => {
    const i = mediaCatalog.find(m => m.id === id);
    if (!i) return;
    document.getElementById('editMediaId').value = i.id;
    const ts = document.getElementById('mediaType');
    ts.value = i.type; ts.disabled = true; ts.dispatchEvent(new Event('change'));
    selectedGenres = Array.isArray(i.genres) && i.genres.length > 0
        ? [...i.genres] : (i.category ? [i.category] : []);
    renderGenreSelector();
    document.getElementById('mediaTitle').value = i.title;
    document.getElementById('mediaYear').value = i.year;
    document.getElementById('mediaDuration').value = i.duration || '';
    document.getElementById('mediaDesc').value = i.description;
    document.getElementById('movieVideoUrl').value = i.videoUrl || '';
    if (i.coverUrl) {
        document.getElementById('mediaCoverPreview').src = i.coverUrl;
        document.getElementById('mediaCoverPreview').classList.remove('hidden');
    }
    if (i.backdropUrl) {
        document.getElementById('mediaBackdropPreview').src = i.backdropUrl;
        document.getElementById('mediaBackdropPreview').classList.remove('hidden');
    }
    document.getElementById('creatorTitle').innerText = "Editar";
    if (i.type === 'serie') {
        seasonsBuilder = JSON.parse(JSON.stringify(i.seasons || []));
        renderSeasonsBuilder();
    }
    closeModal('adminModal');
    openModal('creatorModal');
};

window.deleteMedia = async (id) => {
    if (confirm("Tem certeza que deseja apagar?")) {
        try {
            await remove(ref(rtdb, "catalog/" + id));
            showMsg('Removido! ✅', 'success');
            loadCatalog();
        } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
    }
};

function renderAdminCatalogList() {
    const c = document.getElementById('adminCatalogList');
    if (!c) return;
    const sv = normalizeText(document.getElementById('adminSearchInput')?.value || '');
    c.innerHTML = "";
    mediaCatalog.forEach(i => {
        if (sv && !normalizeText(i.title).includes(sv)) return;
        const d = document.createElement('div');
        d.className = 'admin-item';
        d.innerHTML = `
            <div>
                <strong>${i.title}</strong>
                <div style="font-size:10px;color:#888;">${i.type === 'movie' ? 'Filme' : 'Série'}${i.year ? ' • ' + i.year : ''}</div>
            </div>
            <div style="display:flex;gap:6px;">
                <button class="btn-secondary" onclick="editMedia('${i.id}')">✏️</button>
                <button class="btn-danger" onclick="deleteMedia('${i.id}')">🗑️</button>
            </div>`;
        c.appendChild(d);
    });
}
document.getElementById('adminSearchInput').oninput = renderAdminCatalogList;
document.getElementById('btnCloseAdmin').onclick = () => closeModal('adminModal');
document.getElementById('btnAddNewFromAdmin').onclick = () => { closeModal('adminModal'); openCreator(); };

function openCreator() {
    document.getElementById('editMediaId').value = "";
    document.getElementById('mediaForm').reset();
    const ts = document.getElementById('mediaType');
    ts.disabled = false; ts.dispatchEvent(new Event('change'));
    document.getElementById('mediaCoverPreview').classList.add('hidden');
    document.getElementById('mediaBackdropPreview').classList.add('hidden');
    document.getElementById('creatorTitle').innerText = "Publicar";
    seasonsBuilder = []; selectedGenres = [];
    renderGenreSelector();
    document.getElementById('seasonsList').innerHTML = "";
    addSeason();
    openModal('creatorModal');
}

// ========== SUGGESTIONS ==========
document.getElementById('btnCloseSuggestion').onclick = () => closeModal('suggestionModal');
document.getElementById('btnSendSuggestion').onclick = async () => {
    const user = auth.currentUser;
    if (!user) { showMsg('Faça login!', 'error'); return; }
    const text = document.getElementById('suggestionText').value.trim();
    const type = document.getElementById('suggestionType').value;
    if (!text || text.length < 5) { showMsg('Escreva algo válido!', 'error'); return; }
    try {
        const userName = getUserCache('name') || user.email.split('@')[0];
        await set(push(ref(rtdb, "suggestions")), {
            userId: user.uid, userEmail: user.email, userName,
            text, type, timestamp: Date.now()
        });
        document.getElementById('suggestionText').value = '';
        showMsg('Enviado! ✅', 'success');
        closeModal('suggestionModal');
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
};

// ========== SUGGESTIONS ADMIN ==========
document.getElementById('btnCloseSuggestionsAdmin').onclick = () => {
    exitSelectMode(); closeModal('suggestionsAdminModal');
};
async function loadSuggestionsAdmin() {
    try {
        const snap = await get(ref(rtdb, "suggestions"));
        allSuggestions = [];
        if (snap.exists()) {
            const d = snap.val();
            for (let k in d) allSuggestions.push({ id: k, ...d[k] });
        }
        allSuggestions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        document.getElementById('suggestionsCountText').textContent = `${allSuggestions.length} item(s)`;
        renderSuggestionsList();
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
}
function renderSuggestionsList() {
    const c = document.getElementById('suggestionsAdminList');
    c.innerHTML = '';
    if (allSuggestions.length === 0) {
        c.innerHTML = '<p style="text-align:center;color:#666;padding:30px;">Nenhuma sugestão.</p>';
        return;
    }
    allSuggestions.forEach(s => {
        const d = document.createElement('div');
        d.className = 'suggestion-box';
        const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString('pt-BR') : '?';
        const cb = suggestionsSelectMode
            ? `<input type="checkbox" class="suggestion-checkbox" data-id="${s.id}" ${selectedSuggestionIds.has(s.id) ? 'checked' : ''}>` : '';
        const del = !suggestionsSelectMode
            ? `<button class="btn-danger" onclick="deleteSingleSuggestion('${s.id}')">🗑️</button>` : '';
        const badge = s.type === 'bug' ? '🐛 BUG' : '💡 SUG';
        d.innerHTML = `
            <div class="sg-header">
                <div style="display:flex;align-items:center;gap:8px;">
                    ${cb}
                    <div>
                        <div class="sg-user">${s.userName || '?'} ${badge}</div>
                        <div class="sg-email">${s.userEmail || ''}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="sg-date">${date}</span>${del}
                </div>
            </div>
            <div class="sg-text">${s.text}</div>`;
        if (suggestionsSelectMode) {
            const chk = d.querySelector('.suggestion-checkbox');
            if (chk) chk.onchange = () => {
                if (chk.checked) selectedSuggestionIds.add(s.id);
                else selectedSuggestionIds.delete(s.id);
            };
        }
        c.appendChild(d);
    });
}

function enterSelectMode() {
    suggestionsSelectMode = true; selectedSuggestionIds.clear();
    document.getElementById('btnToggleSelectMode').classList.add('hidden');
    document.getElementById('btnDeleteSelectedSuggestions').classList.remove('hidden');
    document.getElementById('btnSelectAllSuggestions').classList.remove('hidden');
    document.getElementById('btnCancelSelectMode').classList.remove('hidden');
    renderSuggestionsList();
}
function exitSelectMode() {
    suggestionsSelectMode = false; selectedSuggestionIds.clear();
    document.getElementById('btnToggleSelectMode').classList.remove('hidden');
    document.getElementById('btnDeleteSelectedSuggestions').classList.add('hidden');
    document.getElementById('btnSelectAllSuggestions').classList.add('hidden');
    document.getElementById('btnCancelSelectMode').classList.add('hidden');
    renderSuggestionsList();
}
document.getElementById('btnToggleSelectMode').onclick = enterSelectMode;
document.getElementById('btnCancelSelectMode').onclick = exitSelectMode;
document.getElementById('btnSelectAllSuggestions').onclick = () => {
    if (selectedSuggestionIds.size === allSuggestions.length) selectedSuggestionIds.clear();
    else allSuggestions.forEach(s => selectedSuggestionIds.add(s.id));
    renderSuggestionsList();
};
document.getElementById('btnDeleteSelectedSuggestions').onclick = async () => {
    if (selectedSuggestionIds.size === 0) return;
    if (!confirm(`Apagar ${selectedSuggestionIds.size} item(s)?`)) return;
    try {
        for (let id of selectedSuggestionIds) await remove(ref(rtdb, "suggestions/" + id));
        showMsg('Apagado! ✅', 'success');
        exitSelectMode();
        loadSuggestionsAdmin();
    } catch (e) { showMsg('Erro', 'error'); }
};
window.deleteSingleSuggestion = async (id) => {
    if (!confirm('Apagar esta sugestão?')) return;
    try { await remove(ref(rtdb, "suggestions/" + id)); loadSuggestionsAdmin(); }
    catch (e) { showMsg('Erro', 'error'); }
};

// ========== STORAGE ==========
document.getElementById('btnCloseStorage').onclick = () => closeModal('storageModal');
async function loadStorageInfo() {
    const c = document.getElementById('storageContent');
    c.innerHTML = '<p style="text-align:center;color:#888;">⏳ Calculando...</p>';
    try {
        const [catalogSnap, usersSnap, suggestionsSnap] = await Promise.all([
            get(ref(rtdb, "catalog")).catch(() => null),
            get(ref(rtdb, "users")).catch(() => null),
            get(ref(rtdb, "suggestions")).catch(() => null)
        ]);
        const catalogData = catalogSnap && catalogSnap.exists() ? catalogSnap.val() : {};
        const usersData = usersSnap && usersSnap.exists() ? usersSnap.val() : {};
        const suggestionsData = suggestionsSnap && suggestionsSnap.exists() ? suggestionsSnap.val() : {};

        const cb = estimateJsonBytes(catalogData);
        const ub = estimateJsonBytes(usersData);
        const sb = estimateJsonBytes(suggestionsData);
        const tb = cb + ub + sb;

        const cc = Object.keys(catalogData).length;
        const uc = Object.keys(usersData).length;
        const scc = Object.keys(suggestionsData).length;

        const pct = Math.min(100, (tb / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100);
        let bc = '#4caf50';
        if (pct > 70) bc = '#ff9800';
        if (pct > 90) bc = '#f44336';

        c.innerHTML = `
            <div style="margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="font-weight:800;">Uso Total</span>
                    <span style="color:${bc};font-weight:800;">${pct.toFixed(2)}%</span>
                </div>
                <div class="storage-bar-outer">
                    <div class="storage-bar-inner" style="width:${pct}%;background:${bc};"></div>
                </div>
                <div class="storage-info">
                    <span>${formatBytes(tb)} usado</span>
                    <span>${formatBytes(FIREBASE_RTDB_FREE_LIMIT_BYTES)} limite</span>
                </div>
            </div>
            <h4 style="font-size:12px;font-weight:800;margin-bottom:12px;color:var(--primary-color);">📊 Detalhamento</h4>
            <div class="storage-detail-item"><span class="storage-label">🎬 Catálogo (${cc})</span><span class="storage-value">${formatBytes(cb)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">👤 Usuários (${uc})</span><span class="storage-value">${formatBytes(ub)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">💡 Sugestões (${scc})</span><span class="storage-value">${formatBytes(sb)}</span></div>
            <div class="storage-detail-item" style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-top:8px;">
                <span class="storage-label" style="font-weight:800;color:#fff;">TOTAL</span>
                <span class="storage-value" style="color:${bc};">${formatBytes(tb)}</span>
            </div>
            <p style="font-size:10px;color:#666;text-align:center;margin-top:16px;">Firebase RTDB — Plano Grátis</p>`;
    } catch (e) {
        c.innerHTML = `
            <div style="text-align:center;padding:24px;">
                <p style="color:#ff5252;font-size:14px;margin-bottom:10px;">❌ Erro ao carregar</p>
                <p style="color:#888;font-size:11px;">${e.message}</p>
            </div>`;
    }
}

// ========== PROFILE ==========
document.getElementById('btnSaveProfile').onclick = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const themeColor = document.getElementById('themeColorPicker').value;
    if (!isTVDevice()) applyUserTheme(themeColor);
    const n = document.getElementById('profileNameInput').value.trim();
    const b = document.getElementById('profileBioInput').value.trim();
    const fg = document.getElementById('profileFavGenreInput').value;
    const ph = document.getElementById('profilePhotoPreview').src;
    const bn = document.getElementById('profileBannerPreview').src;
    const data = {
        name: n || '', bio: b || '', favGenre: fg,
        photo: (ph && !ph.includes('window.location')) ? ph : '',
        banner: (bn && !bn.includes('window.location')) ? bn : '',
        themeColor
    };
    try {
        await set(ref(rtdb, "users/" + user.uid), data);
        if (n) setUserCache('name', n);
        if (b) setUserCache('bio', b);
        if (fg) setUserCache('fav_genre', fg);
        if (data.photo) setUserCache('avatar', data.photo);
        if (data.banner) setUserCache('banner', data.banner);
        setUserCache('theme_color', themeColor);
        updateUserAvatarUI(data);
        showMsg('Perfil salvo! ✅', 'success');
        closeModal('profileModal');
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
};

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
            if (data.themeColor && !isTVDevice()) {
                applyUserTheme(data.themeColor);
                document.getElementById('themeColorPicker').value = data.themeColor;
            }
        } else { updateUserAvatarUI({}); }
    } catch (e) { console.error(e); updateUserAvatarUI({}); }
}

function resetProfileUI() {
    document.getElementById('avatarText').innerText = 'U';
    document.getElementById('avatarImg').classList.add('hidden');
    document.getElementById('avatarText').classList.remove('hidden');
    document.getElementById('profileAvatarBigText').innerText = 'U';
    document.getElementById('profileAvatarBigImg').classList.add('hidden');
    document.getElementById('profileAvatarBigText').classList.remove('hidden');
    document.getElementById('profileNameDisplay').innerText = 'Usuário';
    document.getElementById('profileNameInput').value = '';
    document.getElementById('profileBioInput').value = '';
    document.getElementById('profileEmailDisplay').innerText = '';
    document.getElementById('profileBannerImg').src = 'https://via.placeholder.com/600x200?text=Banner';
    document.getElementById('profilePhotoPreview').classList.add('hidden');
    document.getElementById('profileBannerPreview').classList.add('hidden');
    document.getElementById('sidebarUserName').innerText = 'Usuário';
    document.getElementById('sidebarUserEmail').innerText = 'email@exemplo.com';
    document.getElementById('sidebarAvatar').innerHTML = '<span>U</span>';
    document.getElementById('themeColorPicker').value = '#e50914';
}

function updateUserAvatarUI(data = {}) {
    const un = data.name || getUserCache('name') || '';
    const ub = data.bio || getUserCache('bio') || '';
    const ug = data.favGenre || getUserCache('fav_genre') || '';
    const av = data.photo || getUserCache('avatar') || '';
    const bn = data.banner || getUserCache('banner') || '';
    const user = auth.currentUser;
    const letter = un ? un.charAt(0).toUpperCase() : (user ? user.email.charAt(0).toUpperCase() : 'U');

    if (un) {
        document.getElementById('profileNameDisplay').innerText = un;
        document.getElementById('profileNameInput').value = un;
        document.getElementById('sidebarUserName').innerText = un;
    } else if (user) {
        document.getElementById('sidebarUserName').innerText = user.email.split('@')[0];
        document.getElementById('profileNameDisplay').innerText = user.email.split('@')[0];
    }
    if (user) document.getElementById('sidebarUserEmail').innerText = user.email;
    if (ub) {
        document.getElementById('profileBioDisplay').innerText = `"${ub}"`;
        document.getElementById('profileBioInput').value = ub;
    }
    if (ug) document.getElementById('profileFavGenreInput').value = ug;
    if (bn) {
        document.getElementById('profileBannerImg').src = bn;
        document.getElementById('profileBannerPreview').src = bn;
        document.getElementById('profileBannerPreview').classList.remove('hidden');
    }

    const sa = document.getElementById('sidebarAvatar');
    sa.innerHTML = '';
    if (av) {
        document.getElementById('avatarImg').src = av;
        document.getElementById('avatarImg').classList.remove('hidden');
        document.getElementById('avatarText').classList.add('hidden');
        document.getElementById('profileAvatarBigImg').src = av;
        document.getElementById('profileAvatarBigImg').classList.remove('hidden');
        document.getElementById('profileAvatarBigText').classList.add('hidden');
        document.getElementById('profilePhotoPreview').src = av;
        document.getElementById('profilePhotoPreview').classList.remove('hidden');
        const img = document.createElement('img');
        img.src = av; sa.appendChild(img);
    } else {
        document.getElementById('avatarText').innerText = letter;
        document.getElementById('profileAvatarBigText').innerText = letter;
        sa.innerHTML = `<span>${letter}</span>`;
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
        activeItem = null; mediaCatalog = []; isAdmin = false;
        showMsg('Deslogado! 👋', 'success');
    } catch (e) { showMsg('Erro: ' + e.message, 'error'); }
}
document.getElementById('btnLogout').onclick = handleLogout;

// ========== AUTH ==========
document.getElementById('toggleAuthMode').onclick = () => {
    isSignUpMode = !isSignUpMode;
    document.getElementById('authSubtitle').innerText = isSignUpMode
        ? 'Crie sua conta gratuita' : 'Entre na sua conta para continuar';
    document.getElementById('btnAuthSubmit').innerText = isSignUpMode ? 'Criar Conta' : 'Entrar na Conta';
    document.getElementById('toggleAuthMode').innerHTML = isSignUpMode
        ? 'Já tem conta? <span style="color: var(--primary-color);">Entrar</span>'
        : 'Não tem conta? <span style="color: var(--primary-color);">Crie agora</span>';
};

document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    if (authProcessing) return;
    authProcessing = true;
    const sb = document.getElementById('btnAuthSubmit');
    const ot = sb.innerText;
    sb.innerText = '⏳ Aguarde...'; sb.disabled = true;
    const email = document.getElementById('authEmail').value.trim().toLowerCase();
    const pass = document.getElementById('authPassword').value;
    if (!email || pass.length < 6) {
        showMsg('Preencha tudo! Senha mín. 6 caracteres', 'error');
        authProcessing = false; sb.innerText = ot; sb.disabled = false;
        return;
    }
    try {
        if (isSignUpMode) {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(rtdb, "users/" + cred.user.uid), {
                name: email.split('@')[0], bio: '', favGenre: 'Ação',
                photo: '', banner: '', themeColor: '#e50914', createdAt: Date.now()
            });
            showMsg('Conta criada! ✅', 'success');
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
            showMsg('Bem-vindo de volta! 🎬', 'success');
        }
        closeModal('authOverlay');
    } catch (err) { showMsg(translateAuthError(err.code), 'error'); }
    authProcessing = false; sb.innerText = ot; sb.disabled = false;
};

// ========== MODAL BUTTONS ==========
document.getElementById('btnOpenProfile').onclick = () => openModal('profileModal');
document.getElementById('btnCloseProfile').onclick = () => closeModal('profileModal');
document.getElementById('btnCloseCreator').onclick = () => closeModal('creatorModal');

// ========== INIT ==========
clearLegacyCache();
renderGenreSelector();

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUid = user.uid;
        resetProfileUI();
        closeModal('authOverlay');
        document.getElementById('profileEmailDisplay').innerText = user.email;
        isAdmin = user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
        const adminEls = ['profileAdminBadge', 'sidebarAdminItem', 'sidebarCreatorItem',
            'sidebarSuggestionsAdminItem', 'sidebarStorageItem'];
        adminEls.forEach(id => {
            document.getElementById(id).classList.toggle('hidden', !isAdmin);
        });
        loadUserProfile(user);
        loadCatalog();
    } else {
        currentUserUid = null; isAdmin = false;
        resetProfileUI();
        document.documentElement.style.setProperty('--primary-color', '#e50914');
        openModal('authOverlay');
        ['sidebarAdminItem', 'sidebarCreatorItem', 'sidebarSuggestionsAdminItem',
         'sidebarStorageItem', 'profileAdminBadge'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        isSignUpMode = false;
        document.getElementById('authSubtitle').innerText = 'Entre na sua conta para continuar';
        document.getElementById('btnAuthSubmit').innerText = 'Entrar na Conta';
        document.getElementById('toggleAuthMode').innerHTML =
            'Não tem conta? <span style="color: var(--primary-color);">Crie agora</span>';
    }
});

// ========== TV: D-PAD NAVIGATION SUPPORT ==========
document.addEventListener('keydown', (e) => {
    if (isPlayerOpen()) return; // Player handles its own keys

    // Handle TV remote Back button
    if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009) {
        // Close any open modal
        const modals = ['detailsModal', 'profileModal', 'adminModal', 'creatorModal',
            'suggestionModal', 'suggestionsAdminModal', 'storageModal', 'cropperModal'];
        for (const id of modals) {
            const m = document.getElementById(id);
            if (m && !m.classList.contains('hidden')) {
                closeModal(id);
                e.preventDefault();
                return;
            }
        }
        // Close sidebar
        if (document.getElementById('sidebarMenu').classList.contains('active')) {
            closeSidebar();
            e.preventDefault();
        }
    }
});
