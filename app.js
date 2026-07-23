import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ============ CONSTANTES ============
const EXCLUSIVE_ADMIN_EMAIL = "raiyuri.freefire@gmail.com";
const AVAILABLE_GENRES = ["Ação", "Aventura", "Comédia", "Drama", "Terror", "Suspense", "Romance", "Ficção Científica", "Fantasia", "Animação", "Documentário", "Musical", "Guerra", "Mistério", "Crime", "Família", "Histórico", "Faroeste"];

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

// ============ ESTADO GLOBAL ============
let mediaCatalog = [];
let activeItem = null;
let seasonsBuilder = [];
let selectedCategory = "Todos";
let isSignUpMode = false;
let selectedGenres = [];
let cropperInstance = null;
let currentTargetInput = null;
let currentTargetPreview = null;
let previousModal = null;
let controlsHideTimer = null;
let cursorHideTimer = null;
let originalWindowOpen = null;
let notificationBlockerActive = false;

// ============ ELEMENTOS DO PLAYER ============
const playerBox = document.getElementById('playerModalBox');
const playerControls = document.getElementById('playerControlsTop');
const playerContainer = document.getElementById('playerContainerView');
const playerLoading = document.getElementById('playerLoading');

// ============ UTILIDADES ============
function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function getPosterUrl(item) { return item.coverUrl || item.backdropUrl || ''; }
function getBackdropUrl(item) { return item.backdropUrl || item.coverUrl || ''; }

function getEpisodeThumb(episode, seasonData, seriesItem) {
    if (episode.thumbUrl && episode.thumbUrl.trim() !== '' && !episode.thumbUrl.includes('window.location')) return episode.thumbUrl;
    if (seasonData && seasonData.seasonCoverUrl && seasonData.seasonCoverUrl.trim() !== '' && !seasonData.seasonCoverUrl.includes('window.location')) return seasonData.seasonCoverUrl;
    return getBackdropUrl(seriesItem) || getPosterUrl(seriesItem);
}

function getItemGenres(item) {
    if (Array.isArray(item.genres) && item.genres.length > 0) return item.genres;
    if (item.category) return [item.category];
    return [];
}

function itemMatchesCategory(item, category) {
    if (category === "Todos") return true;
    if (category === "Filmes") return item.type === "movie";
    if (category === "Séries") return item.type === "serie";
    return getItemGenres(item).includes(category);
}

function isTVDevice() {
    const ua = navigator.userAgent.toLowerCase();
    return /smarttv|googletv|appletv|hbbtv|pov_tv|netcast|viera|bravia|tizen|webos|crkey|playstation|xbox|nintendo/i.test(ua);
}

function showMsg(text, type) {
    const msg = document.getElementById('msg');
    msg.innerText = text;
    msg.className = type === 'success' ? 'msg-success' : 'msg-error';
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 4000);
}

function applyUserTheme(color) {
    if (!color || isTVDevice()) return;
    document.documentElement.style.setProperty('--primary-color', color);
    localStorage.setItem('masterflix_theme_color', color);
}

function formatVideoUrl(url) {
    if (!url) return '';
    let formatted = url.trim();
    if (formatted.includes('mixdrop.')) {
        if (formatted.includes('/f/')) formatted = formatted.replace('/f/', '/e/');
        else if (!formatted.includes('/e/')) {
            const match = formatted.match(/(?:mixdrop\.[a-z]+)\/(?:e\/|f\/)?([a-zA-Z0-9]+)/);
            if (match && match[1]) formatted = `https://mixdrop.top/e/${match[1]}`;
        }
    }
    return formatted;
}

// ============ INIT THEME ============
if (!isTVDevice()) {
    const savedColor = localStorage.getItem('masterflix_theme_color');
    if (savedColor) applyUserTheme(savedColor);
}

// ============ HEADER SCROLL ============
window.onscroll = () => {
    const header = document.getElementById('mainHeader');
    if (window.scrollY > 50) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
};

// ============ SIDEBAR ============
const menuToggleBtn = document.getElementById('menuToggleBtn');
const sidebarMenu = document.getElementById('sidebarMenu');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

function openSidebar() { sidebarMenu.classList.add('active'); sidebarOverlay.classList.add('active'); menuToggleBtn.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeSidebar() { sidebarMenu.classList.remove('active'); sidebarOverlay.classList.remove('active'); menuToggleBtn.classList.remove('active'); document.body.style.overflow = ''; }

menuToggleBtn.onclick = () => sidebarMenu.classList.contains('active') ? closeSidebar() : openSidebar();
sidebarCloseBtn.onclick = closeSidebar;
sidebarOverlay.onclick = closeSidebar;

document.querySelectorAll('.sidebar-item').forEach(item => {
    item.onclick = () => {
        const action = item.dataset.nav;
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        if (['home', 'movies', 'series', 'continue'].includes(action)) item.classList.add('active');
        closeSidebar();

        if (action === 'home') { selectedCategory = "Todos"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if (action === 'movies') { selectedCategory = "Filmes"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 300, behavior: 'smooth' }); }
        else if (action === 'series') { selectedCategory = "Séries"; updateCategoryChips(); renderApp(); window.scrollTo({ top: 300, behavior: 'smooth' }); }
        else if (action === 'continue') {
            const contRow = document.getElementById('continueRow');
            if (!contRow.classList.contains('hidden')) contRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else showMsg('Você ainda não começou a assistir nada!', 'error');
        }
        else if (action === 'profile') document.getElementById('profileModal').classList.remove('hidden');
        else if (action === 'admin') { renderAdminCatalogList(); document.getElementById('adminModal').classList.remove('hidden'); }
        else if (action === 'creator') openCreator();
        else if (action === 'logout') { if (confirm('Deseja sair da conta?')) handleLogout(); }
    };
});

function updateCategoryChips() {
    document.querySelectorAll('.category-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === selectedCategory));
}

// ============ CATEGORIAS ============
document.querySelectorAll('.category-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedCategory = chip.dataset.cat;
        renderApp();
    };
});

// ============ GENRE SELECTOR ============
function renderGenreSelector() {
    const container = document.getElementById('genreSelectorContainer');
    container.innerHTML = '';
    AVAILABLE_GENRES.forEach(genre => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        if (selectedGenres.includes(genre)) tag.classList.add('selected');
        tag.textContent = genre;
        tag.onclick = () => {
            const idx = selectedGenres.indexOf(genre);
            if (idx >= 0) selectedGenres.splice(idx, 1); else selectedGenres.push(genre);
            renderGenreSelector();
        };
        container.appendChild(tag);
    });
    const counter = document.getElementById('genreCounter');
    if (selectedGenres.length === 0) { counter.textContent = '⚠️ Selecione ao menos 1 gênero'; counter.style.color = '#ff9800'; }
    else { counter.textContent = `✓ ${selectedGenres.length} gênero(s): ${selectedGenres.join(', ')}`; counter.style.color = 'var(--primary-color)'; }
}

// ============ CROPPER ============
window.triggerCropModal = function(inputId, previewId, aspectRatio) {
    const fileInput = document.getElementById(inputId);
    currentTargetInput = fileInput;
    currentTargetPreview = document.getElementById(previewId);

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const tempImg = new Image();
            tempImg.onload = () => {
                if (tempImg.naturalWidth <= 800 && tempImg.naturalHeight <= 800) {
                    if (currentTargetPreview) { currentTargetPreview.src = event.target.result; currentTargetPreview.classList.remove('hidden'); }
                    fileInput.value = "";
                    return;
                }
                const cropperImg = document.getElementById('cropperImage');
                cropperImg.src = event.target.result;
                if (!document.getElementById('profileModal').classList.contains('hidden')) { previousModal = 'profileModal'; document.getElementById('profileModal').classList.add('hidden'); }
                else if (!document.getElementById('creatorModal').classList.contains('hidden')) { previousModal = 'creatorModal'; document.getElementById('creatorModal').classList.add('hidden'); }
                document.getElementById('cropperModal').classList.remove('hidden');
                if (cropperInstance) cropperInstance.destroy();
                cropperInstance = new Cropper(cropperImg, {
                    aspectRatio: aspectRatio || NaN, viewMode: 1, autoCropArea: 1, responsive: true, restore: false,
                    center: true, highlight: false, cropBoxMovable: true, cropBoxResizable: true, toggleDragModeOnDblclick: false,
                    crop() {
                        const canvas = cropperInstance.getCroppedCanvas({ width: 800, imageSmoothingQuality: 'high' });
                        if (canvas) {
                            const url = canvas.toDataURL('image/jpeg', 0.90);
                            document.getElementById('prevMobile').src = url;
                            document.getElementById('prevPC').src = url;
                            document.getElementById('prevTV').src = url;
                        }
                    }
                });
            };
            tempImg.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };
    fileInput.click();
};

document.getElementById('btnConfirmCrop').onclick = () => {
    if (!cropperInstance) return;
    const canvas = cropperInstance.getCroppedCanvas({ width: 1200, imageSmoothingQuality: 'high' });
    if (canvas) {
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        if (currentTargetPreview) { currentTargetPreview.src = croppedDataUrl; currentTargetPreview.classList.remove('hidden'); }
    }
    document.getElementById('cropperModal').classList.add('hidden');
    if (previousModal) document.getElementById(previousModal).classList.remove('hidden');
    if (cropperInstance) cropperInstance.destroy();
};

document.getElementById('btnCloseCropper').onclick = () => {
    document.getElementById('cropperModal').classList.add('hidden');
    if (previousModal) document.getElementById(previousModal).classList.remove('hidden');
    if (cropperInstance) cropperInstance.destroy();
};

// ============ SEARCH ============
const searchWrapper = document.getElementById('searchWrapper');
const searchBox = document.getElementById('searchBox');
const searchIconBtn = document.getElementById('searchIconBtn');
const searchInput = document.getElementById('searchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const searchDropdown = document.getElementById('searchResultsDropdown');

function openSearch() { searchBox.classList.add('active'); setTimeout(() => searchInput.focus(), 200); }
function closeSearch() { if (searchInput.value.trim() === '') { searchBox.classList.remove('active'); searchBox.classList.remove('has-text'); searchDropdown.classList.remove('visible'); } }

searchIconBtn.addEventListener('click', (e) => { e.stopPropagation(); if (searchBox.classList.contains('active')) { if (searchInput.value.trim() === '') closeSearch(); } else openSearch(); });

searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    if (val.length > 0) { searchBox.classList.add('has-text'); renderSearchDropdown(val); }
    else { searchBox.classList.remove('has-text'); searchDropdown.classList.remove('visible'); }
});

searchClearBtn.addEventListener('click', (e) => { e.stopPropagation(); searchInput.value = ''; searchBox.classList.remove('has-text'); searchDropdown.classList.remove('visible'); searchInput.focus(); });
searchInput.addEventListener('focus', () => { if (searchInput.value.trim().length > 0) renderSearchDropdown(searchInput.value.trim()); });

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchBox.classList.remove('has-text'); searchDropdown.classList.remove('visible'); closeSearch(); searchInput.blur(); }
    else if (e.key === 'Enter') { e.preventDefault(); const first = searchDropdown.querySelector('.search-result-item'); if (first) first.click(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); const first = searchDropdown.querySelector('.search-result-item'); if (first) first.focus(); }
});

searchDropdown.addEventListener('keydown', (e) => {
    const items = Array.from(searchDropdown.querySelectorAll('.search-result-item'));
    const currentIdx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); const next = items[currentIdx + 1]; if (next) next.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (currentIdx <= 0) searchInput.focus(); else items[currentIdx - 1].focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (document.activeElement && document.activeElement.classList.contains('search-result-item')) document.activeElement.click(); }
    else if (e.key === 'Escape') searchInput.focus();
});

document.addEventListener('click', (e) => { if (!searchWrapper.contains(e.target)) { searchDropdown.classList.remove('visible'); if (searchInput.value.trim() === '') searchBox.classList.remove('active'); } });

function smartSearch(query) {
    const q = normalizeText(query);
    if (!q) return [];
    const scored = [];
    mediaCatalog.forEach(item => {
        const title = normalizeText(item.title);
        if (!title) return;
        let score = 0;
        if (title.startsWith(q)) score = 1000 - title.length;
        else {
            const words = title.split(/\s+/);
            let wordStartsWith = false;
            for (const w of words) { if (w.startsWith(q)) { wordStartsWith = true; break; } }
            if (wordStartsWith) score = 500 - title.length;
            else if (title.includes(q)) score = 100 - title.length;
        }
        if (score > 0) scored.push({ item, score });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 8).map(s => s.item);
}

function highlightMatch(title, query) {
    const normalizedTitle = normalizeText(title);
    const normalizedQuery = normalizeText(query);
    const idx = normalizedTitle.indexOf(normalizedQuery);
    if (idx === -1) return title;
    return title.substring(0, idx) + '<mark>' + title.substring(idx, idx + query.length) + '</mark>' + title.substring(idx + query.length);
}

function renderSearchDropdown(query) {
    const results = smartSearch(query);
    searchDropdown.innerHTML = '';
    if (results.length === 0) {
        searchDropdown.innerHTML = `<div class="search-no-results">🔍 Nenhum título encontrado para "<strong>${query}</strong>"</div>`;
    } else {
        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-result-item'; div.tabIndex = 0;
            const poster = getPosterUrl(item) || 'https://via.placeholder.com/50x70?text=?';
            const typeLabel = item.type === 'movie' ? 'Filme' : 'Série';
            let genresText = '';
            if (Array.isArray(item.genres) && item.genres.length > 0) genresText = item.genres.slice(0, 2).join(', ');
            else if (item.category) genresText = item.category;
            div.innerHTML = `
                <img class="search-result-thumb" src="${poster}" alt="" onerror="this.src='https://via.placeholder.com/50x70?text=?'">
                <div class="search-result-info">
                    <div class="search-result-title">${highlightMatch(item.title, query)}</div>
                    <div class="search-result-meta"><span class="tag">${typeLabel}</span>${genresText ? ' • ' + genresText : ''}${item.year ? ' • ' + item.year : ''}</div>
                </div>
            `;
            div.onclick = () => {
                searchDropdown.classList.remove('visible');
                searchInput.value = '';
                searchBox.classList.remove('has-text');
                closeSearch();
                window.location.hash = `#/midia/${item.id}`;
                openDetails(item);
            };
            searchDropdown.appendChild(div);
        });
    }
    searchDropdown.classList.add('visible');
}

// ============ HASH ROUTING ============
function handleHashRouting() {
    const hash = window.location.hash;
    if (hash.startsWith('#/midia/')) {
        const id = hash.replace('#/midia/', '');
        const item = mediaCatalog.find(m => m.id === id);
        if (item) openDetails(item);
    }
}
window.addEventListener('hashchange', handleHashRouting);

// ============ MEDIA TYPE TOGGLE ============
document.getElementById('mediaType').onchange = (e) => {
    const type = e.target.value;
    const durationLabel = document.getElementById('mediaDurationLabel');
    const durationInput = document.getElementById('mediaDuration');
    if (type === 'movie') {
        document.getElementById('movieFileArea').classList.remove('hidden');
        document.getElementById('seriesBuilderArea').classList.add('hidden');
        if (durationLabel) durationLabel.innerText = "Duração do Filme (Ex: 2h 10m)";
        if (durationInput) durationInput.placeholder = "Ex: 2h 10m";
    } else {
        document.getElementById('movieFileArea').classList.add('hidden');
        document.getElementById('seriesBuilderArea').classList.remove('hidden');
        if (durationLabel) durationLabel.innerText = "Dica / Duração Média (Ex: 45m/ep)";
        if (durationInput) durationInput.placeholder = "Ex: 45m/ep";
        if (seasonsBuilder.length === 0) addSeason();
    }
};

// ============ SEASONS BUILDER ============
function renderSeasonsBuilder() {
    const container = document.getElementById('seasonsList');
    container.innerHTML = "";
    seasonsBuilder.forEach((season, sIdx) => {
        const sDiv = document.createElement('div');
        sDiv.style.cssText = "background:#181818; border:1px solid #333; border-radius:8px; padding:12px; margin-top:12px;";
        sDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="color:var(--primary-color); font-size:13px;">Temporada ${sIdx + 1}</strong>
                <button type="button" class="btn-secondary" style="font-size:10px; padding:4px 8px;" onclick="addEpisode(${sIdx})">+ Episódio</button>
            </div>
            <div class="input-group" style="margin-bottom:8px;">
                <label style="font-size:10px;">Foto da Temporada ${sIdx + 1} (16:9)</label>
                <div class="file-upload-box" onclick="triggerCropModal('seasonCoverFile_${sIdx}', 'seasonCoverPrev_${sIdx}', 16/9)">
                    <span class="file-upload-label">📁 Foto da Temporada</span>
                    <input type="file" id="seasonCoverFile_${sIdx}" accept="image/*" class="hidden">
                    <img id="seasonCoverPrev_${sIdx}" src="${season.seasonCoverUrl || ''}" class="file-preview-img ${season.seasonCoverUrl ? '' : 'hidden'}">
                </div>
                <div class="info-tip">💡 Se não colocar, os episódios sem foto usam a capa da série.</div>
            </div>
            <div id="episodesListBuilder_${sIdx}"></div>
        `;
        container.appendChild(sDiv);
        const epListDiv = sDiv.querySelector(`#episodesListBuilder_${sIdx}`);
        (season.episodes || []).forEach((ep, eIdx) => {
            const epDiv = document.createElement('div');
            epDiv.style.cssText = "background:#111; border:1px solid #282828; border-radius:6px; padding:10px; margin-top:10px;";
            epDiv.innerHTML = `
                <strong style="font-size:10px; color:#aaa;">EPISÓDIO ${eIdx + 1}</strong>
                <div class="input-group" style="margin-top:4px; margin-bottom:6px;">
                    <label style="font-size:9px;">Título do Episódio</label>
                    <input type="text" id="epTitle_${sIdx}_${eIdx}" value="${ep.title || ''}" placeholder="Ex: Nome do Episódio">
                </div>
                <div class="input-group" style="margin-bottom:6px;">
                    <label style="font-size:9px;">Duração (Ex: 45m)</label>
                    <input type="text" id="epDuration_${sIdx}_${eIdx}" value="${ep.duration || ''}" placeholder="Ex: 45m">
                </div>
                <div class="input-group" style="margin-bottom:6px;">
                    <label style="font-size:9px;">Foto (Thumbnail) 16:9 — Opcional</label>
                    <div class="file-upload-box" onclick="triggerCropModal('epThumbFile_${sIdx}_${eIdx}', 'epThumbPrev_${sIdx}_${eIdx}', 16/9)">
                        <span class="file-upload-label">📸 Foto do Episódio</span>
                        <input type="file" id="epThumbFile_${sIdx}_${eIdx}" accept="image/*" class="hidden">
                        <img id="epThumbPrev_${sIdx}_${eIdx}" src="${ep.thumbUrl || ''}" class="file-preview-img ${ep.thumbUrl ? '' : 'hidden'}">
                    </div>
                </div>
                <div class="input-group" style="margin-bottom:2px;">
                    <label style="font-size:9px;">Link do Vídeo (Mixdrop)</label>
                    <input type="text" id="epVideoUrl_${sIdx}_${eIdx}" value="${ep.videoUrl || ''}" placeholder="Mixdrop Link">
                </div>
            `;
            epListDiv.appendChild(epDiv);
        });
    });
}

function addSeason() {
    seasonsBuilder.push({ seasonNumber: seasonsBuilder.length + 1, seasonCoverUrl: '', episodes: [{ title: 'Episódio 1', duration: '45m', videoUrl: '', thumbUrl: '' }] });
    renderSeasonsBuilder();
}

window.addEpisode = (sIdx) => {
    seasonsBuilder[sIdx].episodes.push({ title: `Episódio ${seasonsBuilder[sIdx].episodes.length + 1}`, duration: '45m', videoUrl: '', thumbUrl: '' });
    renderSeasonsBuilder();
};

document.getElementById('btnAddSeasonBtn').onclick = addSeason;

// ============ FIREBASE CATALOG ============
async function loadCatalog() {
    try {
        const snap = await get(ref(rtdb, "catalog"));
        mediaCatalog = [];
        if (snap.exists()) {
            const data = snap.val();
            for (let k in data) {
                const item = { id: k, ...data[k] };
                if (!Array.isArray(item.genres)) item.genres = item.category ? [item.category] : [];
                mediaCatalog.push(item);
            }
        }
        renderApp();
        renderAdminCatalogList();
        handleHashRouting();
    } catch (e) { showMsg('Erro ao carregar catálogo: ' + e.message, 'error'); }
}

// ============ CONTINUE WATCHING ============
function saveContinueWatching(mediaItem, extraInfo = '') {
    try {
        let currentList = JSON.parse(localStorage.getItem('masterflix_continue_watching') || '[]');
        currentList = currentList.filter(item => item.id !== mediaItem.id);
        currentList.unshift({
            id: mediaItem.id, title: mediaItem.title,
            coverUrl: getBackdropUrl(mediaItem) || getPosterUrl(mediaItem),
            duration: mediaItem.duration || extraInfo || '45m',
            timestamp: new Date().getTime(), extra: extraInfo
        });
        if (currentList.length > 10) currentList.pop();
        localStorage.setItem('masterflix_continue_watching', JSON.stringify(currentList));
        renderContinueWatching();
    } catch (e) { console.error("Erro:", e); }
}

function renderContinueWatching() {
    const continueRow = document.getElementById('continueRow');
    const continueCarousel = document.getElementById('continueCarousel');
    continueCarousel.innerHTML = "";
    try {
        const list = JSON.parse(localStorage.getItem('masterflix_continue_watching') || '[]');
        if (list.length === 0) { continueRow.classList.add('hidden'); return; }
        continueRow.classList.remove('hidden');
        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'continue-card'; card.tabIndex = 0;
            card.innerHTML = `
                <img src="${item.coverUrl || 'https://via.placeholder.com/300x180?text=Sem+Capa'}" alt="${item.title}">
                <div class="continue-progress-bar"></div>
                <div class="continue-info">
                    <div style="font-size: 11px; font-weight: 800; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.title}</div>
                    <div class="continue-duration">⏳ ${item.duration}</div>
                </div>
            `;
            card.onclick = () => { const originalItem = mediaCatalog.find(m => m.id === item.id); if (originalItem) openDetails(originalItem); };
            continueCarousel.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

// ============ RENDER APP ============
function renderApp() {
    const moviesCarousel = document.getElementById('moviesCarousel');
    const seriesCarousel = document.getElementById('seriesCarousel');
    const moviesRow = document.getElementById('moviesRow');
    const seriesRow = document.getElementById('seriesRow');
    moviesCarousel.innerHTML = ""; seriesCarousel.innerHTML = "";

    if (selectedCategory === "Filmes") { moviesRow.classList.remove('hidden'); seriesRow.classList.add('hidden'); }
    else if (selectedCategory === "Séries") { moviesRow.classList.add('hidden'); seriesRow.classList.remove('hidden'); }
    else { moviesRow.classList.remove('hidden'); seriesRow.classList.remove('hidden'); }

    mediaCatalog.forEach(item => {
        if (!itemMatchesCategory(item, selectedCategory)) return;
        const card = document.createElement('div');
        card.className = 'media-card'; card.tabIndex = 0;
        const posterSrc = getPosterUrl(item);
        const genres = getItemGenres(item);
        const tagText = genres.length > 0 ? genres[0] : (item.type === 'movie' ? 'Filme' : 'Série');

        if (posterSrc) {
            card.innerHTML = `
                <img class="media-card-poster" src="${posterSrc}" alt="${item.title}" loading="lazy" onerror="this.style.display='none'; this.parentElement.querySelector('.media-card-fallback-hidden').style.display='flex';">
                <div class="media-card-poster-fallback media-card-fallback-hidden" style="display:none; position:absolute; inset:0;">🎬</div>
                <div class="media-card-overlay">
                    <span class="media-card-tag">${tagText}</span>
                    <div class="media-card-title">${item.title}</div>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="media-card-poster-fallback">🎬</div>
                <div class="media-card-overlay">
                    <span class="media-card-tag">${tagText}</span>
                    <div class="media-card-title">${item.title}</div>
                </div>
            `;
        }
        card.onclick = () => { window.location.hash = `#/midia/${item.id}`; openDetails(item); };
        if (item.type === 'movie') moviesCarousel.appendChild(card);
        else seriesCarousel.appendChild(card);
    });

    renderContinueWatching();
    if (mediaCatalog.length > 0 && !activeItem) setHero(mediaCatalog[0]);
}

// ============ HERO ============
function setHero(item) {
    activeItem = item;
    document.getElementById('heroTitle').innerText = item.title;
    document.getElementById('heroDesc').innerText = item.description;
    const genres = getItemGenres(item);
    const typeLabel = item.type === 'movie' ? '🎬 FILME' : '📺 SÉRIE';
    const durText = item.duration ? `<span class="dot">•</span> ⏱️ ${item.duration}` : '';
    const yearText = item.year ? `<span class="dot">•</span> ${item.year}` : '';
    const genreText = genres.length > 0 ? `<span class="dot">•</span> ${genres.slice(0, 3).join(', ')}` : '';
    document.getElementById('heroMeta').innerHTML = `<strong>${typeLabel}</strong> ${yearText} ${durText} ${genreText}`;
    const backdrop = getBackdropUrl(item);
    if (backdrop) document.getElementById('heroBackdrop').style.backgroundImage = `url('${backdrop}')`;
    document.getElementById('heroPlayBtn').onclick = () => {
        if (item.type === 'movie' && item.videoUrl) { saveContinueWatching(item, item.duration || '1h 30m'); playVideo(item.videoUrl, item.title, 'Filme'); }
        else openDetails(item);
    };
    document.getElementById('heroInfoBtn').onclick = () => openDetails(item);
}

// ============ DETAILS ============
function openDetails(item) {
    activeItem = item;
    const backdrop = getBackdropUrl(item);
    const backdropArea = document.getElementById('detailBackdropArea');
    if (backdrop) backdropArea.style.backgroundImage = `url('${backdrop}')`;
    else backdropArea.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2a1a1a 100%)';
    const poster = getPosterUrl(item);
    const detailPoster = document.getElementById('detailPoster');
    if (poster) { detailPoster.src = poster; detailPoster.style.display = 'block'; } else detailPoster.style.display = 'none';
    document.getElementById('detailTitle').innerText = item.title;
    const durText = item.duration ? ` • ⏱️ ${item.duration}` : '';
    document.getElementById('detailMeta').innerText = `${item.type === 'movie' ? 'FILME' : 'SÉRIE'} • ${item.year}${durText}`;
    const genresDiv = document.getElementById('detailGenres');
    genresDiv.innerHTML = '';
    getItemGenres(item).forEach(g => {
        const badge = document.createElement('span');
        badge.style.cssText = 'padding: 5px 12px; background: rgba(229,9,20,0.15); border: 1px solid var(--primary-color); border-radius: 14px; font-size: 10px; font-weight: 700; color: var(--primary-color); text-transform: uppercase; letter-spacing: 0.5px;';
        badge.textContent = g;
        genresDiv.appendChild(badge);
    });
    document.getElementById('detailDesc').innerText = item.description;

    if (item.type === 'movie') {
        document.getElementById('detailMovieArea').classList.remove('hidden');
        document.getElementById('detailSerieArea').classList.add('hidden');
        document.getElementById('btnPlayMovieFile').onclick = () => { saveContinueWatching(item, item.duration || '1h 30m'); playVideo(item.videoUrl, item.title, 'Filme'); };
    } else {
        document.getElementById('detailMovieArea').classList.add('hidden');
        document.getElementById('detailSerieArea').classList.remove('hidden');
        const tabs = document.getElementById('seasonTabs');
        tabs.innerHTML = "";
        (item.seasons || []).forEach((s, idx) => {
            const tab = document.createElement('div');
            tab.className = `season-tab ${idx === 0 ? 'active' : ''}`;
            tab.innerText = `Temporada ${idx + 1}`;
            tab.onclick = () => {
                document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                if (s.seasonCoverUrl && s.seasonCoverUrl.trim() !== '') backdropArea.style.backgroundImage = `url('${s.seasonCoverUrl}')`;
                else backdropArea.style.backgroundImage = backdrop ? `url('${backdrop}')` : '';
                renderEpisodesList(s.episodes || [], idx, s, item);
            };
            tabs.appendChild(tab);
        });
        if (item.seasons && item.seasons.length > 0) {
            const firstSeason = item.seasons[0];
            if (firstSeason.seasonCoverUrl && firstSeason.seasonCoverUrl.trim() !== '') backdropArea.style.backgroundImage = `url('${firstSeason.seasonCoverUrl}')`;
            renderEpisodesList(firstSeason.episodes || [], 0, firstSeason, item);
        }
    }
    document.getElementById('detailsModal').classList.remove('hidden');
}

function renderEpisodesList(episodes, seasonIdx, seasonData, seriesItem) {
    const container = document.getElementById('episodesListContainer');
    container.innerHTML = "";
    episodes.forEach((ep, idx) => {
        const epDiv = document.createElement('div');
        epDiv.className = 'episode-card'; epDiv.tabIndex = 0;
        const epThumb = getEpisodeThumb(ep, seasonData, seriesItem);
        const epDurBadge = ep.duration ? `<span style="color:#aaa; font-size:10px; margin-left:6px;">⏱️ ${ep.duration}</span>` : '';
        epDiv.onclick = () => {
            document.getElementById('detailsModal').classList.add('hidden');
            saveContinueWatching(activeItem, `T${seasonIdx + 1} E${idx + 1}`);
            playVideo(ep.videoUrl, activeItem.title, `T${seasonIdx + 1} E${idx + 1} - ${ep.title}`);
        };
        epDiv.innerHTML = `
            <div class="episode-thumb"><img src="${epThumb || 'https://via.placeholder.com/150x90?text=?'}" alt="" onerror="this.src='https://via.placeholder.com/150x90?text=?'"></div>
            <div style="flex:1;">
                <div style="font-size:12px; font-weight:800;">T${seasonIdx + 1} E${idx + 1} - ${ep.title || 'Sem Título'}${epDurBadge}</div>
                <span style="font-size:10px; color:var(--primary-color); font-weight:700;">▶ Assistir</span>
            </div>
        `;
        container.appendChild(epDiv);
    });
}

// ============ PLAYER ============
function isPlayerOpen() { return !document.getElementById('playerModal').classList.contains('hidden'); }
function isInFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement); }

function showPlayerControls() {
    if (!isPlayerOpen()) return;
    playerControls.classList.remove('is-hidden');
    playerBox.classList.remove('cursor-hidden');
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
    controlsHideTimer = setTimeout(() => playerControls.classList.add('is-hidden'), 4000);
    if (!('ontouchstart' in window)) cursorHideTimer = setTimeout(() => playerBox.classList.add('cursor-hidden'), 3500);
}

function forceShowControls() {
    if (!isPlayerOpen()) return;
    playerControls.classList.remove('is-hidden');
    playerBox.classList.remove('cursor-hidden');
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
}

function enableNotificationBlocker() {
    if (notificationBlockerActive) return;
    notificationBlockerActive = true;
    if (!originalWindowOpen) originalWindowOpen = window.open;
    window.open = function(url) { console.log('[MasterFlix] 🛡️ Pop-up bloqueado:', url); return null; };
    if ('Notification' in window) { try { Notification.requestPermission = function() { return Promise.resolve('denied'); }; } catch(e) {} }
    if ('PushManager' in window) { try { PushManager.prototype.subscribe = function() { return Promise.reject(new Error('Blocked')); }; } catch(e) {} }
}

function disableNotificationBlocker() {
    notificationBlockerActive = false;
    if (originalWindowOpen) { window.open = originalWindowOpen; originalWindowOpen = null; }
}

window.addEventListener('blur', () => {
    if (!isPlayerOpen()) return;
    setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
            if (isInFullscreen()) { try { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch(e) {} }
            setTimeout(() => { window.focus(); forceShowControls(); showPlayerControls(); }, 150);
        }
    }, 100);
});

window.addEventListener('focus', () => { if (isPlayerOpen()) { forceShowControls(); showPlayerControls(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && isPlayerOpen()) { forceShowControls(); showPlayerControls(); } });

['mousemove', 'mousedown', 'click', 'touchstart', 'touchmove', 'pointerdown', 'keydown', 'wheel'].forEach(evtType => {
    document.addEventListener(evtType, () => { if (isPlayerOpen()) showPlayerControls(); }, { passive: true, capture: true });
});

playerBox.addEventListener('mousemove', showPlayerControls);
playerBox.addEventListener('touchstart', showPlayerControls, { passive: true });

function updateFullscreenButtonText() {
    const btn = document.getElementById('btnToggleFullscreen');
    if (!btn) return;
    btn.title = isInFullscreen() ? "Sair da Tela Cheia" : "Tela Cheia";
}

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
    document.addEventListener(evt, () => { updateFullscreenButtonText(); if (isPlayerOpen()) { forceShowControls(); showPlayerControls(); } });
});

document.getElementById('btnToggleFullscreen').onclick = (e) => {
    e.stopPropagation();
    if (!isInFullscreen()) {
        if (playerBox.requestFullscreen) playerBox.requestFullscreen();
        else if (playerBox.webkitRequestFullscreen) playerBox.webkitRequestFullscreen();
        else if (playerBox.msRequestFullscreen) playerBox.msRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }
    showPlayerControls();
};

function playVideo(rawUrl, mainTitle, subTitle) {
    if (!rawUrl) { showMsg('Nenhum link de vídeo fornecido!', 'error'); return; }
    const url = formatVideoUrl(rawUrl);
    document.getElementById('playerTitleDisplay').innerText = mainTitle || 'Assistindo Mídia';
    document.getElementById('playerSubDisplay').innerText = subTitle || 'MasterFlix';
    const oldIframe = playerContainer.querySelector('iframe');
    if (oldIframe) oldIframe.remove();
    playerLoading.classList.remove('hidden');
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('webkitallowfullscreen', 'true');
    iframe.setAttribute('mozallowfullscreen', 'true');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.style.cssText = 'width:100%; height:100%; border:none;';
    iframe.onload = () => setTimeout(() => playerLoading.classList.add('hidden'), 500);
    playerContainer.appendChild(iframe);
    document.getElementById('playerModal').classList.remove('hidden');
    enableNotificationBlocker();
    updateFullscreenButtonText();
    forceShowControls();
    showPlayerControls();
    setTimeout(() => playerLoading.classList.add('hidden'), 5000);
}

function closePlayer() {
    clearTimeout(controlsHideTimer);
    clearTimeout(cursorHideTimer);
    if (isInFullscreen()) { try { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch(e) {} }
    const iframe = playerContainer.querySelector('iframe');
    if (iframe) iframe.remove();
    playerLoading.classList.remove('hidden');
    document.getElementById('playerModal').classList.add('hidden');
    playerBox.classList.remove('cursor-hidden');
    playerControls.classList.remove('is-hidden');
    disableNotificationBlocker();
}

document.getElementById('btnClosePlayer').onclick = (e) => { e.stopPropagation(); closePlayer(); };

// ============ MEDIA FORM (SALVAR) ============
document.getElementById('mediaForm').onsubmit = async (e) => {
    e.preventDefault();
    if (selectedGenres.length === 0) { showMsg('⚠️ Selecione ao menos 1 gênero!', 'error'); return; }
    const editId = document.getElementById('editMediaId').value;
    const type = document.getElementById('mediaType').value;
    let coverBase64 = document.getElementById('mediaCoverPreview').src;
    let backdropBase64 = document.getElementById('mediaBackdropPreview').src;
    if ((!coverBase64 || coverBase64.includes('window.location')) && editId) { const existing = mediaCatalog.find(m => m.id === editId); if (existing) coverBase64 = existing.coverUrl; }
    if ((!backdropBase64 || backdropBase64.includes('window.location')) && editId) { const existing = mediaCatalog.find(m => m.id === editId); if (existing) backdropBase64 = existing.backdropUrl; }

    let payload = {
        type, genres: [...selectedGenres], category: selectedGenres[0],
        title: document.getElementById('mediaTitle').value.trim(),
        year: document.getElementById('mediaYear').value.trim(),
        duration: document.getElementById('mediaDuration').value.trim(),
        description: document.getElementById('mediaDesc').value.trim(),
        coverUrl: (coverBase64 && !coverBase64.includes('window.location')) ? coverBase64 : '',
        backdropUrl: (backdropBase64 && !backdropBase64.includes('window.location')) ? backdropBase64 : ''
    };

    if (type === 'movie') payload.videoUrl = document.getElementById('movieVideoUrl').value.trim();
    else {
        const updatedSeasons = [];
        for (let sIdx = 0; sIdx < seasonsBuilder.length; sIdx++) {
            const s = seasonsBuilder[sIdx];
            const seasonPrevImg = document.getElementById(`seasonCoverPrev_${sIdx}`);
            let sCover = seasonPrevImg ? seasonPrevImg.src : (s.seasonCoverUrl || '');
            if (sCover.includes('window.location')) sCover = '';
            const updatedEpisodes = [];
            for (let eIdx = 0; eIdx < (s.episodes || []).length; eIdx++) {
                const ep = s.episodes[eIdx];
                const epPrevImg = document.getElementById(`epThumbPrev_${sIdx}_${eIdx}`);
                let epThumb = epPrevImg ? epPrevImg.src : (ep.thumbUrl || '');
                if (epThumb.includes('window.location')) epThumb = '';
                updatedEpisodes.push({
                    title: (document.getElementById(`epTitle_${sIdx}_${eIdx}`)?.value?.trim()) || `Episódio ${eIdx + 1}`,
                    duration: (document.getElementById(`epDuration_${sIdx}_${eIdx}`)?.value?.trim()) || '',
                    videoUrl: (document.getElementById(`epVideoUrl_${sIdx}_${eIdx}`)?.value?.trim()) || '',
                    thumbUrl: epThumb
                });
            }
            updatedSeasons.push({ seasonNumber: s.seasonNumber || sIdx + 1, seasonCoverUrl: sCover, episodes: updatedEpisodes });
        }
        payload.seasons = updatedSeasons;
    }

    try {
        if (editId) { await set(ref(rtdb, "catalog/" + editId), payload); showMsg('Conteúdo atualizado!', 'success'); }
        else { const newRef = push(ref(rtdb, "catalog")); await set(newRef, payload); showMsg('Conteúdo publicado!', 'success'); }
        document.getElementById('creatorModal').classList.add('hidden');
        document.getElementById('mediaForm').reset();
        document.getElementById('mediaCoverPreview').classList.add('hidden');
        document.getElementById('mediaBackdropPreview').classList.add('hidden');
        seasonsBuilder = []; selectedGenres = [];
        await loadCatalog();
    } catch (err) { showMsg('Erro Firebase: ' + err.message, 'error'); }
};

// ============ ADMIN ============
window.editMedia = (id) => {
    const item = mediaCatalog.find(m => m.id === id);
    if (!item) return;
    document.getElementById('editMediaId').value = item.id;
    const typeSelect = document.getElementById('mediaType');
    typeSelect.value = item.type;
    typeSelect.disabled = true; typeSelect.style.cursor = 'not-allowed'; typeSelect.style.opacity = '0.6';
    typeSelect.dispatchEvent(new Event('change'));
    selectedGenres = Array.isArray(item.genres) && item.genres.length > 0 ? [...item.genres] : (item.category ? [item.category] : []);
    renderGenreSelector();
    document.getElementById('mediaTitle').value = item.title;
    document.getElementById('mediaYear').value = item.year;
    document.getElementById('mediaDuration').value = item.duration || '';
    document.getElementById('mediaDesc').value = item.description;
    document.getElementById('movieVideoUrl').value = item.videoUrl || '';
    if (item.coverUrl) { document.getElementById('mediaCoverPreview').src = item.coverUrl; document.getElementById('mediaCoverPreview').classList.remove('hidden'); }
    if (item.backdropUrl) { document.getElementById('mediaBackdropPreview').src = item.backdropUrl; document.getElementById('mediaBackdropPreview').classList.remove('hidden'); }
    document.getElementById('creatorTitle').innerText = "Editar Conteúdo";
    if (item.type === 'serie') { seasonsBuilder = JSON.parse(JSON.stringify(item.seasons || [])); renderSeasonsBuilder(); }
    document.getElementById('adminModal').classList.add('hidden');
    document.getElementById('creatorModal').classList.remove('hidden');
};

window.deleteMedia = async (id) => {
    if (confirm("Deseja apagar este item?")) {
        try { await remove(ref(rtdb, "catalog/" + id)); showMsg('Removido!', 'success'); loadCatalog(); }
        catch (e) { showMsg('Erro: ' + e.message, 'error'); }
    }
};

function renderAdminCatalogList() {
    const container = document.getElementById('adminCatalogList');
    const searchVal = normalizeText(document.getElementById('adminSearchInput').value);
    container.innerHTML = "";
    mediaCatalog.forEach(item => {
        if (searchVal && !normalizeText(item.title).includes(searchVal)) return;
        const div = document.createElement('div');
        div.className = 'admin-item';
        const genres = getItemGenres(item);
        div.innerHTML = `
            <div><strong style="font-size:13px;">${item.title}</strong><div style="font-size:10px; color:#aaa;">${item.type === 'movie' ? 'Filme' : 'Série'} • ${genres.join(', ')}</div></div>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary" style="font-size:11px; padding:5px 10px;" onclick="editMedia('${item.id}')">✏️ Editar</button>
                <button class="btn-secondary" style="font-size:11px; padding:5px 10px; color:#ff5252;" onclick="deleteMedia('${item.id}')">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });
}

document.getElementById('adminSearchInput').oninput = renderAdminCatalogList;
document.getElementById('btnCloseAdmin').onclick = () => document.getElementById('adminModal').classList.add('hidden');
document.getElementById('btnAddNewFromAdmin').onclick = () => { document.getElementById('adminModal').classList.add('hidden'); openCreator(); };

function openCreator() {
    document.getElementById('editMediaId').value = "";
    document.getElementById('mediaForm').reset();
    const typeSelect = document.getElementById('mediaType');
    typeSelect.disabled = false; typeSelect.style.cursor = 'pointer'; typeSelect.style.opacity = '1';
    typeSelect.dispatchEvent(new Event('change'));
    document.getElementById('movieVideoUrl').value = "";
    document.getElementById('mediaCoverPreview').classList.add('hidden');
    document.getElementById('mediaBackdropPreview').classList.add('hidden');
    document.getElementById('creatorTitle').innerText = "Publicar Conteúdo";
    seasonsBuilder = []; selectedGenres = [];
    renderGenreSelector();
    document.getElementById('seasonsList').innerHTML = "";
    addSeason();
    document.getElementById('creatorModal').classList.remove('hidden');
}

// ============ PROFILE ============
document.getElementById('btnSaveProfile').onclick = async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (!isTVDevice()) applyUserTheme(document.getElementById('themeColorPicker').value);
    const nameVal = document.getElementById('profileNameInput').value.trim();
    const bioVal = document.getElementById('profileBioInput').value.trim();
    const favGenreVal = document.getElementById('profileFavGenreInput').value;
    const photoBase64 = document.getElementById('profilePhotoPreview').src;
    const bannerBase64 = document.getElementById('profileBannerPreview').src;
    const userProfileData = {
        name: nameVal || '', bio: bioVal || '', favGenre: favGenreVal || 'Ação',
        photo: (photoBase64 && !photoBase64.includes('window.location')) ? photoBase64 : '',
        banner: (bannerBase64 && !bannerBase64.includes('window.location')) ? bannerBase64 : ''
    };
    try {
        await set(ref(rtdb, "users/" + user.uid), userProfileData);
        if (nameVal) localStorage.setItem('masterflix_user_name', nameVal);
        if (bioVal) localStorage.setItem('masterflix_user_bio', bioVal);
        if (favGenreVal) localStorage.setItem('masterflix_user_fav_genre', favGenreVal);
        if (userProfileData.photo) localStorage.setItem('masterflix_user_avatar', userProfileData.photo);
        if (userProfileData.banner) localStorage.setItem('masterflix_user_banner', userProfileData.banner);
        updateUserAvatarUI(userProfileData);
        showMsg('Perfil salvo!', 'success');
        document.getElementById('profileModal').classList.add('hidden');
    } catch(e) { showMsg('Erro: ' + e.message, 'error'); }
};

async function loadUserProfile(user) {
    if (!user) return;
    try { const snap = await get(ref(rtdb, "users/" + user.uid)); if (snap.exists()) updateUserAvatarUI(snap.val()); else updateUserAvatarUI({}); }
    catch(e) { console.error(e); }
}

function updateUserAvatarUI(data = {}) {
    const userName = data.name || localStorage.getItem('masterflix_user_name');
    const userBio = data.bio || localStorage.getItem('masterflix_user_bio');
    const userGenre = data.favGenre || localStorage.getItem('masterflix_user_fav_genre');
    const avatarData = data.photo || localStorage.getItem('masterflix_user_avatar');
    const bannerData = data.banner || localStorage.getItem('masterflix_user_banner');
    const user = auth.currentUser;
    const letter = userName ? userName.charAt(0).toUpperCase() : (user ? user.email.charAt(0).toUpperCase() : 'U');

    if (userName) {
        document.getElementById('profileNameDisplay').innerText = userName;
        document.getElementById('profileNameInput').value = userName;
        document.getElementById('sidebarUserName').innerText = userName;
    } else if (user) document.getElementById('sidebarUserName').innerText = user.email.split('@')[0];
    if (user) document.getElementById('sidebarUserEmail').innerText = user.email;
    if (userBio) { document.getElementById('profileBioDisplay').innerText = `"${userBio}"`; document.getElementById('profileBioInput').value = userBio; }
    if (userGenre) document.getElementById('profileFavGenreInput').value = userGenre;
    if (bannerData) { document.getElementById('profileBannerImg').src = bannerData; document.getElementById('profileBannerPreview').src = bannerData; document.getElementById('profileBannerPreview').classList.remove('hidden'); }

    const sidebarAvatar = document.getElementById('sidebarAvatar');
    sidebarAvatar.innerHTML = '';
    if (avatarData) {
        document.getElementById('avatarImg').src = avatarData; document.getElementById('avatarImg').classList.remove('hidden'); document.getElementById('avatarText').classList.add('hidden');
        document.getElementById('profileAvatarBigImg').src = avatarData; document.getElementById('profileAvatarBigImg').classList.remove('hidden'); document.getElementById('profileAvatarBigText').classList.add('hidden');
        document.getElementById('profilePhotoPreview').src = avatarData; document.getElementById('profilePhotoPreview').classList.remove('hidden');
        const imgSidebar = document.createElement('img'); imgSidebar.src = avatarData; sidebarAvatar.appendChild(imgSidebar);
    } else {
        document.getElementById('avatarText').innerText = letter; document.getElementById('avatarImg').classList.add('hidden'); document.getElementById('avatarText').classList.remove('hidden');
        document.getElementById('profileAvatarBigText').innerText = letter; document.getElementById('profileAvatarBigImg').classList.add('hidden'); document.getElementById('profileAvatarBigText').classList.remove('hidden');
        sidebarAvatar.innerHTML = `<span>${letter}</span>`;
    }
}

async function handleLogout() {
    try { await signOut(auth); document.getElementById('profileModal').classList.add('hidden'); closeSidebar(); showMsg('Você saiu.', 'success'); }
    catch (err) { showMsg('Erro: ' + err.message, 'error'); }
}

document.getElementById('btnLogout').onclick = handleLogout;

// ============ AUTH ============
document.getElementById('toggleAuthMode').onclick = () => {
    isSignUpMode = !isSignUpMode;
    document.getElementById('authSubtitle').innerText = isSignUpMode ? "Crie sua conta para continuar" : "Entre na sua conta para continuar";
    document.getElementById('btnAuthSubmit').innerText = isSignUpMode ? "Cadastrar" : "Entrar";
    document.getElementById('toggleAuthMode').innerText = isSignUpMode ? "Já tem uma conta? Entrar" : "Não tem uma conta? Criar";
};

document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim(), pass = document.getElementById('authPassword').value;
    try {
        if (isSignUpMode) { await createUserWithEmailAndPassword(auth, email, pass); showMsg('Conta criada!', 'success'); }
        else { await signInWithEmailAndPassword(auth, email, pass); showMsg('Seja bem-vindo!', 'success'); }
        document.getElementById('authOverlay').classList.add('hidden');
    } catch (err) { showMsg('Erro: ' + err.message, 'error'); }
};

// ============ BOTÕES DE MODAL ============
document.getElementById('btnOpenProfile').onclick = () => document.getElementById('profileModal').classList.remove('hidden');
document.getElementById('btnCloseProfile').onclick = () => document.getElementById('profileModal').classList.add('hidden');
document.getElementById('btnCloseCreator').onclick = () => document.getElementById('creatorModal').classList.add('hidden');
document.getElementById('btnCloseDetails').onclick = () => { window.location.hash = ''; document.getElementById('detailsModal').classList.add('hidden'); };

// ============ INICIALIZAÇÃO ============
renderGenreSelector();

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('authOverlay').classList.add('hidden');
        document.getElementById('profileEmailDisplay').innerText = user.email;
        loadUserProfile(user);
        if (user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase()) {
            document.getElementById('profileAdminBadge').classList.remove('hidden');
            document.getElementById('sidebarAdminItem').classList.remove('hidden');
            document.getElementById('sidebarCreatorItem').classList.remove('hidden');
        } else {
            document.getElementById('profileAdminBadge').classList.add('hidden');
            document.getElementById('sidebarAdminItem').classList.add('hidden');
            document.getElementById('sidebarCreatorItem').classList.add('hidden');
        }
        loadCatalog();
    } else {
        document.getElementById('authOverlay').classList.remove('hidden');
        document.getElementById('sidebarAdminItem').classList.add('hidden');
        document.getElementById('sidebarCreatorItem').classList.add('hidden');
    }
});
