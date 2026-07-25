import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const ADMIN_EMAIL="raiyuri.freefire@gmail.com";
const GENRES=["Lançamento","Ação","Aventura","Comédia","Drama","Terror","Suspense","Romance","Ficção Científica","Fantasia","Animação","Documentário","Crime","Família","Anime","Dorama","Musical","Mistério","Guerra","Histórico","Faroeste","Super-Heróis"];
const DB_LIMIT=1073741824;
const CONT_EXPIRE=7*24*60*60*1000;
const DEV_KEY="mfx_device_id";
const HEARTBEAT=60000;
const HIDE_MS=7000;
const CURSOR_MS=6000;

const fbCfg={apiKey:"AIzaSyCGD9DZDFp0w9baW8jiqgGGfkasAvqreY0",authDomain:"site-ec6fd.firebaseapp.com",databaseURL:"https://site-ec6fd-default-rtdb.firebaseio.com",projectId:"site-ec6fd",storageBucket:"site-ec6fd.firebasestorage.app",messagingSenderId:"338689686380",appId:"1:338689686380:web:509aebb8d64694a0e1d149"};
const fbApp=initializeApp(fbCfg);
const auth=getAuth(fbApp);
const db=getDatabase(fbApp);
setPersistence(auth,browserLocalPersistence).catch(()=>{});

// === HELPERS ===
const $=id=>document.getElementById(id);
const q=(s,c=document)=>c.querySelector(s);
const qa=(s,c=document)=>[...c.querySelectorAll(s)];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const norm=t=>t?t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim():"";
const poster=i=>i.coverUrl||i.backdropUrl||"";
const backdrop=i=>i.backdropUrl||i.coverUrl||"";
const genres=i=>Array.isArray(i.genres)&&i.genres.length?i.genres:i.category?[i.category]:[];
const validImg=u=>u&&(u.startsWith("http")||u.startsWith("data:image"));
const fmtB=b=>{if(!b)return"0 B";const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k));return`${(b/Math.pow(k,i)).toFixed(2)} ${s[i]}`;};
const jsonSz=o=>{try{return new Blob([JSON.stringify(o)]).size}catch{return JSON.stringify(o).length*2}};
const timeAgo=ts=>{const d=Date.now()-ts,m=Math.floor(d/60000);if(m<1)return"agora";if(m<60)return m+"m";const h=Math.floor(m/60);return h<24?h+"h":Math.floor(h/24)+"d";};
const authErr=c=>({"auth/email-already-in-use":"E-mail já cadastrado!","auth/invalid-email":"E-mail inválido.","auth/weak-password":"Senha fraca (mín. 6).","auth/user-not-found":"Conta não encontrada.","auth/wrong-password":"Senha incorreta.","auth/invalid-credential":"E-mail ou senha incorretos.","auth/too-many-requests":"Muitas tentativas.","auth/network-request-failed":"Sem internet."})[c]||`Erro: ${c}`;
function matchCat(i,c){if(c==="Todos")return true;if(c==="Filmes")return i.type==="movie";if(c==="Séries")return i.type==="serie";return genres(i).includes(c);}
function showMsg(t,type="error"){const m=$("msg");if(!m)return;m.innerText=t;m.className=type==="success"?"msg-success":type==="info"?"msg-info":"msg-error";m.classList.remove("hidden");clearTimeout(m._t);m._t=setTimeout(()=>m.classList.add("hidden"),4000);}
function isTV(){return/smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(navigator.userAgent)||(innerWidth>=1920&&!("ontouchstart"in window));}
(function(){if(isTV())document.body.classList.add("tv-mode");addEventListener("resize",()=>document.body.classList.toggle("tv-mode",isTV()));})();

// === STATE ===
let catalog=[],selCat="Todos",signUpMode=false,selGenres=[];
let cropInst=null,cropTarget=null,prevModal=null;
let isAdm=false,authBusy=false,curUid=null;
let allSugg=[],suggSelMode=false,suggSelIds=new Set();
let dailyViews={},playingId=null,viewTracked=false;
let vidUrl="",sources=[],srcIdx=0,pMeta={main:"",sub:""};
let errTimer=null,stretch=false,hideTimer=null,cursorTimer=null,barsVisible=false;
let creator={type:"movie",movieSrc:[],seasons:[]};
let uiSt={openS:new Set(),openE:new Set()};
let heartbeatInt=null;

// === MODALS ===
const _modals=new Set();
function openModal(id){$(id)?.classList.remove("hidden");_modals.add(id);document.body.classList.add("modal-open");}
function closeModal(id){$(id)?.classList.add("hidden");_modals.delete(id);if(!_modals.size&&!$("sidebarMenu")?.classList.contains("active"))document.body.classList.remove("modal-open");}
document.addEventListener("click",e=>{if(!e.target.classList.contains("modal-overlay"))return;const p=["authOverlay","playerModal","cropperModal","forgotPasswordModal","forgotSuccessModal"];if(!p.includes(e.target.id))closeModal(e.target.id);});

// === CACHE ===
const cKey=k=>curUid?`mfx_${curUid}_${k}`:null;
const cSet=(k,v)=>{const key=cKey(k);if(key&&v!=null)localStorage.setItem(key,v);};
const cGet=k=>{const key=cKey(k);return key?localStorage.getItem(key):null;};
function applyTheme(c){if(!c)return;document.documentElement.style.setProperty("--primary",c);localStorage.setItem("mfx_theme",c);if(curUid)cSet("theme",c);}
{const c=localStorage.getItem("mfx_theme");if(c)applyTheme(c);}
addEventListener("scroll",()=>$("mainHeader")?.classList.toggle("scrolled",scrollY>50),{passive:true});
$("brandLogoBtn")?.addEventListener("click",()=>{selCat="Todos";updateChips();render();scrollTo({top:0,behavior:"smooth"});});

// === DAILY VIEWS ===
function todayKey(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
async function loadViews(){try{const s=await get(ref(db,`stats/dailyViews/${todayKey()}`));dailyViews=s.exists()?s.val():{};}catch{dailyViews={};}renderFeatured();}
function viewCount(id){return Number(dailyViews?.[id]||0);}
async function addView(id){if(!id||viewTracked)return;viewTracked=true;dailyViews[id]=(dailyViews[id]||0)+1;renderFeatured();try{await runTransaction(ref(db,`stats/dailyViews/${todayKey()}/${id}`),c=>(c||0)+1);}catch{}}

// === PROVIDERS (NO SANDBOX) ===
function mkIframe(url){
    const i=document.createElement("iframe");
    i.src=url;i.allowFullscreen=true;
    i.setAttribute("allow","autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope");
    i.setAttribute("scrolling","no");i.setAttribute("frameborder","0");
    i.setAttribute("referrerpolicy","no-referrer");
    return i;
}
const ADAPTERS={
    mixdrop:{name:"MixDrop",color:"#00c6ff",icon:"🎬",ms:18000,
        fmt(u){let f=u.trim();if(f.includes("/f/"))f=f.replace("/f/","/e/");else if(!f.includes("/e/")){const m=f.match(/mixdrop\.[a-z]+\/(?:e\/|f\/)?([a-zA-Z0-9]+)/);if(m?.[1])f=`https://mixdrop.ag/e/${m[1]}`;}return f;},mk:mkIframe},
    streamtape:{name:"StreamTape",color:"#f5a623",icon:"📼",ms:18000,
        fmt(u){let f=u.trim();if(f.includes("/v/"))f=f.replace("/v/","/e/");else if(!f.includes("/e/")){const m=f.match(/streamtape\.[a-z]+\/(?:v|e)\/([a-zA-Z0-9]+)/);if(m?.[1])f=`https://streamtape.com/e/${m[1]}`;}return f;},mk:mkIframe},
    filemoon:{name:"FileMoon",color:"#8e44ad",icon:"🌙",ms:18000,
        fmt(u){let f=u.trim();if(!f.includes("/e/")&&!f.includes("/embed")){const m=f.match(/filemoon\.[a-z]+\/(?:d\/|e\/)?([a-zA-Z0-9]+)/);if(m?.[1])f=`https://filemoon.sx/e/${m[1]}`;}return f;},mk:mkIframe},
    voe:{name:"VOE",color:"#ff4757",icon:"⚡",ms:18000,fmt(u){return u.trim();},mk:mkIframe},
    doodstream:{name:"DoodStream",color:"#f39c12",icon:"🔥",ms:22000,
        fmt(u){let f=u.trim();if(f.includes("/d/"))f=f.replace("/d/","/e/");else if(!f.includes("/e/")){const m=f.match(/(?:dood[a-z0-9]*\.[a-z]+)\/(?:d\/|e\/)?([a-zA-Z0-9]+)/);if(m?.[1]){const dm=f.match(/(https?:\/\/[^/]+)/);f=`${dm?.[1]||"https://dood.li"}/e/${m[1]}`;}}return f;},mk:mkIframe},
    mp4upload:{name:"Mp4Upload",color:"#3498db",icon:"📤",ms:18000,
        fmt(u){let f=u.trim();if(!f.includes("/embed")){const m=f.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/);if(m?.[1])f=`https://www.mp4upload.com/embed-${m[1]}.html`;}return f;},mk:mkIframe},
    okru:{name:"OK.ru",color:"#ee8208",icon:"📡",ms:18000,
        fmt(u){const m=u.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/);return m?.[1]?`https://ok.ru/videoembed/${m[1]}`:u.trim();},mk:mkIframe},
    drive:{name:"Google Drive",color:"#4285f4",icon:"💾",ms:16000,
        fmt(u){let f=u.trim();const m=f.match(/\/d\/([a-zA-Z0-9_-]+)/);if(m?.[1])return`https://drive.google.com/file/d/${m[1]}/preview`;if(f.includes("open?id=")){const m2=f.match(/id=([a-zA-Z0-9_-]+)/);if(m2?.[1])return`https://drive.google.com/file/d/${m2[1]}/preview`;}return f;},mk:mkIframe},
    yourupload:{name:"YourUpload",color:"#27ae60",icon:"⬆️",ms:18000,
        fmt(u){let f=u.trim();if(!f.includes("/embed/")){const m=f.match(/yourupload\.com\/(?:watch|embed)\/([a-zA-Z0-9]+)/);if(m?.[1])f=`https://www.yourupload.com/embed/${m[1]}`;}return f;},mk:mkIframe},
    youtube:{name:"YouTube",color:"#ff0000",icon:"▶️",ms:12000,
        fmt(u){const m=u.trim().match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);return m?.[1]?`https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`:u.trim();},mk:mkIframe},
    vimeo:{name:"Vimeo",color:"#17d5ff",icon:"🎥",ms:12000,
        fmt(u){const m=u.trim().match(/vimeo\.com\/(?:video\/)?(\d+)/);return m?.[1]?`https://player.vimeo.com/video/${m[1]}?autoplay=1`:u.trim();},mk:mkIframe},
    direct:{name:"Direto",color:"#4caf50",icon:"📹",ms:12000,
        fmt(u){return u.trim();},mk(u){const v=document.createElement("video");v.src=u;v.controls=true;v.autoplay=true;v.playsInline=true;v.setAttribute("webkit-playsinline","true");v.style.background="#000";return v;}},
    other:{name:"Outro",color:"#888",icon:"🔗",ms:18000,fmt(u){return u.trim();},mk:mkIframe}
};
function adp(t){return ADAPTERS[t]||ADAPTERS.other;}
function detectType(u){if(!u)return"other";const l=u.toLowerCase();if(l.includes("mixdrop"))return"mixdrop";if(l.includes("streamtape"))return"streamtape";if(l.includes("filemoon"))return"filemoon";if(l.includes("voe.sx")||l.includes("voe."))return"voe";if(l.includes("dood")||l.includes("d0000d")||l.includes("dooood"))return"doodstream";if(l.includes("mp4upload"))return"mp4upload";if(l.includes("ok.ru"))return"okru";if(l.includes("drive.google"))return"drive";if(l.includes("yourupload"))return"yourupload";if(l.includes("youtube.com")||l.includes("youtu.be"))return"youtube";if(l.includes("vimeo.com"))return"vimeo";if(/\.(mp4|m3u8|webm)(\?|$)/i.test(l))return"direct";return"other";}
function typeLbl(t){return adp(t).name;}
function normSrc(item){if(Array.isArray(item.videoSources)&&item.videoSources.length)return item.videoSources;if(item.videoUrl?.trim()){const t=detectType(item.videoUrl);return[{type:t,label:typeLbl(t),url:item.videoUrl.trim()}];}return[];}
function normEpSrc(ep){if(Array.isArray(ep.videoSources)&&ep.videoSources.length)return ep.videoSources;if(ep.videoUrl?.trim()){const t=detectType(ep.videoUrl);return[{type:t,label:typeLbl(t),url:ep.videoUrl.trim()}];}return[];}

// === SIDEBAR ===
function openSB(){$("sidebarMenu")?.classList.add("active");$("sidebarOverlay")?.classList.add("active");$("menuToggleBtn")?.classList.add("active");document.body.classList.add("modal-open");}
function closeSB(){$("sidebarMenu")?.classList.remove("active");$("sidebarOverlay")?.classList.remove("active");$("menuToggleBtn")?.classList.remove("active");if(!_modals.size)document.body.classList.remove("modal-open");}
$("menuToggleBtn")?.addEventListener("click",()=>$("sidebarMenu")?.classList.contains("active")?closeSB():openSB());
$("sidebarCloseBtn")?.addEventListener("click",closeSB);
$("sidebarOverlay")?.addEventListener("click",closeSB);
qa(".sidebar-item").forEach(it=>{const act=()=>{const a=it.dataset.nav;qa(".sidebar-item").forEach(i=>i.classList.remove("active"));if(["home","movies","series","continue"].includes(a))it.classList.add("active");closeSB();({home(){selCat="Todos";updateChips();render();scrollTo({top:0,behavior:"smooth"});},movies(){selCat="Filmes";updateChips();render();scrollTo({top:0,behavior:"smooth"});},series(){selCat="Séries";updateChips();render();scrollTo({top:0,behavior:"smooth"});},continue(){const r=$("continueRow");r&&!r.classList.contains("hidden")?r.scrollIntoView({behavior:"smooth"}):showMsg("Nada em andamento!","info");},suggestions(){openModal("suggestionModal");},profile(){openProfModal();},admin(){renderAdmin();openModal("adminModal");},creator(){openCreator();},suggestionsAdmin(){loadSuggAdmin();openModal("suggestionsAdminModal");},storage(){loadStorage();openModal("storageModal");},logout(){if(confirm("Sair?"))doLogout();}})[a]?.();};it.addEventListener("click",act);it.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();act();}});});
function updateChips(){qa(".category-chip").forEach(c=>c.classList.toggle("active",c.dataset.cat===selCat));}
qa(".category-chip").forEach(c=>c.addEventListener("click",()=>{selCat=c.dataset.cat;updateChips();render();}));

// === SEARCH ===
const sBox=$("searchBox"),sIn=$("searchInput"),sDrop=$("searchResultsDropdown");
$("searchIconBtn")?.addEventListener("click",e=>{e.stopPropagation();if(sBox?.classList.contains("active")){if(!sIn?.value.trim())sBox.classList.remove("active");}else{sBox?.classList.add("active");setTimeout(()=>sIn?.focus(),220);}});
sIn?.addEventListener("input",()=>{const v=sIn.value.trim();v?(sBox?.classList.add("has-text"),renderSearch(v)):(sBox?.classList.remove("has-text"),sDrop?.classList.remove("visible"));});
$("searchClearBtn")?.addEventListener("click",e=>{e.stopPropagation();sIn.value="";sBox?.classList.remove("has-text");sDrop?.classList.remove("visible");sIn?.focus();});
document.addEventListener("click",e=>{const w=$("searchWrapper");if(w&&!w.contains(e.target)){sDrop?.classList.remove("visible");if(!sIn?.value.trim())sBox?.classList.remove("active");}});
function smartSearch(qr){const nq=norm(qr);if(!nq)return[];const r=[];catalog.forEach(i=>{const t=norm(i.title);if(!t)return;let s=0;if(t===nq)s=10000;else if(t.startsWith(nq))s=1000-t.length;else if(t.includes(nq))s=100-t.length;else{const h=nq.split(" ").filter(Boolean).filter(w=>t.includes(w)).length;if(h)s=h*20;}if(s>0)r.push({item:i,score:s});});r.sort((a,b)=>b.score-a.score);return r.slice(0,10).map(x=>x.item);}
function hiMatch(t,qr){const nt=norm(t),nq=norm(qr),i=nt.indexOf(nq);if(i===-1)return t;return t.slice(0,i)+"<mark>"+t.slice(i,i+qr.length)+"</mark>"+t.slice(i+qr.length);}
function renderSearch(qr){if(!sDrop)return;const res=smartSearch(qr);sDrop.innerHTML="";if(!res.length){sDrop.innerHTML=`<div class="search-no-results"><span class="search-empty-icon">🔍</span><div>Nenhum resultado</div></div>`;}else{sDrop.innerHTML=`<div class="search-results-header">🔍 ${res.length} resultado(s)</div>`;res.forEach(it=>{const d=document.createElement("div");d.className="search-result-item";d.tabIndex=0;d.innerHTML=`<img class="search-result-thumb" src="${poster(it)}" loading="lazy" onerror="this.style.display='none'"><div class="search-result-info"><div class="search-result-title">${hiMatch(it.title,qr)}</div><div class="search-result-meta"><span class="type-badge">${it.type==="movie"?"Filme":"Série"}</span>${it.year?`<span>${it.year}</span>`:""}${genres(it).length?`<span>${genres(it).slice(0,2).join(", ")}</span>`:""}</div></div>`;const go=()=>{sDrop.classList.remove("visible");sIn.value="";sBox?.classList.remove("has-text");location.hash=`#/midia/${it.id}`;openDetails(it);};d.addEventListener("click",go);d.addEventListener("keydown",e=>{if(e.key==="Enter")go();});sDrop.appendChild(d);});}sDrop.classList.add("visible");}

// === FEATURED ===
function sortV(items){return[...items].sort((a,b)=>viewCount(b.id)-viewCount(a.id)||(parseInt(b.year||"0")||0)-(parseInt(a.year||"0")||0));}
function getFeat(){if(!catalog.length)return[];if(selCat==="Todos"){const m=sortV(catalog.filter(i=>i.type==="movie")).slice(0,2);const s=sortV(catalog.filter(i=>i.type==="serie")).slice(0,2);return[...s,...m].sort((a,b)=>viewCount(b.id)-viewCount(a.id));}if(selCat==="Filmes")return sortV(catalog.filter(i=>i.type==="movie")).slice(0,4);if(selCat==="Séries")return sortV(catalog.filter(i=>i.type==="serie")).slice(0,4);return sortV(catalog.filter(i=>matchCat(i,selCat))).slice(0,4);}
function renderFeatured(){const grid=$("featuredGrid"),hd=$("featuredHeading"),sub=$("featuredSub");if(!grid)return;if(selCat==="Todos"){hd.innerText="Top 4 de hoje";sub.innerText="2 séries + 2 filmes mais assistidos.";}else if(selCat==="Filmes"){hd.innerText="Filmes em alta";sub.innerText="Os mais assistidos hoje.";}else if(selCat==="Séries"){hd.innerText="Séries em alta";sub.innerText="As mais assistidas hoje.";}else{hd.innerText=selCat+" em alta";sub.innerText=`Top ${selCat} do dia.`;}const items=getFeat();grid.innerHTML="";if(!items.length){grid.innerHTML=`<div class="featured-empty">Nenhum destaque.</div>`;return;}const tmpl=$("featuredCardTemplate");items.forEach((it,idx)=>{const n=tmpl.content.cloneNode(true);const card=n.querySelector(".featured-card");n.querySelector(".featured-card-bg").style.backgroundImage=`url('${backdrop(it)||poster(it)}')`;n.querySelector(".featured-rank").innerText=`#${idx+1}`;n.querySelector(".featured-card-badge").innerText=it.type==="movie"?"🎬 Filme":"📺 Série";n.querySelector(".featured-card-watch").innerText=`👁️ ${viewCount(it.id)} views`;n.querySelector(".featured-card-title").innerText=it.title;n.querySelector(".featured-card-meta").innerHTML=`<span>${it.type==="movie"?"Filme":"Série"}</span>${it.year?`<span class="dot">•</span><span>${it.year}</span>`:""}${it.duration?`<span class="dot">•</span><span>${it.duration}</span>`:""}${genres(it).length?`<span class="dot">•</span><span>${genres(it).slice(0,2).join(", ")}</span>`:""}`;n.querySelector(".featured-card-desc").innerText=it.description||"";const go=()=>{location.hash=`#/midia/${it.id}`;openDetails(it);};card.addEventListener("click",go);card.addEventListener("keydown",e=>{if(e.key==="Enter")go();});n.querySelector(".featured-mini-btn.play").addEventListener("click",e=>{e.stopPropagation();if(it.type==="movie"){saveCont(it);initiatePlay(normSrc(it),it.title,"Filme",it.id);}else openDetails(it);});n.querySelector(".featured-mini-btn.info").addEventListener("click",e=>{e.stopPropagation();openDetails(it);});grid.appendChild(n);});}

// === GENRES ===
function renderGenres(){const c=$("genreSelectorContainer");if(!c)return;c.innerHTML="";GENRES.forEach(g=>{const t=document.createElement("div");t.className="genre-tag"+(selGenres.includes(g)?" selected":"");t.textContent=g;t.onclick=()=>{const i=selGenres.indexOf(g);i>=0?selGenres.splice(i,1):selGenres.push(g);renderGenres();};c.appendChild(t);});const ct=$("genreCounter");if(ct){ct.textContent=selGenres.length?`✓ ${selGenres.length}: ${selGenres.join(", ")}`:"⚠️ Selecione ao menos 1";ct.style.color=selGenres.length?"var(--primary)":"#ff9800";}}

// === CREATOR TABS ===
qa(".creator-tab").forEach(tab=>tab.onclick=()=>{syncInputs();qa(".creator-tab").forEach(t=>t.classList.remove("active"));qa(".creator-tab-content").forEach(c=>c.classList.remove("active"));tab.classList.add("active");q(`[data-tab-content="${tab.dataset.tab}"]`)?.classList.add("active");});

// === CREATOR MOVIE SOURCES ===
function renderMovSrc(){const c=$("movieSourcesList");if(!c)return;c.innerHTML="";if(!creator.movieSrc.length){c.innerHTML=`<div class="source-empty-state">Nenhuma fonte. Clique + Adicionar.</div>`;return;}const tmpl=$("videoSourceItemTemplate");creator.movieSrc.forEach((src,idx)=>{const cl=tmpl.content.cloneNode(true);const card=cl.querySelector(".source-item-card");const ts=card.querySelector(".source-type-select"),ti=card.querySelector(".source-title-input"),ui=card.querySelector(".source-url-input");card.querySelector(".source-item-badge").textContent=`Fonte ${idx+1}`;ts.value=src.type||"";ti.value=src.label||"";ui.value=src.url||"";const used=creator.movieSrc.filter((_,i)=>i!==idx).map(s=>s.type).filter(Boolean);[...ts.options].forEach(o=>{if(o.value&&o.value!=="other"&&o.value!==src.type&&used.includes(o.value))o.disabled=true;});ts.onchange=()=>{const nt=ts.value;if(nt&&nt!=="other"&&creator.movieSrc.some((s,i)=>i!==idx&&s.type===nt)){showMsg(`Já existe "${typeLbl(nt)}"!`);ts.value=src.type||"";return;}creator.movieSrc[idx].type=nt;if(!creator.movieSrc[idx].label&&nt)creator.movieSrc[idx].label=typeLbl(nt);renderMovSrc();};ti.oninput=()=>creator.movieSrc[idx].label=ti.value;ui.oninput=()=>{creator.movieSrc[idx].url=ui.value;if(!creator.movieSrc[idx].type&&ui.value){const d=detectType(ui.value);if(d!=="other"&&!creator.movieSrc.some((s,i)=>i!==idx&&s.type===d)){creator.movieSrc[idx].type=d;if(!creator.movieSrc[idx].label)creator.movieSrc[idx].label=typeLbl(d);renderMovSrc();}}};card.querySelector("[data-action='remove-source']").onclick=()=>{creator.movieSrc.splice(idx,1);renderMovSrc();};if(src.type){const a=adp(src.type);const tag=document.createElement("div");tag.className="source-preview-tag";tag.textContent=`${a.icon} ${a.name}`;card.appendChild(tag);}c.appendChild(card);});}
$("btnAddMovieSource")?.addEventListener("click",()=>{creator.movieSrc.push({id:uid(),type:"",label:"",url:""});renderMovSrc();});

// === CREATOR SEASONS/EPISODES ===
function syncInputs(){if(creator.type!=="serie")return;creator.seasons.forEach(s=>{(s.episodes||[]).forEach(ep=>{const tE=q(`[data-ep-title="${ep.id}"]`);const dE=q(`[data-ep-dur="${ep.id}"]`);if(tE)ep.title=tE.value;if(dE)ep.duration=dE.value;(ep.sources||[]).forEach(src=>{const st=q(`[data-src-type="${src.id}"]`);const sl=q(`[data-src-label="${src.id}"]`);const su=q(`[data-src-url="${src.id}"]`);if(st)src.type=st.value;if(sl)src.label=sl.value;if(su)src.url=su.value;});});});}
function findEp(epId){for(const s of creator.seasons){const f=(s.episodes||[]).find(e=>e.id===epId);if(f)return f;}return null;}

function renderEpSrc(ep){const c=q(`[data-ep-sources="${ep.id}"]`);if(!c)return;c.innerHTML="";const srcs=ep.sources||[];if(!srcs.length){c.innerHTML=`<div class="source-empty-state" style="font-size:11px">Sem fontes.</div>`;return;}const tmpl=$("videoSourceItemTemplate");srcs.forEach((src,si)=>{const cl=tmpl.content.cloneNode(true);const card=cl.querySelector(".source-item-card");const ts=card.querySelector(".source-type-select"),ti=card.querySelector(".source-title-input"),ui=card.querySelector(".source-url-input");card.querySelector(".source-item-badge").textContent=`Fonte ${si+1}`;ts.value=src.type||"";ti.value=src.label||"";ui.value=src.url||"";ts.setAttribute("data-src-type",src.id);ti.setAttribute("data-src-label",src.id);ui.setAttribute("data-src-url",src.id);const used=srcs.filter((_,i)=>i!==si).map(s=>s.type).filter(Boolean);[...ts.options].forEach(o=>{if(o.value&&o.value!=="other"&&o.value!==src.type&&used.includes(o.value))o.disabled=true;});ts.onchange=()=>{const nt=ts.value;if(nt&&nt!=="other"&&srcs.some((s,i)=>i!==si&&s.type===nt)){showMsg("Tipo duplicado!");ts.value=src.type||"";return;}src.type=nt;if(!src.label&&nt)src.label=typeLbl(nt);renderEpSrc(ep);};ti.oninput=()=>src.label=ti.value;ui.oninput=()=>{src.url=ui.value;if(!src.type&&ui.value){const d=detectType(ui.value);if(d!=="other"&&!srcs.some((s,i)=>i!==si&&s.type===d)){src.type=d;if(!src.label)src.label=typeLbl(d);renderEpSrc(ep);}}};card.querySelector("[data-action='remove-source']").onclick=()=>{srcs.splice(si,1);renderEpSrc(ep);};c.appendChild(card);});}

function renderEpList(season){const c=q(`[data-ep-list="${season.id}"]`);if(!c)return;c.innerHTML="";const eps=season.episodes||[];if(!eps.length){c.innerHTML=`<div class="empty-list-state" style="padding:14px"><span class="empty-icon" style="font-size:24px">🎬</span>Nenhum episódio</div>`;return;}eps.forEach((ep,ei)=>{const isO=uiSt.openE.has(ep.id);const hasSrc=ep.sources?.some(s=>s.url?.trim());const srcN=ep.sources?.filter(s=>s.url?.trim()).length||0;const acc=document.createElement("div");acc.className="episode-accordion"+(isO?" open":"");acc.innerHTML=`<div class="episode-accordion-header" data-toggle-ep="${ep.id}"><div class="episode-accordion-header-left"><span class="ep-number-badge">${ei+1}</span><div class="ep-info-mini"><div class="ep-info-mini-title">${ep.title||`Episódio ${ei+1}`}</div><div class="ep-info-mini-sub">${ep.duration?`⏱️ ${ep.duration}`:""}${hasSrc?`<span class="ok-badge">✓ ${srcN}</span>`:`<span class="warn-badge">⚠ sem fonte</span>`}</div></div></div><div class="episode-accordion-actions"><button type="button" class="season-mini-btn danger" data-rm-ep="${season.id}|${ep.id}">🗑️</button><span class="ep-toggle-icon">▶</span></div></div><div class="episode-body"><div class="input-group"><label>Título</label><input type="text" data-ep-title="${ep.id}" value="${(ep.title||"").replace(/"/g,"&quot;")}" autocomplete="off"></div><div class="input-group"><label>Duração</label><input type="text" data-ep-dur="${ep.id}" value="${(ep.duration||"").replace(/"/g,"&quot;")}" placeholder="Ex: 45m" autocomplete="off"></div><div class="input-group"><label>🖼️ Thumbnail</label><label class="file-upload-box" id="etb_${ep.id}"><span class="file-upload-label">📸 Escolher</span><input type="file" id="eti_${ep.id}" accept="image/*" class="hidden"><img id="etp_${ep.id}" src="${ep.thumbUrl||""}" class="file-preview-img ${ep.thumbUrl?"":"hidden"}"></label></div><div class="input-group"><label style="font-size:11px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">🎞️ Fontes</label><div data-ep-sources="${ep.id}"></div><button type="button" class="add-btn-block" data-add-src="${ep.id}" style="margin-top:10px;font-size:11px;padding:10px">+ Adicionar Fonte</button></div></div>`;c.appendChild(acc);renderEpSrc(ep);q(`[data-toggle-ep="${ep.id}"]`,acc).onclick=e=>{if(e.target.closest("button"))return;syncInputs();uiSt.openE.has(ep.id)?uiSt.openE.delete(ep.id):uiSt.openE.add(ep.id);renderSeasons();};q(`[data-rm-ep="${season.id}|${ep.id}"]`,acc).onclick=e=>{e.stopPropagation();if(!confirm("Remover episódio?"))return;syncInputs();const idx=season.episodes.findIndex(x=>x.id===ep.id);if(idx>=0){season.episodes.splice(idx,1);uiSt.openE.delete(ep.id);renderSeasons();}};q(`[data-add-src="${ep.id}"]`,acc).onclick=()=>{syncInputs();ep.sources=ep.sources||[];ep.sources.push({id:uid(),type:"",label:"",url:""});renderSeasons();};q(`[data-ep-title="${ep.id}"]`,acc).oninput=e=>ep.title=e.target.value;q(`[data-ep-dur="${ep.id}"]`,acc).oninput=e=>ep.duration=e.target.value;$(`etb_${ep.id}`)?.addEventListener("click",ev=>{if(ev.target.closest("input"))return;ev.preventDefault();openCrop(`eti_${ep.id}`,`etp_${ep.id}`,16/9,u=>ep.thumbUrl=u);});});}

function renderSeasons(){const c=$("seasonsList");if(!c)return;c.innerHTML="";if(!creator.seasons.length){c.innerHTML=`<div class="empty-list-state"><span class="empty-icon">📺</span>Nenhuma temporada.</div>`;return;}creator.seasons.forEach((s,si)=>{const isO=uiSt.openS.has(s.id);const epN=(s.episodes||[]).length;const hasC=(s.episodes||[]).some(ep=>ep.sources?.some(x=>x.url?.trim()));const acc=document.createElement("div");acc.className="season-accordion"+(isO?" open":"");acc.innerHTML=`<div class="season-header" data-toggle-s="${s.id}"><div class="season-header-left"><div class="season-toggle-icon">▶</div><div><div class="season-title">Temporada ${si+1}</div><div class="season-subtitle">${epN} ep(s) ${hasC?'· <span style="color:#4caf50">✓</span>':""}</div></div></div><div class="season-header-actions"><button type="button" class="season-mini-btn danger" data-rm-s="${s.id}">🗑️</button></div></div><div class="season-body"><div class="input-group"><label>🖼️ Capa da Temporada</label><label class="file-upload-box" id="scb_${s.id}"><span class="file-upload-label">📁 Escolher</span><input type="file" id="sci_${s.id}" accept="image/*" class="hidden"><img id="scp_${s.id}" src="${s.seasonCoverUrl||""}" class="file-preview-img ${s.seasonCoverUrl?"":"hidden"}"></label></div><label style="font-size:11px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:block">🎬 Episódios</label><div data-ep-list="${s.id}"></div><button type="button" class="add-btn-block" data-add-ep="${s.id}" style="margin-top:10px">+ Novo Episódio</button></div>`;c.appendChild(acc);renderEpList(s);q(`[data-toggle-s="${s.id}"]`,acc).onclick=e=>{if(e.target.closest("button"))return;syncInputs();uiSt.openS.has(s.id)?uiSt.openS.delete(s.id):uiSt.openS.add(s.id);renderSeasons();};q(`[data-rm-s="${s.id}"]`,acc).onclick=e=>{e.stopPropagation();if(!confirm("Remover temporada?"))return;syncInputs();const idx=creator.seasons.findIndex(x=>x.id===s.id);if(idx>=0){creator.seasons.splice(idx,1);uiSt.openS.delete(s.id);renderSeasons();}};q(`[data-add-ep="${s.id}"]`,acc).onclick=()=>{syncInputs();const ep={id:uid(),title:`Episódio ${(s.episodes?.length||0)+1}`,duration:"45m",thumbUrl:"",sources:[]};s.episodes=s.episodes||[];s.episodes.push(ep);uiSt.openE.add(ep.id);renderSeasons();};$(`scb_${s.id}`)?.addEventListener("click",ev=>{if(ev.target.closest("input"))return;ev.preventDefault();openCrop(`sci_${s.id}`,`scp_${s.id}`,16/9,u=>s.seasonCoverUrl=u);});});}
$("btnAddSeasonBtn")?.addEventListener("click",()=>{syncInputs();const s={id:uid(),seasonNumber:creator.seasons.length+1,seasonCoverUrl:"",episodes:[]};const ep={id:uid(),title:"Episódio 1",duration:"45m",thumbUrl:"",sources:[]};s.episodes.push(ep);creator.seasons.push(s);uiSt.openS.add(s.id);uiSt.openE.add(ep.id);renderSeasons();});
$("mediaType")?.addEventListener("change",e=>{creator.type=e.target.value;$("movieFileArea")?.classList.toggle("hidden",creator.type!=="movie");$("seriesBuilderArea")?.classList.toggle("hidden",creator.type==="movie");if(creator.type==="serie"&&!creator.seasons.length){const s={id:uid(),seasonNumber:1,seasonCoverUrl:"",episodes:[]};const ep={id:uid(),title:"Episódio 1",duration:"45m",thumbUrl:"",sources:[]};s.episodes.push(ep);creator.seasons.push(s);uiSt.openS.add(s.id);uiSt.openE.add(ep.id);renderSeasons();}});

// === CROPPER ===
function openCrop(inputId,previewId,ar,onDone){const fi=$(inputId),pv=$(previewId);if(!fi)return;prevModal=!$("creatorModal")?.classList.contains("hidden")?"creatorModal":!$("profileModal")?.classList.contains("hidden")?"profileModal":null;cropTarget={pv,onDone};fi.value="";fi.onchange=e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{const img=new Image();img.onload=()=>{const ci=$("cropperImage");if(ci)ci.src=ev.target.result;if(prevModal)closeModal(prevModal);openModal("cropperModal");cropInst?.destroy();cropInst=new Cropper(ci,{aspectRatio:ar||NaN,viewMode:1,autoCropArea:1,responsive:true,crop(){const cv=cropInst.getCroppedCanvas({width:800});if(!cv)return;const u=cv.toDataURL("image/jpeg",.9);["prevMobile","prevPC","prevTV"].forEach(id=>{const el=$(id);if(el)el.src=u;});}});};img.src=ev.target.result;};reader.readAsDataURL(file);};fi.click();}
$("btnConfirmCrop")?.addEventListener("click",()=>{if(!cropInst||!cropTarget)return;const cv=cropInst.getCroppedCanvas({width:1200});if(cv&&cropTarget.pv){const u=cv.toDataURL("image/jpeg",.92);cropTarget.pv.src=u;cropTarget.pv.classList.remove("hidden");cropTarget.onDone?.(u);}cropInst?.destroy();cropInst=null;closeModal("cropperModal");if(prevModal)openModal(prevModal);});
$("btnCloseCropper")?.addEventListener("click",()=>{cropInst?.destroy();cropInst=null;closeModal("cropperModal");if(prevModal)openModal(prevModal);});
$("profilePhotoFile")?.closest(".file-upload-box")?.addEventListener("click",e=>{if(e.target.closest("input"))return;e.preventDefault();openCrop("profilePhotoFile","profilePhotoPreview",1,()=>{});});
$("profileBannerFile")?.closest(".file-upload-box")?.addEventListener("click",e=>{if(e.target.closest("input"))return;e.preventDefault();openCrop("profileBannerFile","profileBannerPreview",16/9,u=>{const bg=$("profileBannerImg");if(bg)bg.src=u;});});
$("mediaCoverFile")?.closest(".file-upload-box")?.addEventListener("click",e=>{if(e.target.closest("input"))return;e.preventDefault();openCrop("mediaCoverFile","mediaCoverPreview",.6666,()=>{});});
$("mediaBackdropFile")?.closest(".file-upload-box")?.addEventListener("click",e=>{if(e.target.closest("input"))return;e.preventDefault();openCrop("mediaBackdropFile","mediaBackdropPreview",1.7777,()=>{});});

// === CATALOG / CONTINUE ===
async function loadCatalog(){try{const s=await get(ref(db,"catalog"));catalog=[];if(s.exists()){const d=s.val();for(const k in d){const i={id:k,...d[k]};if(!Array.isArray(i.genres))i.genres=i.category?[i.category]:[];catalog.push(i);}}render();renderAdmin();handleHash();}catch(e){showMsg("Erro: "+e.message);}}
function getContList(){if(!curUid)return[];try{return JSON.parse(localStorage.getItem(`mfx_${curUid}_cont`)||"[]");}catch{return[];}}
function saveContList(l){if(curUid)localStorage.setItem(`mfx_${curUid}_cont`,JSON.stringify(l));}
function cleanCont(){let l=getContList();l=l.filter(i=>(Date.now()-(i.lw||0))<CONT_EXPIRE);saveContList(l);return l;}
function saveCont(item,extra="",epInfo=null){if(!curUid)return;let l=getContList().filter(i=>i.id!==item.id);l.unshift({id:item.id,title:item.title,type:item.type,cover:backdrop(item)||poster(item),dur:item.duration||extra,lw:Date.now(),epInfo});if(l.length>30)l.pop();saveContList(l);renderCont();}
function rmCont(id){saveContList(getContList().filter(i=>i.id!==id));renderCont();}
function getContInfo(id){return getContList().find(i=>i.id===id)||null;}
function renderCont(){const row=$("continueRow"),car=$("continueCarousel");if(!row||!car)return;car.innerHTML="";if(!curUid){row.classList.add("hidden");return;}let l=cleanCont();if(selCat==="Filmes")l=l.filter(i=>i.type==="movie");else if(selCat==="Séries")l=l.filter(i=>i.type==="serie");else if(selCat!=="Todos")l=l.filter(i=>{const o=catalog.find(m=>m.id===i.id);return o&&genres(o).includes(selCat);});if(!l.length){row.classList.add("hidden");return;}row.classList.remove("hidden");l.forEach(it=>{const card=document.createElement("div");card.className="continue-card";card.tabIndex=0;card.innerHTML=`<img src="${it.cover||""}" loading="lazy"><button class="continue-remove-btn">✕</button><div class="continue-play-icon">▶</div><div class="continue-info"><div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.title}</div>${it.epInfo?`<div class="continue-ep-badge">▶ ${it.epInfo}</div>`:""}<div class="continue-duration">${it.lw?"🕐 "+timeAgo(it.lw):""}</div></div>`;card.querySelector(".continue-remove-btn").onclick=e=>{e.stopPropagation();rmCont(it.id);};card.onclick=()=>{const o=catalog.find(m=>m.id===it.id);if(o)openDetails(o);};car.appendChild(card);});}
function render(){const mc=$("moviesCarousel"),sc=$("seriesCarousel"),mr=$("moviesRow"),sr=$("seriesRow");if(!mc||!sc)return;mc.innerHTML="";sc.innerHTML="";mr.classList.toggle("hidden",selCat==="Séries");sr.classList.toggle("hidden",selCat==="Filmes");catalog.forEach(it=>{if(!matchCat(it,selCat))return;const card=document.createElement("div");card.className="media-card";card.tabIndex=0;const ps=poster(it),tg=genres(it)[0]||(it.type==="movie"?"Filme":"Série");card.innerHTML=ps?`<img class="media-card-poster" src="${ps}" loading="lazy" onerror="this.style.display='none'"><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${it.title}</div></div>`:`<div class="media-card-poster-fallback">🎬</div><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${it.title}</div></div>`;card.onclick=()=>{location.hash=`#/midia/${it.id}`;openDetails(it);};(it.type==="movie"?mc:sc).appendChild(card);});renderCont();renderFeatured();}
function handleHash(){const h=location.hash;if(h.startsWith("#/midia/")){const it=catalog.find(m=>m.id===h.replace("#/midia/",""));if(it)openDetails(it);}}
addEventListener("hashchange",handleHash);

// === DETAILS ===
function openDetails(item){const bd=backdrop(item),ba=$("detailBackdropArea");if(ba){ba.style.background=bd?"":"#1a1a1a";if(bd)ba.style.backgroundImage=`url('${bd}')`;}const ps=poster(item),dp=$("detailPoster");if(dp){dp.src=ps||"";dp.style.display=ps?"block":"none";}$("detailTitle").innerText=item.title;$("detailMeta").innerText=`${item.type==="movie"?"FILME":"SÉRIE"} • ${item.year||""}${item.duration?" • ⏱️ "+item.duration:""}`;const gd=$("detailGenres");if(gd){gd.innerHTML="";genres(item).forEach(g=>{const b=document.createElement("span");b.style.cssText="padding:5px 14px;background:rgba(229,9,20,.12);border:1px solid rgba(229,9,20,.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary);text-transform:uppercase";b.textContent=g;gd.appendChild(b);});}$("detailDesc").innerText=item.description||"";const ci=getContInfo(item.id),ca=$("detailsContentArea");if(item.type==="movie"){$("detailMovieArea")?.classList.remove("hidden");$("detailSerieArea")?.classList.add("hidden");const btn=$("btnPlayMovieFile");btn.innerText=ci?"▶ Continuar":"▶ Assistir";btn.onclick=()=>{saveCont(item);closeModal("detailsModal");initiatePlay(normSrc(item),item.title,"Filme",item.id);};}else{$("detailMovieArea")?.classList.add("hidden");$("detailSerieArea")?.classList.remove("hidden");const tabs=$("seasonTabs");tabs.innerHTML="";let rsi=0,rei=-1;if(ci?.epInfo){const m=ci.epInfo.match(/T(\d+)\s*E(\d+)/i);if(m){rsi=parseInt(m[1])-1;rei=parseInt(m[2])-1;}}(item.seasons||[]).forEach((s,idx)=>{const tab=document.createElement("div");tab.className=`season-tab${idx===rsi?" active":""}`;tab.innerText=`T${idx+1}`;tab.tabIndex=0;tab.onclick=()=>{qa(".season-tab").forEach(t=>t.classList.remove("active"));tab.classList.add("active");if(s.seasonCoverUrl?.trim()&&ba)ba.style.backgroundImage=`url('${s.seasonCoverUrl}')`;else if(ba)ba.style.backgroundImage=bd?`url('${bd}')`:"";renderEpView(s.episodes||[],idx,s,item,idx===rsi?rei:-1);};tabs.appendChild(tab);});if(item.seasons?.length){const i=item.seasons[rsi]?rsi:0,s=item.seasons[i];if(s.seasonCoverUrl?.trim()&&ba)ba.style.backgroundImage=`url('${s.seasonCoverUrl}')`;renderEpView(s.episodes||[],i,s,item,i===rsi?rei:-1);}}openModal("detailsModal");if(ca)ca.scrollTop=0;}
function renderEpView(eps,si,sd,ser,rei){const c=$("episodesListContainer");if(!c)return;c.innerHTML="";const fb=sd?.seasonCoverUrl?.trim()||backdrop(ser)||poster(ser)||"";eps.forEach((ep,idx)=>{const d=document.createElement("div");d.className="episode-card";d.tabIndex=0;const th=ep.thumbUrl?.trim()||fb,lbl=`T${si+1} E${idx+1}`,isR=idx===rei;d.innerHTML=`<div class="episode-thumb"><img src="${th}" loading="lazy" onerror="this.src='${fb}'"><div class="ep-play-overlay"><span>▶</span></div></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">${lbl} - ${ep.title||"Sem Título"}${ep.duration?`<span style="color:#888;font-size:10px;margin-left:6px">⏱️ ${ep.duration}</span>`:""}</div><span style="font-size:11px;color:var(--primary);font-weight:700">▶ ${isR?"Continuar":"Assistir"}</span>${isR?`<div class="ep-resume-badge">⏳ Onde parou</div>`:""}</div>`;if(isR){d.style.border="1.5px solid rgba(255,202,40,.35)";d.style.background="rgba(255,202,40,.04)";}const play=()=>{closeModal("detailsModal");saveCont(ser,ep.duration||"",`${lbl} - ${ep.title||""}`);initiatePlay(normEpSrc(ep),ser.title,`${lbl} - ${ep.title||""}`,ser.id);};d.onclick=play;c.appendChild(d);});if(rei>=0)setTimeout(()=>{c.querySelectorAll(".episode-card")[rei]?.scrollIntoView({behavior:"smooth",block:"nearest"});},140);}
$("btnCloseDetails")?.addEventListener("click",()=>{location.hash="";closeModal("detailsModal");});

// ═══════════════════════════════════════
// PLAYER v9 — SEM TOUCH ZONE, BOTÕES FLUTUANTES
// ═══════════════════════════════════════
const pBox=$("playerBox"),pTop=$("playerTopbar"),pBot=$("playerBottombar");
const pVid=$("playerVideoArea"),pLoad=$("playerLoading");
const pErr=$("playerErrorScreen"),pSel=$("playerSourceSelector");

function pOpen(){return!$("playerModal")?.classList.contains("hidden");}
function inFS(){return!!(document.fullscreenElement||document.webkitFullscreenElement);}

// --- Barras ---
function showBars(){
    barsVisible=true;
    pTop?.classList.remove("bar-hidden");
    pBot?.classList.remove("bar-hidden");
    clearTimeout(hideTimer);clearTimeout(cursorTimer);
    hideTimer=setTimeout(()=>{if(!pOpen())return;hideBars();},HIDE_MS);
    if(!("ontouchstart"in window)){cursorTimer=setTimeout(()=>{if(pOpen())pBox?.classList.add("hide-cursor");},CURSOR_MS);}
}
function hideBars(){
    barsVisible=false;
    pTop?.classList.add("bar-hidden");
    pBot?.classList.add("bar-hidden");
    pBox?.classList.add("hide-cursor");
}
function toggleBars(){barsVisible?hideBars():showBars();}

// Botão flutuante ☰ mostra/esconde barras
$("btnPlayerMenu")?.addEventListener("click",e=>{e.stopPropagation();toggleBars();});
// Botão flutuante ← fecha player
$("btnPlayerBack")?.addEventListener("click",e=>{e.stopPropagation();closePlayer();});

// Desktop: mousemove mostra barras
pBox?.addEventListener("mousemove",()=>{if(pOpen())showBars();});

// Source selector / error
function showSrcSel(){
    if(!pSel)return;
    hideBars();pLoad?.classList.add("hidden");hideErr();
    $("playerTitleDisplay").innerText=pMeta.main||"Escolha uma fonte";
    $("playerSubDisplay").innerText=pMeta.sub||"MasterFlix";
    $("playerProviderBadge")?.classList.add("hidden");
    $("playerSourceSelectorSub").innerText=`${sources.length} fonte(s)`;
    const list=$("playerSourceList");list.innerHTML="";
    sources.forEach((src,idx)=>{
        const btn=document.createElement("button");btn.type="button";btn.className="player-source-btn"+(idx===srcIdx&&vidUrl?" current":"");btn.tabIndex=0;
        const a=adp(src.type),title=src.label||a.name,short=src.url?(src.url.length>55?src.url.slice(0,55)+"…":src.url):"",ct=idx===srcIdx&&vidUrl?`<span class="current-tag">Atual</span>`:"";
        btn.innerHTML=`<div class="source-btn-top"><span class="source-btn-title">${a.icon} ${title}${ct}</span><span class="source-btn-type" style="color:${a.color}">${a.name}</span></div><div class="source-btn-url">${short}</div>`;
        btn.onclick=()=>{hideSrcSel();srcIdx=idx;playSrc(idx);};list.appendChild(btn);
    });
    pSel.classList.remove("hidden");
    setTimeout(()=>list.querySelector(".player-source-btn")?.focus(),120);
}
function hideSrcSel(){pSel?.classList.add("hidden");}
function showErr(desc,name){$("playerErrorTitle").textContent=`Falha: ${name||"player"}`;$("playerErrorDesc").textContent=desc||"Tente outra fonte.";$("btnErrorTryAnother").style.display=sources.length>1?"":"none";pErr?.classList.remove("hidden");pLoad?.classList.add("hidden");}
function hideErr(){pErr?.classList.add("hidden");}

$("btnCancelSourceSelection")?.addEventListener("click",()=>vidUrl?hideSrcSel():closePlayer());
$("btnErrorTryAnother")?.addEventListener("click",()=>{hideErr();showSrcSel();});
$("btnErrorReload")?.addEventListener("click",()=>{hideErr();playSrc(srcIdx);});
$("btnChangeSource")?.addEventListener("click",e=>{e.stopPropagation();showSrcSel();});
$("btnToggleStretch")?.addEventListener("click",e=>{e.stopPropagation();stretch=!stretch;pVid?.classList.toggle("stretch",stretch);const btn=$("btnToggleStretch");if(btn){btn.classList.toggle("active",stretch);btn.innerHTML=stretch?"⇲":"⇱";}showMsg(stretch?"📐 Esticado":"🖼️ Ajustado","success");showBars();});
$("btnReloadPlayer")?.addEventListener("click",e=>{e.stopPropagation();if(vidUrl){playSrc(srcIdx);showMsg("Recarregando...","info");}});

// Fullscreen — tenta no box, fallback no video element
$("btnToggleFullscreen")?.addEventListener("click",async e=>{
    e.stopPropagation();
    try{
        if(!inFS()){
            // Tenta fullscreen no box inteiro
            if(pBox?.requestFullscreen)await pBox.requestFullscreen();
            else if(pBox?.webkitRequestFullscreen)await pBox.webkitRequestFullscreen();
            else{
                // Fallback: fullscreen no video/iframe direto (webview)
                const vid=pVid?.querySelector("video");
                const ifr=pVid?.querySelector("iframe");
                if(vid?.webkitEnterFullscreen)vid.webkitEnterFullscreen();
                else if(vid?.requestFullscreen)await vid.requestFullscreen();
                else if(ifr?.requestFullscreen)await ifr.requestFullscreen();
                else if(ifr?.webkitRequestFullscreen)await ifr.webkitRequestFullscreen();
            }
            try{await screen.orientation?.lock?.("landscape");}catch{}
        }else{
            if(document.exitFullscreen)await document.exitFullscreen();
            else if(document.webkitExitFullscreen)await document.webkitExitFullscreen();
            try{screen.orientation?.unlock?.();}catch{}
        }
    }catch(err){console.warn("Fullscreen:",err);}
    showBars();
});
["fullscreenchange","webkitfullscreenchange"].forEach(ev=>document.addEventListener(ev,()=>{if(!pOpen())return;const btn=$("btnToggleFullscreen");if(btn)btn.innerHTML=inFS()?"⤢":"⛶";showBars();}));

function initiatePlay(srcs,main,sub,itemId=null){
    if(!srcs?.length){showMsg("Nenhum link!");return;}
    sources=[...srcs];pMeta={main,sub};playingId=itemId;viewTracked=false;
    openModal("playerModal");
    $("btnChangeSource")?.classList.toggle("hidden",sources.length<=1);
    showBars();
    if(sources.length===1){srcIdx=0;playSrc(0);}else showSrcSel();
}

function playSrc(idx){
    const src=sources[idx];if(!src?.url){showMsg("Link inválido!");return;}
    const a=adp(src.type);const url=a.fmt(src.url);vidUrl=url;srcIdx=idx;
    $("playerTitleDisplay").innerText=pMeta.main||"Assistindo";
    $("playerSubDisplay").innerText=pMeta.sub||"MasterFlix";
    const badge=$("playerProviderBadge");if(badge){badge.innerHTML=`${a.icon} ${src.label||a.name}`;badge.style.background=`${a.color}30`;badge.style.borderColor=`${a.color}80`;badge.classList.remove("hidden");}
    pLoad?.classList.remove("hidden");$("playerLoadingText").textContent=`Carregando ${a.name}...`;$("playerLoadingSub").textContent="Player otimizado";hideErr();hideSrcSel();
    // Remove vídeos antigos
    pVid?.querySelectorAll("iframe,video").forEach(n=>n.remove());
    if(stretch){stretch=false;pVid?.classList.remove("stretch");const b=$("btnToggleStretch");if(b){b.classList.remove("active");b.innerHTML="⇱";}}
    const el=a.mk(url);
    el.addEventListener("load",()=>{setTimeout(()=>pLoad?.classList.add("hidden"),450);clearTimeout(errTimer);setTimeout(()=>addView(playingId),1200);});
    if(el.tagName==="VIDEO"){el.addEventListener("canplay",()=>{setTimeout(()=>pLoad?.classList.add("hidden"),220);clearTimeout(errTimer);addView(playingId);});el.addEventListener("play",()=>addView(playingId));el.addEventListener("error",()=>showErr("Vídeo não disponível.",a.name));}
    pVid?.appendChild(el);
    clearTimeout(errTimer);errTimer=setTimeout(()=>pLoad?.classList.add("hidden"),a.ms);
    showBars();
    const tip=$("playerTip");if(tip){setTimeout(()=>{if(!pOpen())return;tip.textContent="Use o botão ☰ para mostrar controles";tip.classList.add("show");setTimeout(()=>tip.classList.remove("show"),4000);},2000);}
}

function closePlayer(){
    clearTimeout(hideTimer);clearTimeout(cursorTimer);clearTimeout(errTimer);
    if(inFS()){try{document.exitFullscreen?.();}catch{}try{document.webkitExitFullscreen?.();}catch{}try{screen.orientation?.unlock?.();}catch{}}
    pVid?.querySelectorAll("iframe,video").forEach(n=>n.remove());
    pVid?.classList.remove("stretch");pLoad?.classList.remove("hidden");
    hideErr();hideSrcSel();closeModal("playerModal");
    vidUrl="";sources=[];srcIdx=0;playingId=null;viewTracked=false;stretch=false;barsVisible=false;
    $("btnChangeSource")?.classList.add("hidden");$("playerProviderBadge")?.classList.add("hidden");
    const b=$("btnToggleStretch");if(b){b.classList.remove("active");b.innerHTML="⇱";}
    pTop?.classList.add("bar-hidden");pBot?.classList.add("bar-hidden");
    pBox?.classList.remove("hide-cursor");
    renderCont();
}

// Player keyboard
document.addEventListener("keydown",e=>{
    if(!pOpen())return;
    if(e.key==="Escape"){closePlayer();return;}
    if(e.key==="f"||e.key==="F")$("btnToggleFullscreen")?.click();
    if(e.key==="s"||e.key==="S")$("btnToggleStretch")?.click();
    if(e.key==="r"||e.key==="R")$("btnReloadPlayer")?.click();
    if(e.key==="c"||e.key==="C")$("btnChangeSource")?.click();
    if(e.key===" ")toggleBars();
    showBars();
});

// === FORM SAVE ===
$("mediaForm")?.addEventListener("submit",async e=>{e.preventDefault();syncInputs();if(!selGenres.length){showMsg("Selecione ao menos 1 gênero!");q('.creator-tab[data-tab="info"]')?.click();return;}const title=$("mediaTitle")?.value.trim()||"";if(!title){showMsg("Título!");q('.creator-tab[data-tab="info"]')?.click();return;}const editId=$("editMediaId")?.value;const ex=editId?catalog.find(m=>m.id===editId):null;let cv=$("mediaCoverPreview")?.src||"";let bd=$("mediaBackdropPreview")?.src||"";if(!validImg(cv))cv=ex?.coverUrl||"";if(!validImg(bd))bd=ex?.backdropUrl||"";const payload={type:creator.type,genres:[...selGenres],category:selGenres[0],title,year:$("mediaYear")?.value.trim()||"",duration:$("mediaDuration")?.value.trim()||"",description:$("mediaDesc")?.value.trim()||"",coverUrl:validImg(cv)?cv:"",backdropUrl:validImg(bd)?bd:""};if(creator.type==="movie"){const vs=creator.movieSrc.filter(s=>s.url?.trim());if(!vs.length){showMsg("Adicione 1 fonte!");q('.creator-tab[data-tab="content"]')?.click();return;}const used=vs.map(s=>s.type).filter(t=>t&&t!=="other");const dup=used.find((t,i)=>used.indexOf(t)!==i);if(dup){showMsg(`Duplicada: ${typeLbl(dup)}`);return;}payload.videoSources=vs.map(s=>({type:s.type||"other",label:s.label||typeLbl(s.type)||"Fonte",url:s.url.trim()}));payload.videoUrl=payload.videoSources[0].url;}else{const built=[];for(let si=0;si<creator.seasons.length;si++){const s=creator.seasons[si];const eps=[];for(let ei=0;ei<(s.episodes||[]).length;ei++){const ep=s.episodes[ei];const epS=(ep.sources||[]).filter(x=>x.url?.trim());const epU=epS.map(x=>x.type).filter(t=>t&&t!=="other");const epD=epU.find((t,i)=>epU.indexOf(t)!==i);if(epD){showMsg(`T${si+1}E${ei+1}: "${typeLbl(epD)}" duplicada`);return;}eps.push({title:ep.title?.trim()||`Episódio ${ei+1}`,duration:ep.duration?.trim()||"",thumbUrl:validImg(ep.thumbUrl)?ep.thumbUrl:"",videoSources:epS.map(x=>({type:x.type||"other",label:x.label||typeLbl(x.type)||"Fonte",url:x.url.trim()})),videoUrl:epS.length?epS[0].url.trim():""});}built.push({seasonNumber:si+1,seasonCoverUrl:validImg(s.seasonCoverUrl)?s.seasonCoverUrl:"",episodes:eps});}payload.seasons=built;}try{if(editId)await set(ref(db,"catalog/"+editId),payload);else await set(push(ref(db,"catalog")),payload);showMsg("Salvo! ✅","success");closeModal("creatorModal");resetCreator();await loadCatalog();}catch(err){showMsg("Erro: "+err.message);}});
$("btnCancelCreator")?.addEventListener("click",()=>{if(confirm("Descartar?")){closeModal("creatorModal");resetCreator();}});
function resetCreator(){creator={type:"movie",movieSrc:[],seasons:[]};uiSt.openS.clear();uiSt.openE.clear();selGenres=[];$("mediaForm")?.reset();$("editMediaId").value="";$("mediaCoverPreview")?.classList.add("hidden");$("mediaBackdropPreview")?.classList.add("hidden");$("mediaType").disabled=false;$("movieFileArea")?.classList.remove("hidden");$("seriesBuilderArea")?.classList.add("hidden");renderGenres();renderMovSrc();renderSeasons();q('.creator-tab[data-tab="info"]')?.click();}

// === ADMIN ===
window.editMedia=id=>{const i=catalog.find(m=>m.id===id);if(!i)return;resetCreator();$("editMediaId").value=i.id;$("mediaType").value=i.type;$("mediaType").disabled=true;creator.type=i.type;$("movieFileArea")?.classList.toggle("hidden",i.type!=="movie");$("seriesBuilderArea")?.classList.toggle("hidden",i.type==="movie");selGenres=Array.isArray(i.genres)&&i.genres.length?[...i.genres]:i.category?[i.category]:[];renderGenres();$("mediaTitle").value=i.title||"";$("mediaYear").value=i.year||"";$("mediaDuration").value=i.duration||"";$("mediaDesc").value=i.description||"";if(i.coverUrl){const img=$("mediaCoverPreview");img.src=i.coverUrl;img.classList.remove("hidden");}if(i.backdropUrl){const img=$("mediaBackdropPreview");img.src=i.backdropUrl;img.classList.remove("hidden");}$("creatorTitle").innerText="Editar";$("creatorSubtitle").innerText="Ajuste os dados";if(i.type==="movie"){creator.movieSrc=normSrc(i).map(s=>({id:uid(),...s}));renderMovSrc();}else{creator.seasons=(i.seasons||[]).map((s,si)=>({id:uid(),seasonNumber:si+1,seasonCoverUrl:s.seasonCoverUrl||"",episodes:(s.episodes||[]).map(ep=>({id:uid(),title:ep.title||"",duration:ep.duration||"",thumbUrl:ep.thumbUrl||"",sources:normEpSrc(ep).map(x=>({id:uid(),...x}))}))}));if(creator.seasons[0])uiSt.openS.add(creator.seasons[0].id);renderSeasons();}closeModal("adminModal");openModal("creatorModal");};
window.deleteMedia=async id=>{if(!confirm("Apagar?"))return;try{await remove(ref(db,"catalog/"+id));showMsg("Removido!","success");loadCatalog();}catch{showMsg("Erro!");}};
function renderAdmin(){const c=$("adminCatalogList");if(!c)return;const sv=norm($("adminSearchInput")?.value||"");c.innerHTML="";catalog.forEach(i=>{if(sv&&!norm(i.title).includes(sv))return;const d=document.createElement("div");d.className="admin-item";d.innerHTML=`<div><strong>${i.title}</strong><div style="font-size:10px;color:#888">${i.type==="movie"?"🎬":"📺"}${i.year?" • "+i.year:""}</div></div><div style="display:flex;gap:6px"><button class="btn-secondary" onclick="editMedia('${i.id}')">✏️</button><button class="btn-danger" onclick="deleteMedia('${i.id}')">🗑️</button></div>`;c.appendChild(d);});}
$("adminSearchInput")?.addEventListener("input",renderAdmin);
$("btnCloseAdmin")?.addEventListener("click",()=>closeModal("adminModal"));
$("btnAddNewFromAdmin")?.addEventListener("click",()=>{closeModal("adminModal");openCreator();});
function openCreator(){resetCreator();$("creatorTitle").innerText="Publicar";$("creatorSubtitle").innerText="Preencha os dados";openModal("creatorModal");}

// === SUGGESTIONS / STORAGE ===
$("btnCloseSuggestion")?.addEventListener("click",()=>closeModal("suggestionModal"));
$("btnSendSuggestion")?.addEventListener("click",async()=>{const u=auth.currentUser;if(!u)return showMsg("Login!");const t=$("suggestionText")?.value.trim(),tp=$("suggestionType")?.value;if(!t||t.length<5)return showMsg("Escreva mais!");try{await set(push(ref(db,"suggestions")),{userId:u.uid,userEmail:u.email,userName:cGet("name")||u.email.split("@")[0],text:t,type:tp,timestamp:Date.now()});$("suggestionText").value="";showMsg("Enviado!","success");closeModal("suggestionModal");}catch{showMsg("Erro!");}});
$("btnCloseSuggestionsAdmin")?.addEventListener("click",()=>{exitSel();closeModal("suggestionsAdminModal");});
async function loadSuggAdmin(){try{const s=await get(ref(db,"suggestions"));allSugg=[];if(s.exists()){const d=s.val();for(const k in d)allSugg.push({id:k,...d[k]});}allSugg.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));$("suggestionsCountText").textContent=`${allSugg.length} item(s)`;renderSugg();}catch{}}
function renderSugg(){const c=$("suggestionsAdminList");if(!c)return;c.innerHTML="";if(!allSugg.length){c.innerHTML=`<p style="text-align:center;color:#666;padding:30px">Vazio.</p>`;return;}allSugg.forEach(s=>{const d=document.createElement("div");d.className="suggestion-box";const date=s.timestamp?new Date(s.timestamp).toLocaleDateString("pt-BR"):"?";const cb=suggSelMode?`<input type="checkbox" class="suggestion-checkbox" data-id="${s.id}" ${suggSelIds.has(s.id)?"checked":""}>`:"";const del=!suggSelMode?`<button class="btn-danger" onclick="delSugg('${s.id}')">🗑️</button>`:"";d.innerHTML=`<div class="sg-header"><div style="display:flex;align-items:center;gap:8px">${cb}<div><div class="sg-user">${s.userName||"?"} ${s.type==="bug"?"🐛":"💡"}</div><div class="sg-email">${s.userEmail||""}</div></div></div><div style="display:flex;align-items:center;gap:6px"><span class="sg-date">${date}</span>${del}</div></div><div class="sg-text">${s.text}</div>`;if(suggSelMode){const chk=d.querySelector(".suggestion-checkbox");chk.onchange=()=>chk.checked?suggSelIds.add(s.id):suggSelIds.delete(s.id);}c.appendChild(d);});}
function enterSel(){suggSelMode=true;suggSelIds.clear();$("btnToggleSelectMode")?.classList.add("hidden");$("btnDeleteSelectedSuggestions")?.classList.remove("hidden");$("btnSelectAllSuggestions")?.classList.remove("hidden");$("btnCancelSelectMode")?.classList.remove("hidden");renderSugg();}
function exitSel(){suggSelMode=false;suggSelIds.clear();$("btnToggleSelectMode")?.classList.remove("hidden");$("btnDeleteSelectedSuggestions")?.classList.add("hidden");$("btnSelectAllSuggestions")?.classList.add("hidden");$("btnCancelSelectMode")?.classList.add("hidden");renderSugg();}
$("btnToggleSelectMode")?.addEventListener("click",enterSel);
$("btnCancelSelectMode")?.addEventListener("click",exitSel);
$("btnSelectAllSuggestions")?.addEventListener("click",()=>{suggSelIds.size===allSugg.length?suggSelIds.clear():allSugg.forEach(s=>suggSelIds.add(s.id));renderSugg();});
$("btnDeleteSelectedSuggestions")?.addEventListener("click",async()=>{if(!suggSelIds.size||!confirm(`Apagar ${suggSelIds.size}?`))return;try{for(const id of suggSelIds)await remove(ref(db,"suggestions/"+id));showMsg("OK!","success");exitSel();loadSuggAdmin();}catch{}});
window.delSugg=async id=>{if(!confirm("Apagar?"))return;try{await remove(ref(db,"suggestions/"+id));loadSuggAdmin();}catch{}};
$("btnCloseStorage")?.addEventListener("click",()=>closeModal("storageModal"));
async function loadStorage(){const c=$("storageContent");if(!c)return;c.innerHTML=`<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto 14px;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando...</p></div>`;try{const[cs,us,ss]=await Promise.all([get(ref(db,"catalog")).catch(()=>null),get(ref(db,"users")).catch(()=>null),get(ref(db,"suggestions")).catch(()=>null)]);const cd=cs?.exists()?cs.val():{},ud=us?.exists()?us.val():{},sd=ss?.exists()?ss.val():{};const cb=jsonSz(cd),ub=jsonSz(ud),sb=jsonSz(sd),tb=cb+ub+sb;const cc=Object.keys(cd).length,uc=Object.keys(ud).length,sc=Object.keys(sd).length;let mc=0,s2=0,te=0;Object.values(cd).forEach(i=>{if(i.type==="movie")mc++;else{s2++;(i.seasons||[]).forEach(s=>te+=(s.episodes||[]).length);}});const pct=Math.min(100,tb/DB_LIMIT*100);const free=DB_LIMIT-tb;const bc=pct>85?"#ff5722":pct>70?"#ff9800":pct>50?"#8bc34a":"#4caf50";const st=pct>85?"🔴 Crítico":pct>70?"⚠️ Atenção":"✅ Saudável";c.innerHTML=`<div style="text-align:center;margin-bottom:20px"><div style="font-size:38px;font-weight:900;color:${bc}">${pct.toFixed(1)}%</div><div style="font-size:14px;font-weight:800;margin-top:4px">${st}</div></div><div style="margin-bottom:22px"><div class="storage-bar-outer"><div class="storage-bar-inner" style="width:${Math.max(2,pct)}%;background:${bc}"></div></div><div class="storage-info"><span>${fmtB(tb)} usado</span><span>${fmtB(free)} livre</span></div></div><div style="display:flex;gap:10px;margin-bottom:22px"><div class="storage-icon-card"><span class="sto-icon">🎬</span><div class="sto-count">${mc}</div><div class="sto-label">Filmes</div></div><div class="storage-icon-card"><span class="sto-icon">📺</span><div class="sto-count">${s2}</div><div class="sto-label">Séries</div></div><div class="storage-icon-card"><span class="sto-icon">🎞️</span><div class="sto-count">${te}</div><div class="sto-label">Episódios</div></div></div><div class="storage-detail-item"><span class="storage-label">Catálogo (${cc})</span><span class="storage-value">${fmtB(cb)}</span></div><div class="storage-detail-item"><span class="storage-label">Usuários (${uc})</span><span class="storage-value">${fmtB(ub)}</span></div><div class="storage-detail-item"><span class="storage-label">Sugestões (${sc})</span><span class="storage-value">${fmtB(sb)}</span></div>`;}catch(e){c.innerHTML=`<p style="text-align:center;color:#ff5252">${e.message}</p>`;}}

// === PROFILE ===
function openProfModal(){openModal("profileModal");updateDevBadge();}
function resetProfUI(){const st=(id,t)=>{const n=$(id);if(n)n.innerText=t;};const sv=(id,v)=>{const n=$(id);if(n)n.value=v;};st("avatarText","U");$("avatarImg")?.classList.add("hidden");$("avatarText")?.classList.remove("hidden");st("profileAvatarBigText","U");$("profileAvatarBigImg")?.classList.add("hidden");$("profileAvatarBigText")?.classList.remove("hidden");st("profileNameDisplay","Usuário");st("profileEmailDisplay","");st("profileBioDisplay",'"Maratonando!"');sv("profileNameInput","");sv("profileBioInput","");const b=$("profileBannerImg");if(b)b.src="https://placehold.co/600x200/1e1e1e/8c8c8c?text=Banner";$("profilePhotoPreview")?.classList.add("hidden");$("profileBannerPreview")?.classList.add("hidden");st("sidebarUserName","Usuário");st("sidebarUserEmail","email@exemplo.com");const sa=$("sidebarAvatar");if(sa)sa.innerHTML="<span>U</span>";sv("themeColorPicker","#e50914");}
function updateAvatarUI(data={}){const u=auth.currentUser;const name=data.name||cGet("name")||"";const bio=data.bio||cGet("bio")||"";const fav=data.favGenre||cGet("fav_genre")||"";const av=data.photo||cGet("avatar")||"";const bn=data.banner||cGet("banner")||"";const letter=name?name.charAt(0).toUpperCase():(u?u.email.charAt(0).toUpperCase():"U");const st=(id,t)=>{const n=$(id);if(n)n.innerText=t;};const sv=(id,v)=>{const n=$(id);if(n)n.value=v;};if(name){st("profileNameDisplay",name);sv("profileNameInput",name);st("sidebarUserName",name);}else if(u){const n=u.email.split("@")[0];st("profileNameDisplay",n);st("sidebarUserName",n);}if(u){st("profileEmailDisplay",u.email);st("sidebarUserEmail",u.email);}if(bio){st("profileBioDisplay",`"${bio}"`);sv("profileBioInput",bio);}if(fav)sv("profileFavGenreInput",fav);if(bn){const bi=$("profileBannerImg"),bp=$("profileBannerPreview");if(bi)bi.src=bn;if(bp){bp.src=bn;bp.classList.remove("hidden");}}const sa=$("sidebarAvatar");if(sa)sa.innerHTML="";if(av){const ai=$("avatarImg");if(ai){ai.src=av;ai.classList.remove("hidden");}$("avatarText")?.classList.add("hidden");const abi=$("profileAvatarBigImg");if(abi){abi.src=av;abi.classList.remove("hidden");}$("profileAvatarBigText")?.classList.add("hidden");const pp=$("profilePhotoPreview");if(pp){pp.src=av;pp.classList.remove("hidden");}if(sa){const img=document.createElement("img");img.src=av;sa.appendChild(img);}}else{st("avatarText",letter);st("profileAvatarBigText",letter);if(sa)sa.innerHTML=`<span>${letter}</span>`;}}
async function loadProfile(user){if(!user)return;try{const s=await get(ref(db,"users/"+user.uid));if(s.exists()){const d=s.val();if(d.name)cSet("name",d.name);if(d.bio)cSet("bio",d.bio);if(d.favGenre)cSet("fav_genre",d.favGenre);if(d.photo)cSet("avatar",d.photo);if(d.banner)cSet("banner",d.banner);if(d.themeColor)cSet("theme",d.themeColor);updateAvatarUI(d);if(d.themeColor){applyTheme(d.themeColor);const p=$("themeColorPicker");if(p)p.value=d.themeColor;}}else updateAvatarUI({});}catch{updateAvatarUI({});}}
$("btnSaveProfile")?.addEventListener("click",async()=>{const u=auth.currentUser;if(!u)return;const tc=$("themeColorPicker")?.value||"#e50914";applyTheme(tc);const n=$("profileNameInput")?.value.trim()||"";const b=$("profileBioInput")?.value.trim()||"";const fg=$("profileFavGenreInput")?.value||"Ação";const ph=$("profilePhotoPreview")?.src||"";const bn=$("profileBannerPreview")?.src||"";const data={name:n,bio:b,favGenre:fg,photo:validImg(ph)?ph:"",banner:validImg(bn)?bn:"",themeColor:tc};try{await set(ref(db,"users/"+u.uid),data);if(n)cSet("name",n);if(b)cSet("bio",b);cSet("fav_genre",fg);if(data.photo)cSet("avatar",data.photo);if(data.banner)cSet("banner",data.banner);cSet("theme",tc);updateAvatarUI(data);showMsg("Salvo! ✅","success");closeModal("profileModal");}catch(e){showMsg("Erro: "+e.message);}});
$("btnChangePasswordFromProfile")?.addEventListener("click",async()=>{const u=auth.currentUser;if(!u)return;if(!confirm(`Link para ${u.email}?`))return;try{await sendPasswordResetEmail(auth,u.email);showMsg("Link enviado!","success");}catch(e){showMsg("Erro: "+e.message);}});
async function doLogout(){try{const u=auth.currentUser;if(u){try{await remove(ref(db,`devices/${u.uid}/${getDevId()}`));}catch{}}stopHB();curUid=null;await signOut(auth);resetProfUI();document.documentElement.style.setProperty("--primary","#e50914");closeModal("profileModal");closeSB();catalog=[];isAdm=false;render();showMsg("Saiu! 👋","success");}catch{showMsg("Erro!");}}
$("btnLogout")?.addEventListener("click",doLogout);

// === DEVICES ===
function getDevId(){let id=localStorage.getItem(DEV_KEY);if(!id){id="dev_"+uid()+"_"+Math.random().toString(36).slice(2,8);localStorage.setItem(DEV_KEY,id);}return id;}
function detectDev(){const ua=navigator.userAgent;let type="desktop",icon="💻",name="Desktop";if(/tablet|ipad/i.test(ua)&&!/mobile/i.test(ua)){type="tablet";icon="📱";name="Tablet";}else if(/mobile|android|iphone|ipod/i.test(ua)){type="mobile";icon="📱";name="Celular";}else if(/smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(ua)){type="tv";icon="📺";name="Smart TV";}let browser="Navegador";if(/chrome/i.test(ua)&&!/edg/i.test(ua))browser="Chrome";else if(/firefox/i.test(ua))browser="Firefox";else if(/safari/i.test(ua)&&!/chrome/i.test(ua))browser="Safari";else if(/edg/i.test(ua))browser="Edge";let os="?";if(/windows nt 10/i.test(ua))os="Win 10/11";else if(/windows/i.test(ua))os="Windows";else if(/android/i.test(ua))os="Android";else if(/iphone|ipad|ipod/i.test(ua))os="iOS";else if(/mac/i.test(ua))os="macOS";else if(/linux/i.test(ua))os="Linux";return{type,icon,name,browser,os};}
async function regDev(user){if(!user)return;const did=getDevId(),info=detectDev();try{const snap=await get(ref(db,`devices/${user.uid}/${did}`));const fl=snap.exists()?(snap.val().firstLogin||Date.now()):Date.now();await set(ref(db,`devices/${user.uid}/${did}`),{deviceId:did,...info,userAgent:navigator.userAgent.slice(0,200),firstLogin:fl,lastActive:Date.now()});startHB(user.uid,did);}catch{}}
function startHB(uid,did){stopHB();heartbeatInt=setInterval(async()=>{try{await set(ref(db,`devices/${uid}/${did}/lastActive`),Date.now());}catch{}},HEARTBEAT);}
function stopHB(){clearInterval(heartbeatInt);heartbeatInt=null;}
$("btnOpenDevicesModal")?.addEventListener("click",()=>{closeModal("profileModal");openDevModal();});
$("btnCloseDevices")?.addEventListener("click",()=>{closeModal("devicesModal");openModal("profileModal");});
async function openDevModal(){openModal("devicesModal");const list=$("devicesList"),info=$("devicesInfoText");if(list)list.innerHTML=`<div style="text-align:center;padding:30px"><div class="player-spinner" style="margin:0 auto;width:32px;height:32px"></div></div>`;if(info)info.textContent="Carregando...";const u=auth.currentUser;if(!u)return;try{const snap=await get(ref(db,`devices/${u.uid}`));const curId=getDevId();if(!snap.exists()){if(list)list.innerHTML=`<p style="text-align:center;color:#666;padding:30px">Nenhum</p>`;return;}const devs=Object.values(snap.val()).sort((a,b)=>(b.lastActive||0)-(a.lastActive||0));if(info)info.textContent=`${devs.length} dispositivo(s)`;list.innerHTML="";devs.forEach(d=>{const isCur=d.deviceId===curId;const it=document.createElement("div");it.className="device-item"+(isCur?" current-device":"");it.innerHTML=`<div class="device-icon-big">${d.icon||"📱"}</div><div class="device-info"><div class="device-name">${d.name||"?"} ${isCur?`<span class="device-current-tag">ESTE</span>`:""}</div><div class="device-meta"><span>🌐 ${d.browser||"?"}</span><span>💻 ${d.os||"?"}</span></div><div class="device-meta" style="margin-top:1px"><span>🕐 ${d.lastActive?timeAgo(d.lastActive):"?"}</span></div></div>${!isCur?`<button type="button" class="device-remove-btn" data-rm-dev="${d.deviceId}">✕</button>`:""}`;list.appendChild(it);});list.querySelectorAll("[data-rm-dev]").forEach(btn=>{btn.onclick=async()=>{if(!confirm("Encerrar?"))return;await remove(ref(db,`devices/${u.uid}/${btn.dataset.rmDev}`));showMsg("Encerrada!","success");openDevModal();updateDevBadge();};});}catch(e){if(list)list.innerHTML=`<p style="color:#ff5252">${e.message}</p>`;}}
$("btnLogoutAllDevices")?.addEventListener("click",async()=>{const u=auth.currentUser;if(!u||!confirm("Encerrar outros?"))return;const curId=getDevId();try{const snap=await get(ref(db,`devices/${u.uid}`));if(snap.exists())for(const did of Object.keys(snap.val()))if(did!==curId)await remove(ref(db,`devices/${u.uid}/${did}`));}catch{}showMsg("Encerrados!","success");openDevModal();updateDevBadge();});
async function updateDevBadge(){const u=auth.currentUser;if(!u)return;try{const s=await get(ref(db,`devices/${u.uid}`));const c=s.exists()?Object.keys(s.val()).length:1;const b=$("devicesCountBadge");if(b)b.textContent=c;}catch{}}

// === AUTH ===
function clearAuth(){["authEmail","authPassword","authDisplayName"].forEach(id=>{const e=$(id);if(e)e.value="";});const pw=$("authPassword");if(pw)pw.type="password";const b=$("btnTogglePassword");if(b)b.textContent="👁️";}
function updateAuthMode(){const m=$("authModalBody");m?.classList.toggle("signup-mode",signUpMode);$("authSubtitle").innerText=signUpMode?"Crie sua conta":"Entre para continuar";$("btnAuthSubmit").innerText=signUpMode?"Criar":"Entrar";const t=$("toggleAuthMode");if(t)t.innerHTML=signUpMode?'Já tem conta? <span style="color:var(--primary)">Entrar</span>':'Não tem? <span style="color:var(--primary)">Criar</span>';clearAuth();}
$("btnTogglePassword")?.addEventListener("click",()=>{const pw=$("authPassword");if(!pw)return;pw.type=pw.type==="password"?"text":"password";$("btnTogglePassword").textContent=pw.type==="password"?"👁️":"🙈";});
$("toggleAuthMode")?.addEventListener("click",()=>{signUpMode=!signUpMode;updateAuthMode();});
$("btnForgotPassword")?.addEventListener("click",()=>{closeModal("authOverlay");openModal("forgotPasswordModal");});
$("btnBackToLogin")?.addEventListener("click",()=>{closeModal("forgotPasswordModal");openModal("authOverlay");});
$("btnCloseForgot")?.addEventListener("click",()=>{closeModal("forgotPasswordModal");openModal("authOverlay");});
$("btnForgotSuccessClose")?.addEventListener("click",()=>{closeModal("forgotSuccessModal");openModal("authOverlay");});
$("forgotPasswordForm")?.addEventListener("submit",async e=>{e.preventDefault();const email=$("forgotEmail")?.value.trim().toLowerCase();if(!email)return showMsg("E-mail!");const btn=$("btnSendResetEmail"),old=btn?.innerText;if(btn){btn.innerText="⏳";btn.disabled=true;}try{await sendPasswordResetEmail(auth,email);closeModal("forgotPasswordModal");$("forgotSuccessEmail").textContent=email;openModal("forgotSuccessModal");}catch(err){showMsg(authErr(err.code));}if(btn){btn.innerText=old;btn.disabled=false;}});
$("authForm")?.addEventListener("submit",async e=>{e.preventDefault();if(authBusy)return;authBusy=true;const btn=$("btnAuthSubmit"),old=btn?.innerText;if(btn){btn.innerText="⏳";btn.disabled=true;}const email=$("authEmail")?.value.trim().toLowerCase(),pass=$("authPassword")?.value,name=$("authDisplayName")?.value.trim()||"";if(!email||!pass||pass.length<6){showMsg("Preencha! Senha mín. 6");authBusy=false;if(btn){btn.innerText=old;btn.disabled=false;}return;}if(signUpMode&&!name){showMsg("Nome!");authBusy=false;if(btn){btn.innerText=old;btn.disabled=false;}return;}try{if(signUpMode){if(auth.currentUser)await signOut(auth);const cred=await createUserWithEmailAndPassword(auth,email,pass);await set(ref(db,"users/"+cred.user.uid),{name,bio:"",favGenre:"Ação",photo:"",banner:"",themeColor:"#e50914",createdAt:Date.now()});showMsg("Conta criada! ✅","success");}else{if(auth.currentUser)await signOut(auth);await signInWithEmailAndPassword(auth,email,pass);showMsg("Bem-vindo! 🎬","success");}closeModal("authOverlay");clearAuth();}catch(err){showMsg(authErr(err.code));}authBusy=false;if(btn){btn.innerText=old;btn.disabled=false;}});

// === MISC ===
$("btnOpenProfile")?.addEventListener("click",openProfModal);
$("btnCloseProfile")?.addEventListener("click",()=>closeModal("profileModal"));
$("btnCloseCreator")?.addEventListener("click",()=>{if(confirm("Fechar sem salvar?")){closeModal("creatorModal");resetCreator();}});

// === GLOBAL ESC ===
document.addEventListener("keydown",e=>{if(pOpen())return;if(e.key==="Escape"||e.key==="GoBack"||e.keyCode===10009){const mods=["devicesModal","cropperModal","forgotPasswordModal","forgotSuccessModal","detailsModal","profileModal","adminModal","creatorModal","suggestionModal","suggestionsAdminModal","storageModal"];for(const id of mods){if($(id)&&!$(id).classList.contains("hidden")){closeModal(id);e.preventDefault();return;}}if($("sidebarMenu")?.classList.contains("active")){closeSB();e.preventDefault();}}});

// === INIT ===
renderGenres();renderMovSrc();renderSeasons();

onAuthStateChanged(auth,async user=>{if(user){curUid=user.uid;resetProfUI();closeModal("authOverlay");clearAuth();isAdm=user.email.toLowerCase()===ADMIN_EMAIL.toLowerCase();["profileAdminBadge","sidebarAdminItem","sidebarCreatorItem","sidebarSuggestionsAdminItem","sidebarStorageItem"].forEach(id=>$(id)?.classList.toggle("hidden",!isAdm));await loadProfile(user);await regDev(user);await Promise.all([loadCatalog(),loadViews()]);}else{stopHB();curUid=null;isAdm=false;resetProfUI();document.documentElement.style.setProperty("--primary","#e50914");openModal("authOverlay");clearAuth();["sidebarAdminItem","sidebarCreatorItem","sidebarSuggestionsAdminItem","sidebarStorageItem","profileAdminBadge"].forEach(id=>$(id)?.classList.add("hidden"));signUpMode=false;updateAuthMode();}});
