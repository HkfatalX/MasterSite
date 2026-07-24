// MasterFlix - App Core com Suporte a Múltiplos Players

// Gêneros disponíveis
const ALL_GENRES = [
    "Ação", "Comédia", "Drama", "Terror", "Animação", 
    "Ficção Científica", "Romance", "Aventura", "Fantasia", "Suspense"
];

// Dados Iniciais em Memória
let catalog = JSON.parse(localStorage.getItem('masterflix_catalog')) || [
    {
        id: "m1",
        type: "movie",
        title: "Inception",
        year: "2010",
        duration: "2h 28m",
        genres: ["Ação", "Ficção Científica", "Suspense"],
        desc: "Um ladrão que rouba segredos corporativos por meio do uso da tecnologia de compartilhamento de sonhos é dada a tarefa inversa de plantar uma idéia na mente de um C.E.O.",
        cover: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80",
        backdrop: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&q=80",
        players: [
            { name: "MixDrop - Dublado", url: "https://mixdrop.ag/e/example1" },
            { name: "Streamtape - Legendado", url: "https://streamtape.com/e/example2" }
        ]
    },
    {
        id: "s1",
        type: "serie",
        title: "Stranger Things",
        year: "2016",
        duration: "4 Temporadas",
        genres: ["Drama", "Terror", "Ficção Científica"],
        desc: "Quando um garoto desaparece, uma pequena cidade descobre um mistério envolvendo experimentos secretos, forças sobrenaturais aterrorizantes e uma garotinha estranha.",
        cover: "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=500&q=80",
        backdrop: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80",
        seasons: [
            {
                number: 1,
                episodes: [
                    { number: 1, title: "Capítulo Um: O Desaparecimento de Will Byers", url: "https://mixdrop.ag/e/st_s1e1" },
                    { number: 2, title: "Capítulo Dois: A Esquisita da Rua Maple", url: "https://mixdrop.ag/e/st_s1e2" }
                ]
            }
        ]
    }
];

let currentUser = JSON.parse(localStorage.getItem('masterflix_user')) || {
    name: "Usuário Pro",
    email: "usuario@masterflix.com",
    isAdmin: true,
    bio: "Maratonando os melhores lançamentos!",
    avatar: ""
};

let selectedGenres = [];
let currentMoviePlayers = [];
let selectedPlayerUrl = "";
let currentItemDetails = null;

// Salva Catálogo
function saveCatalog() {
    localStorage.setItem('masterflix_catalog', JSON.stringify(catalog));
}

// Utilitário de Toast
function showToast(text, type = 'success') {
    const msg = document.getElementById('msg');
    msg.textContent = text;
    msg.className = type === 'success' ? 'msg-success' : 'msg-error';
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3500);
}

// Modal Helpers
function openModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) {
        m.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }
}

function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) {
        m.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
}

// Inicialização Geral
document.addEventListener('DOMContentLoaded', () => {
    initHeaderAndSidebar();
    initGenreSelector();
    initPlayersCreatorArea();
    renderCatalog();
    updateUserInterface();
    initEventListeners();
});

// UI Header e Sidebar
function initHeaderAndSidebar() {
    const mainHeader = document.getElementById('mainHeader');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) mainHeader.classList.add('scrolled');
        else mainHeader.classList.remove('scrolled');
    });

    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const sidebarMenu = document.getElementById('sidebarMenu');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    function toggleSidebar() {
        sidebarMenu.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
        menuToggleBtn.classList.toggle('active');
    }

    menuToggleBtn?.addEventListener('click', toggleSidebar);
    sidebarOverlay?.addEventListener('click', toggleSidebar);
    sidebarCloseBtn?.addEventListener('click', toggleSidebar);

    // Sidebar Items Navigation
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
            const nav = item.getAttribute('data-nav');
            if (nav === 'creator') openCreatorModal();
            else if (nav === 'admin') openModal('adminModal');
            else if (nav === 'profile') openModal('profileModal');
            else if (nav === 'suggestions') openModal('suggestionModal');
            else if (nav === 'suggestionsAdmin') openModal('suggestionsAdminModal');
            else if (nav === 'storage') openModal('storageModal');
            else if (nav === 'logout') {
                showToast("Sessão encerrada!");
                openModal('authOverlay');
            }
            toggleSidebar();
        });
    });
}

// Atualizar Dados do Usuário
function updateUserInterface() {
    document.getElementById('sidebarUserName').textContent = currentUser.name;
    document.getElementById('sidebarUserEmail').textContent = currentUser.email;
    document.getElementById('profileNameDisplay').textContent = currentUser.name;
    document.getElementById('profileEmailDisplay').textContent = currentUser.email;
    document.getElementById('profileBioDisplay').textContent = `"${currentUser.bio}"`;

    if (currentUser.isAdmin) {
        document.getElementById('sidebarAdminItem')?.classList.remove('hidden');
        document.getElementById('sidebarCreatorItem')?.classList.remove('hidden');
        document.getElementById('sidebarSuggestionsAdminItem')?.classList.remove('hidden');
        document.getElementById('sidebarStorageItem')?.classList.remove('hidden');
        document.getElementById('profileAdminBadge')?.classList.remove('hidden');
    }
}

// Selector de Gêneros
function initGenreSelector() {
    const container = document.getElementById('genreSelectorContainer');
    if (!container) return;
    container.innerHTML = '';

    ALL_GENRES.forEach(genre => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.textContent = genre;
        tag.addEventListener('click', () => {
            if (selectedGenres.includes(genre)) {
                selectedGenres = selectedGenres.filter(g => g !== genre);
                tag.classList.remove('selected');
            } else {
                selectedGenres.push(genre);
                tag.classList.add('selected');
            }
            document.getElementById('genreCounter').textContent = 
                selectedGenres.length > 0 ? `${selectedGenres.length} selecionado(s)` : 'Nenhum';
        });
        container.appendChild(tag);
    });
}

// ----------------------------------------------------
// GERENCIAR INPUTS DE PLAYERS NO MÓDULO CRIADOR
// ----------------------------------------------------
const playersInputsContainer = document.getElementById('playersInputsContainer');
const btnAddPlayerInput = document.getElementById('btnAddPlayerInput');

function initPlayersCreatorArea() {
    btnAddPlayerInput?.addEventListener('click', () => addPlayerInputRow());
}

function addPlayerInputRow(name = '', url = '') {
    if (!playersInputsContainer) return;
    const row = document.createElement('div');
    row.className = 'player-input-row';
    row.style.cssText = 'display:flex; gap:8px; align-items:center;';

    row.innerHTML = `
        <input type="text" class="player-name-input" placeholder="Nome Ex: MixDrop" value="${name}" style="flex:1; padding:10px; background:#0f0f0f; border:1.5px solid #2a2a2a; color:#fff; border-radius:8px; font-size:13px;" required>
        <input type="url" class="player-url-input" placeholder="https://..." value="${url}" style="flex:2; padding:10px; background:#0f0f0f; border:1.5px solid #2a2a2a; color:#fff; border-radius:8px; font-size:13px;" required>
        <button type="button" class="btn-danger remove-player-btn" style="padding:8px 12px;">✕</button>
    `;

    row.querySelector('.remove-player-btn').addEventListener('click', () => {
        if (playersInputsContainer.children.length > 1) {
            row.remove();
        } else {
            showToast("O filme precisa ter pelo menos 1 player!", "error");
        }
    });

    playersInputsContainer.appendChild(row);
}

function resetPlayerInputs(existingPlayers = []) {
    if (!playersInputsContainer) return;
    playersInputsContainer.innerHTML = '';
    if (existingPlayers && existingPlayers.length > 0) {
        existingPlayers.forEach(p => addPlayerInputRow(p.name, p.url));
    } else {
        addPlayerInputRow('Principal', '');
    }
}

function getPlayersFromForm() {
    if (!playersInputsContainer) return [];
    const rows = playersInputsContainer.querySelectorAll('.player-input-row');
    const players = [];

    rows.forEach(row => {
        const name = row.querySelector('.player-name-input').value.trim();
        const url = row.querySelector('.player-url-input').value.trim();
        if (name && url) {
            players.push({ name, url });
        }
    });

    return players;
}

// Abrir Criador
function openCreatorModal(itemToEdit = null) {
    const form = document.getElementById('mediaForm');
    form.reset();
    selectedGenres = [];
    document.querySelectorAll('.genre-tag').forEach(t => t.classList.remove('selected'));
    document.getElementById('genreCounter').textContent = 'Nenhum';

    if (itemToEdit) {
        document.getElementById('creatorTitle').textContent = 'Editar Mídia';
        document.getElementById('editMediaId').value = itemToEdit.id;
        document.getElementById('mediaType').value = itemToEdit.type;
        document.getElementById('mediaTitle').value = itemToEdit.title;
        document.getElementById('mediaYear').value = itemToEdit.year;
        document.getElementById('mediaDuration').value = itemToEdit.duration || '';
        document.getElementById('mediaDesc').value = itemToEdit.desc;

        selectedGenres = itemToEdit.genres || [];
        document.querySelectorAll('.genre-tag').forEach(tag => {
            if (selectedGenres.includes(tag.textContent)) tag.classList.add('selected');
        });
        document.getElementById('genreCounter').textContent = `${selectedGenres.length} selecionado(s)`;

        resetPlayerInputs(itemToEdit.players || []);
    } else {
        document.getElementById('creatorTitle').textContent = 'Publicar Nova Mídia';
        document.getElementById('editMediaId').value = '';
        resetPlayerInputs();
    }

    openModal('creatorModal');
}

// ----------------------------------------------------
// EXIBIR E SELECIONAR PLAYERS NO MODAL DE DETALHES
// ----------------------------------------------------
function renderPlayerOptions(players) {
    const playerSelectionGroup = document.getElementById('playerSelectionGroup');
    const playerButtonsContainer = document.getElementById('playerButtonsContainer');
    const btnPlayMovieFile = document.getElementById('btnPlayMovieFile');

    currentMoviePlayers = players || [];
    playerButtonsContainer.innerHTML = '';

    if (currentMoviePlayers.length === 0) {
        playerSelectionGroup.classList.add('hidden');
        selectedPlayerUrl = '';
        return;
    }

    // Se tiver apenas 1 player: esconde os botões e seleciona ele direto
    if (currentMoviePlayers.length < 2) {
        playerSelectionGroup.classList.add('hidden');
        selectedPlayerUrl = currentMoviePlayers[0].url;
    } 
    // Se tiver 2 ou mais players: exibe a lista de botões
    else {
        playerSelectionGroup.classList.remove('hidden');
        selectedPlayerUrl = currentMoviePlayers[0].url;

        currentMoviePlayers.forEach((player, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = index === 0 ? 'category-chip active' : 'category-chip';
            btn.textContent = player.name;
            
            btn.addEventListener('click', () => {
                playerButtonsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedPlayerUrl = player.url;
            });

            playerButtonsContainer.appendChild(btn);
        });
    }

    btnPlayMovieFile.onclick = () => {
        if (selectedPlayerUrl) {
            openPlayerModal(currentItemDetails?.title || "Filme", selectedPlayerUrl);
        } else {
            showToast('Nenhum player disponível!', 'error');
        }
    };
}

// Abrir Detalhes
function openDetailsModal(item) {
    currentItemDetails = item;
    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailMeta').textContent = `${item.year} • ${item.duration || ''}`;
    document.getElementById('detailDesc').textContent = item.desc;
    document.getElementById('detailPoster').src = item.cover;
    document.getElementById('detailBackdropArea').style.backgroundImage = `url('${item.backdrop || item.cover}')`;

    const genresBox = document.getElementById('detailGenres');
    genresBox.innerHTML = '';
    (item.genres || []).forEach(g => {
        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.style.cssText = 'background:rgba(255,255,255,0.08); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; color:#ccc;';
        badge.textContent = g;
        genresBox.appendChild(badge);
    });

    if (item.type === 'movie') {
        document.getElementById('detailMovieArea').classList.remove('hidden');
        document.getElementById('detailSerieArea').classList.add('hidden');
        renderPlayerOptions(item.players || []);
    } else {
        document.getElementById('detailMovieArea').classList.add('hidden');
        document.getElementById('detailSerieArea').classList.remove('hidden');
        renderSeriesEpisodes(item);
    }

    openModal('detailsModal');
}

// Renderizar Episódios da Série
function renderSeriesEpisodes(serie) {
    const seasonTabs = document.getElementById('seasonTabs');
    const container = document.getElementById('episodesListContainer');
    seasonTabs.innerHTML = '';
    container.innerHTML = '';

    const seasons = serie.seasons || [];
    if (seasons.length === 0) {
        container.innerHTML = '<p style="color:#888; font-size:12px;">Nenhum episódio cadastrado.</p>';
        return;
    }

    seasons.forEach((season, index) => {
        const tab = document.createElement('div');
        tab.className = index === 0 ? 'season-tab active' : 'season-tab';
        tab.textContent = `Temporada ${season.number}`;
        tab.addEventListener('click', () => {
            seasonTabs.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            displayEpisodesList(season.episodes);
        });
        seasonTabs.appendChild(tab);
    });

    displayEpisodesList(seasons[0].episodes);
}

function displayEpisodesList(episodes = []) {
    const container = document.getElementById('episodesListContainer');
    container.innerHTML = '';

    episodes.forEach(ep => {
        const card = document.createElement('div');
        card.className = 'episode-card';
        card.innerHTML = `
            <div class="episode-thumb">
                <div class="ep-play-overlay"><span>▶</span></div>
            </div>
            <div style="flex:1;">
                <div style="font-size:13px; font-weight:700;">E${ep.number} - ${ep.title}</div>
            </div>
        `;
        card.addEventListener('click', () => {
            openPlayerModal(`${currentItemDetails.title} - E${ep.number}`, ep.url);
        });
        container.appendChild(card);
    });
}

// ----------------------------------------------------
// PLAYER MODAL DE VÍDEO
// ----------------------------------------------------
function openPlayerModal(title, videoUrl) {
    document.getElementById('playerTitleDisplay').textContent = title;
    const view = document.getElementById('playerContainerView');
    const loading = document.getElementById('playerLoading');

    loading.classList.remove('hidden');

    // Remove iframe antigo
    const oldIframe = view.querySelector('iframe');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.src = videoUrl;
    iframe.allow = "autoplay; fullscreen";
    iframe.onload = () => loading.classList.add('hidden');

    view.appendChild(iframe);
    openModal('playerModal');
}

// Renderizar Catálogo
function renderCatalog() {
    const moviesCarousel = document.getElementById('moviesCarousel');
    const seriesCarousel = document.getElementById('seriesCarousel');

    moviesCarousel.innerHTML = '';
    seriesCarousel.innerHTML = '';

    catalog.forEach(item => {
        const card = document.createElement('div');
        card.className = 'media-card';
        card.innerHTML = `
            <img class="media-card-poster" src="${item.cover}" alt="${item.title}">
            <div class="media-card-overlay">
                <div class="media-card-tag">${item.type === 'movie' ? 'Filme' : 'Série'}</div>
                <div class="media-card-title">${item.title}</div>
            </div>
        `;
        card.addEventListener('click', () => openDetailsModal(item));

        if (item.type === 'movie') moviesCarousel.appendChild(card);
        else seriesCarousel.appendChild(card);
    });

    // Hero Banner
    if (catalog.length > 0) {
        const hero = catalog[0];
        document.getElementById('heroTitle').textContent = hero.title;
        document.getElementById('heroMeta').innerHTML = `<span>${hero.year}</span> <span class="dot">•</span> <span>${hero.duration || ''}</span>`;
        document.getElementById('heroDesc').textContent = hero.desc;
        document.getElementById('heroBackdrop').style.backgroundImage = `url('${hero.backdrop || hero.cover}')`;
        document.getElementById('heroPlayBtn').onclick = () => openDetailsModal(hero);
        document.getElementById('heroInfoBtn').onclick = () => openDetailsModal(hero);
    }
}

// Eventos Globais e Formulários
function initEventListeners() {
    // Submeter formulário de criar/editar
    document.getElementById('mediaForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('editMediaId').value;
        const type = document.getElementById('mediaType').value;
        const title = document.getElementById('mediaTitle').value;
        const year = document.getElementById('mediaYear').value;
        const duration = document.getElementById('mediaDuration').value;
        const desc = document.getElementById('mediaDesc').value;

        const players = getPlayersFromForm();

        if (id) {
            const index = catalog.findIndex(x => x.id === id);
            if (index !== -1) {
                catalog[index] = {
                    ...catalog[index],
                    type, title, year, duration, desc,
                    genres: selectedGenres,
                    players
                };
            }
        } else {
            const newItem = {
                id: 'm_' + Date.now(),
                type, title, year, duration, desc,
                genres: selectedGenres,
                cover: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80",
                backdrop: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&q=80",
                players
            };
            catalog.push(newItem);
        }

        saveCatalog();
        renderCatalog();
        closeModal('creatorModal');
        showToast("Mídia salva com sucesso!");
    });

    // Botão Fechar Modal Generico
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal.id);
        });
    });

    // Fechar Player Modal
    document.getElementById('btnClosePlayer')?.addEventListener('click', () => {
        const view = document.getElementById('playerContainerView');
        const iframe = view.querySelector('iframe');
        if (iframe) iframe.remove();
        closeModal('playerModal');
    });

    // Pesquisa
    const searchInput = document.getElementById('searchInput');
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const dropdown = document.getElementById('searchResultsDropdown');
        if (!query) {
            dropdown.classList.remove('visible');
            return;
        }

        const filtered = catalog.filter(i => i.title.toLowerCase().includes(query));
        dropdown.innerHTML = '<div class="search-results-header">Resultados</div>';

        if (filtered.length === 0) {
            dropdown.innerHTML += '<div class="search-no-results">Nenhum título encontrado.</div>';
        } else {
            filtered.forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-result-item';
                row.innerHTML = `
                    <img class="search-result-thumb" src="${item.cover}">
                    <div class="search-result-info">
                        <div class="search-result-title">${item.title}</div>
                        <div class="search-result-meta"><span class="type-badge">${item.type}</span> ${item.year}</div>
                    </div>
                `;
                row.addEventListener('click', () => {
                    dropdown.classList.remove('visible');
                    openDetailsModal(item);
                });
                dropdown.appendChild(row);
            });
        }
        dropdown.classList.add('visible');
    });

    document.getElementById('searchIconBtn')?.addEventListener('click', () => {
        document.getElementById('searchBox').classList.toggle('active');
    });
}

