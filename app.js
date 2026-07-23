// app.js - MasterFlix Application Logic

// --- ESTADO GLOBAL DA APLICAÇÃO ---
const state = {
    currentUser: null,
    catalog: [],
    continueList: [],
    suggestions: [],
    selectedGenres: [],
    currentMedia: null,
    currentSeasonIndex: 0,
    cropper: null,
    currentCropTarget: null,
    authMode: 'login', // 'login' ou 'register'
    isSelectModeSuggestions: false,
    selectedSuggestions: new Set()
};

// --- GÊNEROS DISPONÍVEIS ---
const AVAILABLE_GENRES = ["Ação", "Aventura", "Comédia", "Drama", "Terror", "Ficção Científica", "Romance", "Animação", "Documentário"];

// --- ELEMENTOS DO DOM ---
const $ = (id) => document.getElementById(id);

// --- INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    // Simulação/Carregamento inicial de dados locais ou Firebase
    loadMockData();
    renderCatalog();
    renderHero();
    setupGenreSelector();
    checkAuthStatus();
}

// --- ESTRUTURA DE DADOS MOCK (LOCALSTORAGE) ---
function loadMockData() {
    const localCatalog = localStorage.getItem("masterflix_catalog");
    if (localCatalog) {
        state.catalog = JSON.parse(localCatalog);
    } else {
        // Dados de exemplo
        state.catalog = [
            {
                id: "1",
                type: "movie",
                title: "Sonic the Hedgehog",
                year: "2020",
                duration: "1h 39m",
                genres: ["Ação", "Aventura", "Comédia"],
                desc: "Um ouriço azul velocista une forças com um policial para conter os planos nefastos do Doutor Robotnik.",
                cover: "https://via.placeholder.com/300x450/0044ff/ffffff?text=Sonic",
                backdrop: "https://via.placeholder.com/1280x720/002288/ffffff?text=Sonic+Banner",
                videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
            },
            {
                id: "2",
                type: "serie",
                title: "Série Espacial",
                year: "2023",
                duration: "2 Temporadas",
                genres: ["Ficção Científica", "Aventura"],
                desc: "Uma tripulação explora os confins do universo enfrentando perigos e criaturas desconhecidas.",
                cover: "https://via.placeholder.com/300x450/4400aa/ffffff?text=Serie+Espacial",
                backdrop: "https://via.placeholder.com/1280x720/220055/ffffff?text=Espacial+Banner",
                seasons: [
                    {
                        number: 1,
                        cover: "", // Sem foto da temporada (vai testar o fallback para o backdrop da série)
                        episodes: [
                            {
                                number: 1,
                                title: "Episódio 1: O Início",
                                thumb: "", // Sem foto do ep (fallback para temporada -> backdrop)
                                videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
                            },
                            {
                                number: 2,
                                title: "Episódio 2: A Descoberta",
                                thumb: "https://via.placeholder.com/320x180/aa00aa/ffffff?text=Ep2+Thumb",
                                videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
                            }
                        ]
                    }
                ]
            }
        ];
        saveCatalog();
    }

    const localUser = localStorage.getItem("masterflix_user");
    if (localUser) {
        state.currentUser = JSON.parse(localUser);
    } else {
        // Usuário padrão
        state.currentUser = {
            name: "Hkfatal",
            email: "ralyuri.freefire@gmail.com",
            bio: "Trabalhando no Site",
            favGenre: "Ação",
            role: "admin",
            avatar: "https://via.placeholder.com/150/8a2be2/ffffff?text=Coelho",
            banner: "https://via.placeholder.com/600x200/333/fff?text=Sonic+Header"
        };
    }
    updateUserUI();
}

function saveCatalog() {
    localStorage.setItem("masterflix_catalog", JSON.stringify(state.catalog));
}

function saveUser() {
    localStorage.setItem("masterflix_user", JSON.stringify(state.currentUser));
}

// --- NOTIFICAÇÕES ---
function showMsg(text, type = "success") {
    const msg = $("msg");
    msg.textContent = text;
    msg.className = `msg-${type}`;
    msg.classList.remove("hidden");
    setTimeout(() => {
        msg.classList.add("hidden");
    }, 3000);
}

// --- SETUP DE EVENTOS ---
function setupEventListeners() {
    // Header e Menu Lateral
    $("menuToggleBtn").addEventListener("click", toggleSidebar);
    $("sidebarCloseBtn").addEventListener("click", toggleSidebar);
    $("sidebarOverlay").addEventListener("click", toggleSidebar);

    // Navegação Sidebar
    document.querySelectorAll(".sidebar-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const nav = e.currentTarget.getAttribute("data-nav");
            handleNavigation(nav);
            toggleSidebar();
        });
    });

    // Header Scroll Effect
    window.addEventListener("scroll", () => {
        const header = $("mainHeader");
        if (window.scrollY > 50) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    });

    // Busca
    $("searchIconBtn").addEventListener("click", () => {
        const box = $("searchBox");
        box.classList.toggle("active");
        if (box.classList.contains("active")) {
            $("searchInput").focus();
        }
    });

    $("searchInput").addEventListener("input", (e) => {
        handleSearch(e.target.value);
    });

    // Perfil
    $("btnOpenProfile").addEventListener("click", openProfileModal);
    $("btnCloseProfile").addEventListener("click", () => $("profileModal").classList.add("hidden"));
    $("btnSaveProfile").addEventListener("click", saveProfileData);
    $("btnLogout").addEventListener("click", logout);

    // Player Modal
    $("btnClosePlayer").addEventListener("click", closePlayer);
    $("btnToggleFullscreen").addEventListener("click", toggleFullscreenPlayer);

    // Modal Detalhes
    $("btnCloseDetails").addEventListener("click", () => $("detailsModal").classList.add("hidden"));

    // Categorias Chips
    document.querySelectorAll(".category-chip").forEach(chip => {
        chip.addEventListener("click", (e) => {
            document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
            e.currentTarget.classList.add("active");
            filterCatalogByCategory(e.currentTarget.getAttribute("data-cat"));
        });
    });

    // Modais Admin/Criador
    $("btnCloseCreator")?.addEventListener("click", () => $("creatorModal").classList.add("hidden"));
    $("btnCloseAdmin")?.addEventListener("click", () => $("adminModal").classList.add("hidden"));
    $("btnCloseSuggestion")?.addEventListener("click", () => $("suggestionModal").classList.add("hidden"));
    $("btnCloseSuggestionsAdmin")?.addEventListener("click", () => $("suggestionsAdminModal").classList.add("hidden"));
    $("btnCloseStorage")?.addEventListener("click", () => $("storageModal").classList.add("hidden"));
    $("btnCloseCropper")?.addEventListener("click", () => $("cropperModal").classList.add("hidden"));

    // Form Criador
    $("mediaType")?.addEventListener("change", (e) => {
        if (e.target.value === "movie") {
            $("movieFileArea").classList.remove("hidden");
            $("seriesBuilderArea").classList.add("hidden");
        } else {
            $("movieFileArea").classList.add("hidden");
            $("seriesBuilderArea").classList.remove("hidden");
        }
    });

    $("mediaForm")?.addEventListener("submit", handleSaveMedia);
    $("btnAddSeasonBtn")?.addEventListener("click", addSeasonField);

    // Autenticação
    $("authForm")?.addEventListener("submit", handleAuthSubmit);
    $("toggleAuthMode")?.addEventListener("click", toggleAuthMode);
}

// --- NAVEGAÇÃO E SIDEBAR ---
function toggleSidebar() {
    $("sidebarMenu").classList.toggle("active");
    $("sidebarOverlay").classList.toggle("active");
}

function handleNavigation(nav) {
    switch (nav) {
        case "home":
            window.scrollTo({ top: 0, behavior: "smooth" });
            renderCatalog();
            break;
        case "movies":
            filterCatalogByType("movie");
            break;
        case "series":
            filterCatalogByType("serie");
            break;
        case "profile":
            openProfileModal();
            break;
        case "suggestions":
            $("suggestionModal").classList.remove("hidden");
            break;
        case "admin":
            openAdminModal();
            break;
        case "creator":
            openCreatorModal();
            break;
        case "suggestionsAdmin":
            openSuggestionsAdminModal();
            break;
        case "storage":
            openStorageModal();
            break;
        case "logout":
            logout();
            break;
    }
}

// --- AUTENTICAÇÃO E PERFIL ---
function checkAuthStatus() {
    if (!state.currentUser) {
        $("authOverlay").classList.remove("hidden");
    } else {
        $("authOverlay").classList.add("hidden");
        updateUserUI();
    }
}

function updateUserUI() {
    const u = state.currentUser;
    if (!u) return;

    $("sidebarUserName").textContent = u.name || "Usuário";
    $("sidebarUserEmail").textContent = u.email || "";

    if (u.avatar) {
        $("avatarImg").src = u.avatar;
        $("avatarImg").classList.remove("hidden");
        $("avatarText").classList.add("hidden");
    }

    if (u.role === "admin") {
        $("sidebarAdminItem").classList.remove("hidden");
        $("sidebarCreatorItem").classList.remove("hidden");
        $("sidebarSuggestionsAdminItem").classList.remove("hidden");
        $("sidebarStorageItem").classList.remove("hidden");
    }
}

function openProfileModal() {
    const u = state.currentUser;
    if (!u) return;

    $("profileNameInput").value = u.name || "";
    $("profileBioInput").value = u.bio || "";
    $("profileFavGenreInput").value = u.favGenre || "Ação";
    $("profileNameDisplay").textContent = u.name || "Usuário";
    $("profileEmailDisplay").textContent = u.email || "";
    $("profileBioDisplay").textContent = `"${u.bio || ""}"`;

    if (u.avatar) {
        $("profileAvatarBigImg").src = u.avatar;
        $("profileAvatarBigImg").classList.remove("hidden");
        $("profileAvatarBigText").classList.add("hidden");
    }

    if (u.banner) {
        $("profileBannerImg").src = u.banner;
    }

    if (u.role === "admin") {
        $("profileAdminBadge").classList.remove("hidden");
    }

    $("profileModal").classList.remove("hidden");
}

function saveProfileData() {
    state.currentUser.name = $("profileNameInput").value;
    state.currentUser.bio = $("profileBioInput").value;
    state.currentUser.favGenre = $("profileFavGenreInput").value;

    saveUser();
    updateUserUI();
    $("profileModal").classList.add("hidden");
    showMsg("Perfil atualizado com sucesso!");
}

function logout() {
    state.currentUser = null;
    localStorage.removeItem("masterflix_user");
    location.reload();
}

function toggleAuthMode() {
    state.authMode = state.authMode === "login" ? "register" : "login";
    $("authSubtitle").textContent = state.authMode === "login" ? "Entre na sua conta para continuar" : "Crie uma nova conta";
    $("btnAuthSubmit").textContent = state.authMode === "login" ? "Entrar na Conta" : "Cadastrar Conta";
    $("toggleAuthMode").textContent = state.authMode === "login" ? "Não tem uma conta? Crie agora" : "Já tem uma conta? Entre";
}

function handleAuthSubmit(e) {
    e.preventDefault();
    const email = $("authEmail").value;
    state.currentUser = {
        name: email.split("@")[0],
        email: email,
        role: "admin", // Padrão admin para testes
        bio: "Novo usuário"
    };
    saveUser();
    checkAuthStatus();
    showMsg("Bem-vindo ao MasterFlix!");
}

// --- RENDERIZAR CATALOGO & HERO ---
function renderHero() {
    if (state.catalog.length === 0) return;
    const item = state.catalog[0];

    $("heroBackdrop").style.backgroundImage = `url('${item.backdrop || item.cover}')`;
    $("heroTitle").textContent = item.title;
    $("heroMeta").textContent = `${item.year} • ${item.duration || ""} • ${item.genres ? item.genres.join(", ") : ""}`;
    $("heroDesc").textContent = item.desc;

    $("heroPlayBtn").onclick = () => playMedia(item);
    $("heroInfoBtn").onclick = () => openDetailsModal(item);
}

function renderCatalog() {
    const movies = state.catalog.filter(m => m.type === "movie");
    const series = state.catalog.filter(m => m.type === "serie");

    const moviesCarousel = $("moviesCarousel");
    const seriesCarousel = $("seriesCarousel");

    moviesCarousel.innerHTML = "";
    seriesCarousel.innerHTML = "";

    movies.forEach(item => moviesCarousel.appendChild(createMediaCard(item)));
    series.forEach(item => seriesCarousel.appendChild(createMediaCard(item)));
}

function createMediaCard(item) {
    const card = document.createElement("div");
    card.className = "media-card";
    card.innerHTML = `
        <img src="${item.cover}" class="media-card-poster" alt="${item.title}">
        <div class="media-card-overlay">
            <span class="media-card-tag">${item.type === "movie" ? "Filme" : "Série"}</span>
            <span class="media-card-title">${item.title}</span>
        </div>
    `;
    card.addEventListener("click", () => openDetailsModal(item));
    return card;
}

function filterCatalogByCategory(cat) {
    if (cat === "Todos") {
        renderCatalog();
        return;
    }
    const filtered = state.catalog.filter(m => m.genres && m.genres.includes(cat));
    $("moviesCarousel").innerHTML = "";
    $("seriesCarousel").innerHTML = "";

    filtered.forEach(item => {
        if (item.type === "movie") $("moviesCarousel").appendChild(createMediaCard(item));
        else $("seriesCarousel").appendChild(createMediaCard(item));
    });
}

function filterCatalogByType(type) {
    const filtered = state.catalog.filter(m => m.type === type);
    if (type === "movie") {
        $("seriesRow").classList.add("hidden");
        $("moviesRow").classList.remove("hidden");
        $("moviesCarousel").innerHTML = "";
        filtered.forEach(item => $("moviesCarousel").appendChild(createMediaCard(item)));
    } else {
        $("moviesRow").classList.add("hidden");
        $("seriesRow").classList.remove("hidden");
        $("seriesCarousel").innerHTML = "";
        filtered.forEach(item => $("seriesCarousel").appendChild(createMediaCard(item)));
    }
}

// --- BUSCA AVANÇADA ---
function handleSearch(query) {
    const dropdown = $("searchResultsDropdown");
    if (!query.trim()) {
        dropdown.classList.remove("visible");
        dropdown.innerHTML = "";
        return;
    }

    const q = query.toLowerCase();
    const results = state.catalog.filter(item => 
        item.title.toLowerCase().includes(q) || 
        (item.genres && item.genres.some(g => g.toLowerCase().includes(q)))
    );

    dropdown.innerHTML = "";
    if (results.length === 0) {
        dropdown.innerHTML = `<div style="padding: 15px; font-size: 12px; color: #aaa;">Nenhum resultado encontrado.</div>`;
    } else {
        results.forEach(item => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.innerHTML = `
                <img src="${item.cover}" class="search-result-thumb">
                <div class="search-result-info">
                    <div class="search-result-title">${highlightText(item.title, query)}</div>
                    <div class="search-result-meta">${item.type === 'movie' ? 'Filme' : 'Série'} • ${item.year}</div>
                </div>
            `;
            div.addEventListener("click", () => {
                openDetailsModal(item);
                dropdown.classList.remove("visible");
            });
            dropdown.appendChild(div);
        });
    }
    dropdown.classList.add("visible");
}

function highlightText(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// --- DETALHES DA MÍDIA & LÓGICA DE IMAGENS DE EPISÓDIOS (FALLBACK) ---
function openDetailsModal(item) {
    state.currentMedia = item;
    $("detailBackdropArea").style.backgroundImage = `url('${item.backdrop || item.cover}')`;
    $("detailPoster").src = item.cover;
    $("detailTitle").textContent = item.title;
    $("detailMeta").textContent = `${item.year} • ${item.duration || ""}`;
    $("detailDesc").textContent = item.desc;

    // Gêneros
    const genresBox = $("detailGenres");
    genresBox.innerHTML = "";
    if (item.genres) {
        item.genres.forEach(g => {
            const tag = document.createElement("span");
            tag.className = "genre-tag";
            tag.textContent = g;
            genresBox.appendChild(tag);
        });
    }

    // Filme vs Série
    if (item.type === "movie") {
        $("detailMovieArea").classList.remove("hidden");
        $("detailSerieArea").classList.add("hidden");
        $("btnPlayMovieFile").onclick = () => playMedia(item);
    } else {
        $("detailMovieArea").classList.add("hidden");
        $("detailSerieArea").classList.remove("hidden");
        renderSeriesSeasons(item);
    }

    $("detailsModal").classList.remove("hidden");
}

// LÓGICA PEDIDA DE FALLBACK DE FOTO DOS EPISÓDIOS
function renderSeriesSeasons(serie) {
    const seasonTabs = $("seasonTabs");
    seasonTabs.innerHTML = "";

    if (!serie.seasons || serie.seasons.length === 0) {
        $("episodesListContainer").innerHTML = `<div style="font-size:12px; color:#aaa;">Nenhum episódio cadastrado.</div>`;
        return;
    }

    serie.seasons.forEach((season, index) => {
        const btn = document.createElement("button");
        btn.className = `btn-secondary ${index === state.currentSeasonIndex ? 'active' : ''}`;
        btn.style.padding = "4px 12px";
        btn.style.fontSize = "12px";
        btn.textContent = `Temporada ${season.number || index + 1}`;
        btn.onclick = () => {
            state.currentSeasonIndex = index;
            renderSeriesSeasons(serie);
        };
        seasonTabs.appendChild(btn);
    });

    // Renderizar Episódios da Temporada Selecionada
    const currentSeason = serie.seasons[state.currentSeasonIndex] || serie.seasons[0];
    const epContainer = $("episodesListContainer");
    epContainer.innerHTML = "";

    if (currentSeason && currentSeason.episodes) {
        currentSeason.episodes.forEach(ep => {
            // REGRA DE FALLBACK DE IMAGEM: Episódio -> Temporada -> Capa/Backdrop da Série
            let epThumbSrc = ep.thumb;
            if (!epThumbSrc || epThumbSrc.trim() === "") {
                epThumbSrc = currentSeason.cover; // Foto da Temporada
            }
            if (!epThumbSrc || epThumbSrc.trim() === "") {
                epThumbSrc = serie.backdrop || serie.cover; // Foto da Capa / Fundo
            }

            const card = document.createElement("div");
            card.className = "episode-card";
            card.innerHTML = `
                <div class="episode-thumb">
                    <img src="${epThumbSrc}" alt="${ep.title}">
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 13px; font-weight: bold;">E${ep.number} - ${ep.title}</div>
                </div>
                <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;">▶</button>
            `;
            card.onclick = () => playMedia(item = { title: `${serie.title} - E${ep.number}`, videoUrl: ep.videoUrl });
            epContainer.appendChild(card);
        });
    }
}

// --- PLAYER DE VÍDEO COMPLETO E CORRIGIDO ---
function playMedia(item) {
    if (!item.videoUrl) {
        showMsg("Link de vídeo indisponível!", "error");
        return;
    }

    const playerModal = $("playerModal");
    const container = $("playerContainerView");
    const titleDisplay = $("playerTitleDisplay");
    const loading = $("playerLoading");

    titleDisplay.textContent = item.title;
    container.innerHTML = "";
    loading.classList.remove("hidden");

    // Criação do iframe adaptado para tela inteira
    const iframe = document.createElement("iframe");
    iframe.src = item.videoUrl;
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;

    iframe.onload = () => {
        loading.classList.add("hidden");
    };

    container.appendChild(iframe);
    playerModal.classList.remove("hidden");

    // Esconder barra superior do player após alguns segundos de inatividade
    setupPlayerControlsAutoFade();
}

function closePlayer() {
    const playerModal = $("playerModal");
    const container = $("playerContainerView");
    container.innerHTML = ""; // Para o áudio/vídeo imediatamente
    playerModal.classList.add("hidden");
}

function toggleFullscreenPlayer() {
    const elem = $("playerModal");
    if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => {
            showMsg("Erro ao ativar tela cheia.", "error");
        });
    } else {
        document.exitFullscreen();
    }
}

let playerFadeTimeout;
function setupPlayerControlsAutoFade() {
    const topBar = $("playerControlsTop");
    const box = $("playerModalBox");

    const showControls = () => {
        topBar.classList.remove("is-hidden");
        box.classList.remove("cursor-hidden");
        clearTimeout(playerFadeTimeout);
        playerFadeTimeout = setTimeout(() => {
            topBar.classList.add("is-hidden");
            box.classList.add("cursor-hidden");
        }, 3500);
    };

    box.onmousemove = showControls;
    box.onclick = showControls;
    showControls();
}

// --- CRIADOR / PUBLICAR MÍDIA ---
function openCreatorModal() {
    setupGenreSelector();
    $("creatorModal").classList.remove("hidden");
}

function setupGenreSelector() {
    const container = $("genreSelectorContainer");
    if (!container) return;
    container.innerHTML = "";
    AVAILABLE_GENRES.forEach(g => {
        const tag = document.createElement("span");
        tag.className = "genre-tag";
        tag.textContent = g;
        tag.onclick = () => {
            if (state.selectedGenres.includes(g)) {
                state.selectedGenres = state.selectedGenres.filter(item => item !== g);
                tag.classList.remove("selected");
            } else {
                state.selectedGenres.push(g);
                tag.classList.add("selected");
            }
        };
        container.appendChild(tag);
    });
}

function addSeasonField() {
    const container = $("seasonsList");
    const seasonIndex = container.children.length + 1;
    const seasonDiv = document.createElement("div");
    seasonDiv.style.border = "1px solid #333";
    seasonDiv.style.padding = "10px";
    seasonDiv.style.borderRadius = "6px";
    seasonDiv.style.marginBottom = "10px";

    seasonDiv.innerHTML = `
        <h5 style="margin-bottom: 8px;">Temporada ${seasonIndex}</h5>
        <div class="input-group">
            <label>Link Foto da Temporada (Opcional)</label>
            <input type="text" class="input-control season-cover-input">
        </div>
        <div class="episodes-builder-list"></div>
        <button type="button" class="btn-secondary add-ep-btn" style="font-size: 11px; margin-top: 5px;">+ Episódio</button>
    `;

    const epList = seasonDiv.querySelector(".episodes-builder-list");
    seasonDiv.querySelector(".add-ep-btn").onclick = () => addEpisodeField(epList);

    container.appendChild(seasonDiv);
    addEpisodeField(epList); // Adiciona 1º episódio por padrão
}

function addEpisodeField(container) {
    const epIndex = container.children.length + 1;
    const epDiv = document.createElement("div");
    epDiv.style.display = "flex";
    epDiv.style.gap = "6px";
    epDiv.style.marginTop = "6px";

    epDiv.innerHTML = `
        <input type="text" class="input-control ep-title" placeholder="Título Ep ${epIndex}" style="flex:1;">
        <input type="text" class="input-control ep-thumb" placeholder="Thumb Ep (Opcional)" style="flex:1;">
        <input type="text" class="input-control ep-url" placeholder="URL Vídeo" style="flex:1;">
    `;
    container.appendChild(epDiv);
}

function handleSaveMedia(e) {
    e.preventDefault();
    const type = $("mediaType").value;
    const title = $("mediaTitle").value;
    const year = $("mediaYear").value;
    const duration = $("mediaDuration").value;
    const desc = $("mediaDesc").value;

    const newMedia = {
        id: Date.now().toString(),
        type,
        title,
        year,
        duration,
        desc,
        genres: [...state.selectedGenres],
        cover: $("mediaCoverPreview").src || "https://via.placeholder.com/300x450?text=Capa",
        backdrop: $("mediaBackdropPreview").src || "https://via.placeholder.com/1280x720?text=Banner"
    };

    if (type === "movie") {
        newMedia.videoUrl = $("movieVideoUrl").value;
    } else {
        newMedia.seasons = [];
        const seasonNodes = document.querySelectorAll("#seasonsList > div");
        seasonNodes.forEach((sNode, sIdx) => {
            const seasonCover = sNode.querySelector(".season-cover-input").value;
            const epNodes = sNode.querySelectorAll(".episodes-builder-list > div");
            const episodes = [];

            epNodes.forEach((eNode, eIdx) => {
                episodes.push({
                    number: eIdx + 1,
                    title: eNode.querySelector(".ep-title").value || `Episódio ${eIdx + 1}`,
                    thumb: eNode.querySelector(".ep-thumb").value,
                    videoUrl: eNode.querySelector(".ep-url").value
                });
            });

            newMedia.seasons.push({
                number: sIdx + 1,
                cover: seasonCover,
                episodes: episodes
            });
        });
    }

    state.catalog.unshift(newMedia);
    saveCatalog();
    renderCatalog();
    renderHero();
    $("creatorModal").classList.add("hidden");
    showMsg("Mídia salva com sucesso!");
}

// --- ADMIN E OUTROS MODAIS ---
function openAdminModal() {
    const container = $("adminCatalogList");
    container.innerHTML = "";
    state.catalog.forEach(item => {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.justifyContent = "space-between";
        div.style.padding = "8px";
        div.style.background = "#222";
        div.style.borderRadius = "6px";

        div.innerHTML = `
            <span style="font-size: 13px;">${item.title} (${item.type})</span>
            <button class="btn-secondary" style="color:#ff5252; padding:4px 8px; font-size:11px;">Excluir</button>
        `;
        div.querySelector("button").onclick = () => {
            state.catalog = state.catalog.filter(m => m.id !== item.id);
            saveCatalog();
            openAdminModal();
            renderCatalog();
        };
        container.appendChild(div);
    });
    $("adminModal").classList.remove("hidden");
}

function openSuggestionsAdminModal() {
    $("suggestionsAdminModal").classList.remove("hidden");
}

function openStorageModal() {
    $("storageContent").innerHTML = `
        <p style="font-size: 13px; color: #ccc;">Itens no Catálogo: <strong>${state.catalog.length}</strong></p>
        <p style="font-size: 13px; color: #ccc;">Uso do LocalStorage: <strong>${(JSON.stringify(localStorage).length / 1024).toFixed(2)} KB</strong></p>
    `;
    $("storageModal").classList.remove("hidden");
}

// --- CROPPER DE IMAGENS ---
window.triggerCropModal = function(fileInputId, previewImgId, aspectRatio) {
    const input = $(fileInputId);
    input.click();
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const cropperImg = $("cropperImage");
                cropperImg.src = event.target.result;
                $("cropperModal").classList.remove("hidden");

                if (state.cropper) state.cropper.destroy();
                state.cropper = new Cropper(cropperImg, {
                    aspectRatio: aspectRatio,
                    viewMode: 1
                });

                $("btnConfirmCrop").onclick = () => {
                    const canvas = state.cropper.getCroppedCanvas();
                    $(previewImgId).src = canvas.toDataURL();
                    $(previewImgId).classList.remove("hidden");
                    $("cropperModal").classList.add("hidden");
                };
            };
            reader.readAsDataURL(file);
        }
    };
};

