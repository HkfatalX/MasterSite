/**
 * MasterFlix - Script de Controle Principal
 */

// Dados Simulados de Conteúdo (Filmes e Séries)
const catalogData = [
    {
        id: 1,
        title: "Mad Max: Estrada da Fúria",
        description: "Em um mundo pós-apocalíptico, Max se junta a Furiosa para escapar de um tirano.",
        cover: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop",
        backdrop: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop",
        videoUrl: "https://www.youtube.com/embed/hEJnMQG9ev8?autoplay=1",
        type: "movie"
    },
    {
        id: 2,
        title: "Série Exemplo - Temporada 1",
        description: "Uma série cheia de suspense, ação e mistérios revelados a cada episódio.",
        cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop",
        backdrop: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop",
        type: "series",
        seasons: [
            {
                seasonNumber: 1,
                cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop", // Foto da temporada
                episodes: [
                    {
                        title: "Episódio 1: O Início",
                        duration: "45min",
                        thumb: "", // Sem foto própria (Usa foto da temporada)
                        videoUrl: "https://www.youtube.com/embed/d9MyW72ELq0?autoplay=1"
                    },
                    {
                        title: "Episódio 2: A Descoberta",
                        duration: "50min",
                        thumb: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop", // Foto própria
                        videoUrl: "https://www.youtube.com/embed/d9MyW72ELq0?autoplay=1"
                    }
                ]
            }
        ]
    }
];

// INICIALIZAÇÃO DO APP
document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    initProfileModal();
    renderCatalog();
    setupHeroBanner(catalogData[0]);
    setupPlayerControlsAutoFade();
});

/* ==========================================================================
   1. REGRA DE HERANÇA DE IMAGENS (FALLBACK DE EPISÓDIOS E TEMPORADAS)
   ========================================================================== */
/**
 * Pega a imagem correta para o episódio seguindo a regra de prioridade:
 * Foto do Episódio -> Foto da Temporada -> Backdrop do Conteúdo -> Capa Principal
 */
function getEpisodeThumb(media, season, episode) {
    if (episode && episode.thumb && episode.thumb.trim() !== '') {
        return episode.thumb;
    }
    if (season && season.cover && season.cover.trim() !== '') {
        return season.cover;
    }
    if (media && media.backdrop && media.backdrop.trim() !== '') {
        return media.backdrop;
    }
    return (media && media.cover) ? media.cover : 'https://via.placeholder.com/300x170?text=Sem+Imagem';
}

/* ==========================================================================
   2. CONTROLE DO PLAYER DE VÍDEO (TELA CHEIA & PERFEITO)
   ========================================================================== */
function openPlayer(videoUrl, title, subtitle) {
    const playerModal = document.getElementById("playerModal");
    const container = document.getElementById("playerContainerView");
    const titleMain = document.getElementById("playerTitleDisplay");
    const titleSub = document.getElementById("playerSubDisplay");

    titleMain.textContent = title || "Assistindo";
    titleSub.textContent = subtitle || "MasterFlix";

    // Reinicia container com indicador de carregamento
    container.innerHTML = `
        <div class="player-loading" id="playerLoading">
            <div class="player-spinner"></div>
            <span style="font-size: 12px; color: #aaa;">CARREGANDO VÍDEO...</span>
        </div>
    `;

    // Cria IFrame Otimizado com Permissões de Tela Cheia
    const iframe = document.createElement("iframe");
    iframe.src = videoUrl;
    iframe.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("webkitallowfullscreen", "true");
    iframe.setAttribute("mozallowfullscreen", "true");

    iframe.onload = () => {
        const loader = document.getElementById("playerLoading");
        if (loader) loader.classList.add("hidden");
    };

    container.appendChild(iframe);
    playerModal.classList.remove("hidden");

    // Tenta colocar o modal em modo Fullscreen real do navegador
    if (playerModal.requestFullscreen) {
        playerModal.requestFullscreen().catch(() => {});
    } else if (playerModal.webkitRequestFullscreen) {
        playerModal.webkitRequestFullscreen().catch(() => {});
    }
}

function closePlayer() {
    const playerModal = document.getElementById("playerModal");
    const container = document.getElementById("playerContainerView");

    // Limpa Iframe para parar áudio/vídeo
    container.innerHTML = "";
    playerModal.classList.add("hidden");

    // Sai da tela cheia se estiver ativa
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen().catch(() => {});
        }
    }
}

/* Ocultar barra superior automaticamente após inatividade */
function setupPlayerControlsAutoFade() {
    let hideTimeout;
    const controls = document.getElementById("playerControlsTop");
    const playerModal = document.getElementById("playerModal");

    const showControls = () => {
        controls.classList.remove("is-hidden");
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            controls.classList.add("is-hidden");
        }, 3500);
    };

    playerModal.addEventListener("mousemove", showControls);
    playerModal.addEventListener("touchstart", showControls);
}

/* ==========================================================================
   3. RENDERIZAÇÃO DE CONTEÚDO E CAROUSEL
   ========================================================================== */
function renderCatalog() {
    const carousel = document.getElementById("mediaCarousel");
    if (!carousel) return;

    carousel.innerHTML = "";

    catalogData.forEach(item => {
        const card = document.createElement("div");
        card.className = "media-card";
        card.innerHTML = `<img src="${item.cover}" alt="${item.title}" loading="lazy">`;
        
        card.onclick = () => {
            if (item.type === "movie") {
                openPlayer(item.videoUrl, item.title, "Filme");
            } else if (item.type === "series") {
                const ep = item.seasons[0].episodes[0];
                openPlayer(ep.videoUrl, item.title, ep.title);
            }
        };

        carousel.appendChild(card);
    });
}

function setupHeroBanner(item) {
    if (!item) return;
    const banner = document.getElementById("heroBanner");
    const title = document.getElementById("heroTitle");
    const desc = document.getElementById("heroDesc");
    const playBtn = document.getElementById("heroPlayBtn");

    banner.style.backgroundImage = `url('${item.backdrop}')`;
    title.textContent = item.title;
    desc.textContent = item.description;

    playBtn.onclick = () => {
        openPlayer(item.videoUrl, item.title, "Destaque Principal");
    };
}

/* ==========================================================================
   4. SISTEMA DE BUSCA OTIMIZADO
   ========================================================================== */
function initSearch() {
    const searchBtn = document.getElementById("searchBtn");
    const searchBox = document.getElementById("searchBox");
    const searchInput = document.getElementById("searchInput");

    searchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        searchBox.classList.toggle("active");
        if (searchBox.classList.contains("active")) {
            searchInput.focus();
        }
    });

    document.addEventListener("click", (e) => {
        if (!searchBox.contains(e.target)) {
            searchBox.classList.remove("active");
        }
    });
}

/* ==========================================================================
   5. GERENCIAMENTO DE PERFIL E MODAIS
   ========================================================================== */
function initProfileModal() {
    const profileBtn = document.getElementById("profileBtn");
    const profileModal = document.getElementById("profileModal");
    const profileForm = document.getElementById("profileForm");

    profileBtn.addEventListener("click", () => {
        profileModal.classList.remove("hidden");
    });

    profileForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const newName = document.getElementById("profileNameInput").value;
        alert(`Perfil de ${newName} atualizado com sucesso!`);
        closeModal("profileModal");
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("hidden");
    }
}

