// MasterFlix - Core com Suporte a Múltiplos Players em Filmes e Episódios de Séries

const ALL_GENRES = [
    "Ação", "Comédia", "Drama", "Terror", "Animação", 
    "Ficção Científica", "Romance", "Aventura", "Fantasia", "Suspense"
];

// Dados Iniciais com Exemplo de Séries e Múltiplos Players por Episódio
let catalog = JSON.parse(localStorage.getItem('masterflix_catalog')) || [
    {
        id: "m1",
        type: "movie",
        title: "Inception",
        year: "2010",
        duration: "2h 28m",
        genres: ["Ação", "Ficção Científica", "Suspense"],
        desc: "Um ladrão que rouba segredos corporativos por meio do uso da tecnologia de compartilhamento de sonhos.",
        cover: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80",
        backdrop: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&q=80",
        players: [
            { name: "MixDrop - Dublado", url: "https://mixdrop.top/e/8l4374qzunqml0" },
            { name: "StreamTape - Legendado", url: "https://streamtape.com/e/example" }
        ]
    },
    {
        id: "s1",
        type: "serie",
        title: "Breaking Bad",
        year: "2008",
        duration: "5 Temporadas",
        genres: ["Drama", "Suspense"],
        desc: "Um professor de química do ensino médio diagnosticado com câncer de pulmão inoperável se transforma em um produtor e vendedor de metanfetamina.",
        cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80",
        backdrop: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80",
        seasons: [
            {
                number: 1,
                episodes: [
                    {
                        number: 1,
                        title: "Piloto",
                        duration: "58min",
                        players: [
                            { name: "MixDrop", url: "https://mixdrop.top/e/8l4374qzunqml0" },
                            { name: "DoodStream", url: "https://dood.to/e/example1" }
                        ]
                    },
                    {
                        number: 2,
                        title: "O Gato Está na Sacola...",
                        duration: "48min",
                        players: [
                            { name: "MixDrop", url: "https://mixdrop.top/f/7kr3166mc94nee" },
                            { name: "StreamTape", url: "https://streamtape.com/e/example2" }
                        ]
                    }
                ]
            }
        ]
    }
];

let currentUser = JSON.parse(localStorage.getItem('masterflix_user')) || {
    name: "Administrador",
    email: "admin@masterflix.com",
    isAdmin: true
};

let selectedGenres = [];
let selectedMoviePlayerUrl = "";
let currentItemDetails = null;

function saveCatalog() {
    localStorage.setItem('masterflix_catalog', JSON.stringify(catalog));
}

function showToast(text, type = 'success') {
    const msg = document.getElementById('msg');
    msg.textContent = text;
    msg.className = type === 'success' ? 'msg-success' : 'msg-error';
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3500);
}

function openModal(modalId) {
    document.getElementById(modalId)?.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initHeaderAndSidebar();
    initGenreSelector();
    initMoviePlayersCreatorArea();
    initSeriesBuilderArea();
    renderCatalog();
    initEventListeners();
});

function initHeaderAndSidebar() {
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

    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
            const nav = item.getAttribute('data-nav');
            if (nav === 'creator') openCreatorModal();
            toggleSidebar();
        });
    });

    if (currentUser.isAdmin) {
        document.getElementById('sidebarCreatorItem')?.classList.remove('hidden');
    }
}

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
// PLAYERS PARA FILME (NO CRIADOR)
// ----------------------------------------------------
const playersInputsContainer = document.getElementById('playersInputsContainer');
const btnAddPlayerInput = document.getElementById('btnAddPlayerInput');

function initMoviePlayersCreatorArea() {
    btnAddPlayerInput?.addEventListener('click', () => addMoviePlayerInputRow());
}

function addMoviePlayerInputRow(name = '', url = '') {
    if (!playersInputsContainer) return;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:8px; align-items:center;';
    row.className = 'movie-player-row';

    row.innerHTML = `
        <input type="text" class="player-name-input" placeholder="Servidor (Ex: MixDrop)" value="${name}" style="flex:1; padding:10px; background:#0f0f0f; border:1.5px solid #2a2a2a; color:#fff; border-radius:8px; font-size:13px;" required>
        <input type="url" class="player-url-input" placeholder="https://..." value="${url}" style="flex:2; padding:10px; background:#0f0f0f; border:1.5px solid #2a2a2a; color:#fff; border-radius:8px; font-size:13px;" required>
        <button type="button" class="btn-danger remove-player-btn" style="padding:8px 12px;">✕</button>
    `;

    row.querySelector('.remove-player-btn').addEventListener('click', () => {
        if (playersInputsContainer.children.length > 1) row.remove();
        else showToast("Mínimo de 1 player necessário!", "error");
    });

    playersInputsContainer.appendChild(row);
}

function resetMoviePlayerInputs(existing = []) {
    if (!playersInputsContainer) return;
    playersInputsContainer.innerHTML = '';
    if (existing.length > 0) existing.forEach(p => addMoviePlayerInputRow(p.name, p.url));
    else addMoviePlayerInputRow('MixDrop', '');
}

function getMoviePlayersFromForm() {
    const rows = playersInputsContainer.querySelectorAll('.movie-player-row');
    const list = [];
    rows.forEach(r => {
        const name = r.querySelector('.player-name-input').value.trim();
        const url = r.querySelector('.player-url-input').value.trim();
        if (name && url) list.push({ name, url });
    });
    return list;
}

// ----------------------------------------------------
// CONSTRUTOR DE TEMPORADAS E EPISÓDIOS COM MÚLTIPLOS PLAYERS
// ----------------------------------------------------
const seasonsListContainer = document.getElementById('seasonsList');
const btnAddSeasonBtn = document.getElementById('btnAddSeasonBtn');

function initSeriesBuilderArea() {
    document.getElementById('mediaType')?.addEventListener('change', (e) => {
        const type = e.target.value;
        if (type === 'serie') {
            document.getElementById('seriesBuilderArea').classList.remove('hidden');
            document.getElementById('movieFileArea').classList.add('hidden');
        } else {
            document.getElementById('seriesBuilderArea').classList.add('hidden');
            document.getElementById('movieFileArea').classList.remove('hidden');
        }
    });

    btnAddSeasonBtn?.addEventListener('click', () => addSeasonBlock());
}

function addSeasonBlock(seasonData = null) {
    const seasonNumber = seasonsListContainer.children.length + 1;
    const seasonBlock = document.createElement('div');
    seasonBlock.className = 'season-block';
    
    seasonBlock.innerHTML = `
        <div class="season-block-header">
            <strong style="color:var(--primary-color)">Temporada ${seasonNumber}</strong>
            <button type="button" class="btn-danger remove-season-btn">Remover Temporada</button>
        </div>
        <div class="episodes-container"></div>
        <button type="button" class="btn-secondary add-ep-btn" style="width:100%; margin-top:8px">+ Adicionar Episódio</button>
    `;

    const episodesContainer = seasonBlock.querySelector('.episodes-container');
    const addEpBtn = seasonBlock.querySelector('.add-ep-btn');

    addEpBtn.addEventListener('click', () => addEpisodeBlock(episodesContainer));

    seasonBlock.querySelector('.remove-season-btn').addEventListener('click', () => seasonBlock.remove());

    seasonsListContainer.appendChild(seasonBlock);

    if (seasonData && seasonData.episodes) {
        seasonData.episodes.forEach(ep => addEpisodeBlock(episodesContainer, ep));
    } else {
        addEpisodeBlock(episodesContainer);
    }
}

function addEpisodeBlock(container, epData = null) {
    const epNumber = container.children.length + 1;
    const epBlock = document.createElement('div');
    epBlock.className = 'episode-block';

    epBlock.innerHTML = `
        <div class="episode-block-header">
            <span style="font-weight:700; font-size:12px">Episódio ${epNumber}</span>
            <button type="button" class="btn-danger remove-ep-btn" style="padding:4px 8px; font-size:10px">✕</button>
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px">
            <input type="text" class="ep-title-input" placeholder="Título do Episódio" value="${epData ? epData.title : ''}" style="flex:2; padding:8px; background:#0f0f0f; border:1px solid #333; color:#fff; border-radius:6px; font-size:12px" required>
            <input type="text" class="ep-duration-input" placeholder="Duração (Ex: 45min)" value="${epData ? epData.duration || '' : ''}" style="flex:1; padding:8px; background:#0f0f0f; border:1px solid #333; color:#fff; border-radius:6px; font-size:12px">
        </div>
        
        <div style="background:rgba(0,0,0,0.2); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.05)">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px">
                <span style="font-size:10px; font-weight:800; color:#aaa; text-transform:uppercase">Links / Players de Vídeo</span>
                <button type="button" class="btn-secondary add-ep-player-btn" style="padding:4px 8px; font-size:10px">+ Player</button>
            </div>
            <div class="ep-players-container" style="display:flex; flex-direction:column; gap:6px"></div>
        </div>
    `;

    const epPlayersContainer = epBlock.querySelector('.ep-players-container');
    const addEpPlayerBtn = epBlock.querySelector('.add-ep-player-btn');

    addEpPlayerBtn.addEventListener('click', () => addEpPlayerRow(epPlayersContainer));

    epBlock.querySelector('.remove-ep-btn').addEventListener('click', () => epBlock.remove());

    container.appendChild(epBlock);

    // Carregar players existentes ou legados
    if (epData) {
        if (epData.players && epData.players.length > 0) {
            epData.players.forEach(p => addEpPlayerRow(epPlayersContainer, p.name, p.url));
        } else if (epData.url) {
            addEpPlayerRow(epPlayersContainer, "MixDrop", epData.url);
        } else {
            addEpPlayerRow(epPlayersContainer);
        }
    } else {
        addEpPlayerRow(epPlayersContainer, "MixDrop", "");
    }
}

function addEpPlayerRow(container, name = '', url = '') {
    const row = document.createElement('div');
    row.className = 'ep-player-row';
    row.style.cssText = 'display:flex; gap:6px; align-items:center;';

    row.innerHTML = `
        <input type="text" class="ep-player-name" placeholder="Servidor (Ex: MixDrop)" value="${name}" style="flex:1; padding:6px; background:#000; border:1px solid #333; color:#fff; border-radius:4px; font-size:11px" required>
        <input type="url" class="ep-player-url" placeholder="https://..." value="${url}" style="flex:2; padding:6px; background:#000; border:1px solid #333; color:#fff; border-radius:4px; font-size:11px" required>
        <button type="button" class="btn-danger remove-ep-player-btn" style="padding:4px 8px; font-size:10px">✕</button>
    `;

    row.querySelector('.remove-ep-player-btn').addEventListener('click', () => {
        if (container.children.length > 1) row.remove();
        else showToast("O episódio precisa de ao menos 1 player!", "error");
    });

    container.appendChild(row);
}

function getSeasonsFromForm() {
    const seasonBlocks = seasonsListContainer.querySelectorAll('.season-block');
    const seasons = [];

    seasonBlocks.forEach((sb, sIdx) => {
        const epBlocks = sb.querySelectorAll('.episode-block');
        const episodes = [];

        epBlocks.forEach((eb, eIdx) => {
            const title = eb.querySelector('.ep-title-input').value.trim();
            const duration = eb.querySelector('.ep-duration-input').value.trim();
            const playerRows = eb.querySelectorAll('.ep-player-row');
            
            const players = [];
            playerRows.forEach(pr => {
                const pName = pr.querySelector('.ep-player-name').value.trim();
                const pUrl = pr.querySelector('.ep-player-url').value.trim();
                if (pName && pUrl) players.push({ name: pName, url: pUrl });
            });

            if (title && players.length > 0) {
                episodes.push({
                    number: eIdx + 1,
                    title,
                    duration,
                    players
                });
            }
        });

        if (episodes.length > 0) {
            seasons.push({
                number: sIdx + 1,
                episodes
            });
        }
    });

    return seasons;
}

// ----------------------------------------------------
// ABRIR FORMULÁRIO (CRIAR/EDITAR)
// ----------------------------------------------------
function openCreatorModal(itemToEdit = null) {
    const form = document.getElementById('mediaForm');
    form.reset();
    selectedGenres = [];
    seasonsListContainer.innerHTML = '';
    document.querySelectorAll('.genre-tag').forEach(t => t.classList.remove('selected'));

    if (itemToEdit) {
        document.getElementById('creatorTitle').textContent = 'Editar Mídia';
        document.getElementById('editMediaId').value = itemToEdit.id;
        document.getElementById('mediaType').value = itemToEdit.type;
        document.getElementById('mediaTitle').value = itemToEdit.title;
        document.getElementById('mediaYear').value = itemToEdit.year;
        document.getElementById('mediaDuration').value = itemToEdit.duration || '';
        document.getElementById('mediaCover').value = itemToEdit.cover;
        document.getElementById('mediaBackdrop').value = itemToEdit.backdrop || '';
        document.getElementById('mediaDesc').value = itemToEdit.desc;

        selectedGenres = itemToEdit.genres || [];
        document.querySelectorAll('.genre-tag').forEach(tag => {
            if (selectedGenres.includes(tag.textContent)) tag.classList.add('selected');
        });

        if (itemToEdit.type === 'movie') {
            document.getElementById('seriesBuilderArea').classList.add('hidden');
            document.getElementById('movieFileArea').classList.remove('hidden');
            resetMoviePlayerInputs(itemToEdit.players || []);
        } else {
            document.getElementById('seriesBuilderArea').classList.remove('hidden');
            document.getElementById('movieFileArea').classList.add('hidden');
            if (itemToEdit.seasons) {
                itemToEdit.seasons.forEach(s => addSeasonBlock(s));
            }
        }
    } else {
        document.getElementById('creatorTitle').textContent = 'Publicar Nova Mídia';
        document.getElementById('editMediaId').value = '';
        document.getElementById('seriesBuilderArea').classList.add('hidden');
        document.getElementById('movieFileArea').classList.remove('hidden');
        resetMoviePlayerInputs();
    }

    openModal('creatorModal');
}

// ----------------------------------------------------
// MODAL DE DETALHES & SELEÇÃO DE PLAYERS
// ----------------------------------------------------
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
        badge.textContent = g;
        genresBox.appendChild(badge);
    });

    if (item.type === 'movie') {
        document.getElementById('detailMovieArea').classList.remove('hidden');
        document.getElementById('detailSerieArea').classList.add('hidden');
        renderMoviePlayers(item.players || []);
    } else {
        document.getElementById('detailMovieArea').classList.add('hidden');
        document.getElementById('detailSerieArea').classList.remove('hidden');
        renderSeriesEpisodes(item);
    }

    openModal('detailsModal');
}

function renderMoviePlayers(players) {
    const group = document.getElementById('moviePlayerSelectionGroup');
    const container = document.getElementById('moviePlayerButtonsContainer');
    const btnPlay = document.getElementById('btnPlayMovieFile');

    container.innerHTML = '';

    if (!players || players.length === 0) {
        group.classList.add('hidden');
        selectedMoviePlayerUrl = '';
        return;
    }

    // Se tiver só 1 player: esconde os botões e seleciona direto
    if (players.length < 2) {
        group.classList.add('hidden');
        selectedMoviePlayerUrl = players[0].url;
    } else { // Se tiver 2 ou mais: cria os botões para escolha
        group.classList.remove('hidden');
        selectedMoviePlayerUrl = players[0].url;

        players.forEach((p, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = idx === 0 ? 'category-chip active' : 'category-chip';
            btn.textContent = p.name;
            btn.addEventListener('click', () => {
                container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMoviePlayerUrl = p.url;
            });
            container.appendChild(btn);
        });
    }

    btnPlay.onclick = () => {
        if (selectedMoviePlayerUrl) {
            openPlayerModal(currentItemDetails.title, selectedMoviePlayerUrl);
        } else {
            showToast("Nenhum link de vídeo disponível!", "error");
        }
    };
}

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

        // Garante compatibilidade caso o episódio tenha o formato novo (players[]) ou antigo (url)
        const epPlayers = ep.players || (ep.url ? [{ name: "Principal", url: ep.url }] : []);
        
        let playerButtonsHTML = '';

        // Se o episódio tiver MÚLTIPLOS PLAYERS, gera os botões de escolha
        if (epPlayers.length > 1) {
            playerButtonsHTML = `
                <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:6px; align-items:center; flex-wrap:wrap">
                    <span style="font-size:10px; color:#888; font-weight:700; text-transform:uppercase">Opções de Player:</span>
                    ${epPlayers.map((p, i) => `
                        <button type="button" class="btn-secondary ep-player-btn" data-url="${p.url}" style="padding:4px 10px; font-size:11px">
                            ▶ ${p.name}
                        </button>
                    `).join('')}
                </div>
            `;
        }

        card.innerHTML = `
            <div class="episode-card-header">
                <span class="episode-card-title">E${ep.number} - ${ep.title}</span>
                <span class="episode-card-duration">${ep.duration || ''}</span>
            </div>
            ${playerButtonsHTML}
        `;

        // Se tiver 1 único player: clica no card e abre direto
        if (epPlayers.length <= 1) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                if (epPlayers.length === 1) {
                    openPlayerModal(`${currentItemDetails.title} - E${ep.number}`, epPlayers[0].url);
                } else {
                    showToast("Episódio sem link de vídeo!", "error");
                }
            });
        } else { // Se tiver múltiplos players: clica no botão do player desejado
            card.querySelectorAll('.ep-player-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = btn.getAttribute('data-url');
                    const name = btn.textContent.trim();
                    openPlayerModal(`${currentItemDetails.title} - E${ep.number} (${name})`, url);
                });
            });
        }

        container.appendChild(card);
    });
}

// ----------------------------------------------------
// TELA DO PLAYER
// ----------------------------------------------------
function openPlayerModal(title, videoUrl) {
    document.getElementById('playerTitleDisplay').textContent = title;
    const view = document.getElementById('playerContainerView');
    const loading = document.getElementById('playerLoading');

    loading.classList.remove('hidden');

    const oldIframe = view.querySelector('iframe');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.src = videoUrl;
    iframe.allow = "autoplay; fullscreen";
    iframe.onload = () => loading.classList.add('hidden');

    view.appendChild(iframe);
    openModal('playerModal');
}

// RENDERIZAÇÃO PRINCIPAL
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

    if (catalog.length > 0) {
        const hero = catalog[0];
        document.getElementById('heroTitle').textContent = hero.title;
        document.getElementById('heroMeta').innerHTML = `<span>${hero.year}</span> • <span>${hero.duration || ''}</span>`;
        document.getElementById('heroDesc').textContent = hero.desc;
        document.getElementById('heroBackdrop').style.backgroundImage = `url('${hero.backdrop || hero.cover}')`;
        document.getElementById('heroPlayBtn').onclick = () => openDetailsModal(hero);
        document.getElementById('heroInfoBtn').onclick = () => openDetailsModal(hero);
    }
}

// EVENTOS GLOBAIS
function initEventListeners() {
    document.getElementById('mediaForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('editMediaId').value;
        const type = document.getElementById('mediaType').value;
        const title = document.getElementById('mediaTitle').value;
        const year = document.getElementById('mediaYear').value;
        const duration = document.getElementById('mediaDuration').value;
        const cover = document.getElementById('mediaCover').value;
        const backdrop = document.getElementById('mediaBackdrop').value;
        const desc = document.getElementById('mediaDesc').value;

        let newItem = {
            id: id || ('m_' + Date.now()),
            type, title, year, duration, cover, backdrop, desc,
            genres: selectedGenres
        };

        if (type === 'movie') {
            newItem.players = getMoviePlayersFromForm();
        } else {
            newItem.seasons = getSeasonsFromForm();
        }

        if (id) {
            const index = catalog.findIndex(x => x.id === id);
            if (index !== -1) catalog[index] = newItem;
        } else {
            catalog.push(newItem);
        }

        saveCatalog();
        renderCatalog();
        closeModal('creatorModal');
        showToast("Salvo com sucesso!");
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal.id);
        });
    });

    document.getElementById('btnClosePlayer')?.addEventListener('click', () => {
        const view = document.getElementById('playerContainerView');
        const iframe = view.querySelector('iframe');
        if (iframe) iframe.remove();
        closeModal('playerModal');
    });
}

