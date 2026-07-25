import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const ADMIN_EMAIL = "raiyuri.freefire@gmail.com";
const GENRES = ["Ação","Aventura","Comédia","Drama","Terror","Suspense","Romance","Ficção Científica","Fantasia","Animação","Documentário","Musical","Guerra","Mistério","Crime","Família","Histórico","Faroeste"];
const CONTINUE_TTL = 7 * 24 * 60 * 60 * 1000;
const RTDB_LIMIT = 1073741824;

const FB_CFG = {
    apiKey: "AIzaSyCGD9DZDFp0w9baW8jiqgGGfkasAvqreY0",
    authDomain: "site-ec6fd.firebaseapp.com",
    databaseURL: "https://site-ec6fd-default-rtdb.firebaseio.com",
    projectId: "site-ec6fd",
    storageBucket: "site-ec6fd.firebasestorage.app",
    messagingSenderId: "338689686380",
    appId: "1:338689686380:web:509aebb8d64694a0e1d149"
};

const fbApp = initializeApp(FB_CFG);
const auth  = getAuth(fbApp);
const db    = getDatabase(fbApp);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ═══════════════════════════════════════════════════════════════
// ADAPTADORES DE VÍDEO
// Cada adaptador define:
//  • name      — nome exibido
//  • color     — cor de destaque
//  • icon      — emoji
//  • timeout   — ms até ocultar o loading (iframes não disparam 'load' sempre)
//  • sandbox   — string do atributo sandbox (null = SEM sandbox)
//  • fix(url)  — normaliza/transforma a URL em embed
//  • isVideo   — true → cria <video>, false → cria <iframe>
// ═══════════════════════════════════════════════════════════════
const ADAPTERS = {

    /* ── MixDrop ─────────────────────────────────────────────── */
    mixdrop: {
        name:'MixDrop', color:'#00c6ff', icon:'🎬', timeout:18000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/mixdrop\.[a-z]+\/(?:f\/|e\/)?([a-zA-Z0-9]+)/i);
            return m ? `https://mixdrop.ag/e/${m[1]}` : u.replace('/f/','/e/');
        }
    },

    /* ── StreamTape ──────────────────────────────────────────── */
    streamtape: {
        name:'StreamTape', color:'#f5a623', icon:'📼', timeout:18000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/streamtape\.[a-z]+\/(?:v|e)\/([a-zA-Z0-9]+)/i);
            return m ? `https://streamtape.com/e/${m[1]}` : u.replace('/v/','/e/');
        }
    },

    /* ── FileMoon ────────────────────────────────────────────── */
    filemoon: {
        name:'FileMoon', color:'#8e44ad', icon:'🌙', timeout:22000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/filemoon\.[a-z]+\/(?:d\/|e\/)?([a-zA-Z0-9]+)/i);
            return m ? `https://filemoon.sx/e/${m[1]}` : u;
        }
    },

    /* ── VOE ─────────────────────────────────────────────────── */
    voe: {
        name:'VOE', color:'#ff4757', icon:'⚡', timeout:22000, sandbox:null,
        fix(u){ return u.trim(); }
    },

    /* ── DoodStream ──────────────────────────────────────────── */
    doodstream: {
        name:'DoodStream', color:'#f39c12', icon:'🔥', timeout:28000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/(?:dood[a-z0-9]*\.[a-z]+)\/(?:d\/|e\/)?([a-zA-Z0-9]+)/i);
            if(m){
                const dm = u.match(/(https?:\/\/[^/]+)/);
                return `${dm?.[1]||'https://dood.li'}/e/${m[1]}`;
            }
            return u.replace('/d/','/e/');
        }
    },

    /* ── Mp4Upload ───────────────────────────────────────────── */
    mp4upload: {
        name:'Mp4Upload', color:'#3498db', icon:'📤', timeout:18000,
        sandbox:'allow-scripts allow-same-origin allow-presentation allow-forms allow-popups',
        fix(u){
            u = u.trim();
            const m = u.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9]+)/i);
            return m ? `https://www.mp4upload.com/embed-${m[1]}.html` : u;
        }
    },

    /* ── OK.ru ───────────────────────────────────────────────── */
    okru: {
        name:'OK.ru', color:'#ee8208', icon:'📡', timeout:18000,
        sandbox:'allow-scripts allow-same-origin allow-presentation allow-forms',
        fix(u){
            u = u.trim();
            const m = u.match(/ok\.ru\/(?:video|videoembed)\/(\d+)/i);
            return m ? `https://ok.ru/videoembed/${m[1]}` : u;
        }
    },

    /* ── Google Drive ────────────────────────────────────────── */
    drive: {
        name:'Google Drive', color:'#4285f4', icon:'💾', timeout:18000,
        sandbox:'allow-scripts allow-same-origin allow-presentation',
        fix(u){
            u = u.trim();
            const m1 = u.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if(m1) return `https://drive.google.com/file/d/${m1[1]}/preview`;
            const m2 = u.match(/id=([a-zA-Z0-9_-]+)/);
            if(m2) return `https://drive.google.com/file/d/${m2[1]}/preview`;
            return u;
        }
    },

    /* ── YourUpload ──────────────────────────────────────────── */
    yourupload: {
        name:'YourUpload', color:'#27ae60', icon:'⬆️', timeout:18000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/yourupload\.com\/(?:watch|embed)\/([a-zA-Z0-9]+)/i);
            return m ? `https://www.yourupload.com/embed/${m[1]}` : u;
        }
    },

    /* ── YouTube ─────────────────────────────────────────────── */
    youtube: {
        name:'YouTube', color:'#ff0000', icon:'▶️', timeout:12000,
        sandbox:'allow-scripts allow-same-origin allow-presentation allow-popups',
        fix(u){
            u = u.trim();
            const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
            return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1` : u;
        }
    },

    /* ── Vimeo ───────────────────────────────────────────────── */
    vimeo: {
        name:'Vimeo', color:'#17d5ff', icon:'🎥', timeout:12000,
        sandbox:'allow-scripts allow-same-origin allow-presentation',
        fix(u){
            u = u.trim();
            const m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
            return m ? `https://player.vimeo.com/video/${m[1]}?autoplay=1&color=e50914` : u;
        }
    },

    /* ── SuperFlix ───────────────────────────────────────────── */
    superflix: {
        name:'SuperFlix', color:'#e91e63', icon:'🌟', timeout:20000, sandbox:null,
        fix(u){ return u.trim(); }
    },

    /* ── EmbedPlayer ─────────────────────────────────────────── */
    embedplayer: {
        name:'EmbedPlayer', color:'#009688', icon:'📺', timeout:20000, sandbox:null,
        fix(u){ return u.trim(); }
    },

    /* ── WarezCDN ────────────────────────────────────────────── */
    warezcdn: {
        name:'WarezCDN', color:'#673ab7', icon:'🔮', timeout:20000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/warezcdn\.[a-z]+\/(?:embed\/(?:video\/)?)?([a-zA-Z0-9]+)/i);
            return m ? `https://embed.warezcdn.link/filme/${m[1]}` : u;
        }
    },

    /* ── StreamSB ────────────────────────────────────────────── */
    streamsb: {
        name:'StreamSB', color:'#00bcd4', icon:'📡', timeout:20000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/(?:streamsb|sbplay|sblongvu)\.[a-z]+\/(?:e\/|embed\/)?([a-zA-Z0-9]+)/i);
            return m ? `https://streamsb.net/e/${m[1]}.html` : u;
        }
    },

    /* ── Upstream ────────────────────────────────────────────── */
    upstream: {
        name:'Upstream', color:'#ff6b35', icon:'🚀', timeout:20000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/upstream\.[a-z]+\/(?:e\/)?([a-zA-Z0-9]+)/i);
            return m ? `https://upstream.to/e/${m[1]}` : u;
        }
    },

    /* ── Vidoza ──────────────────────────────────────────────── */
    vidoza: {
        name:'Vidoza', color:'#ffd700', icon:'🎞️', timeout:20000, sandbox:null,
        fix(u){
            u = u.trim();
            const m = u.match(/vidoza\.[a-z]+\/(?:embed-)?([a-zA-Z0-9]+)/i);
            return m ? `https://vidoza.net/embed-${m[1]}.html` : u;
        }
    },

    /* ── Direto (mp4 / m3u8 / webm) ─────────────────────────── */
    direct: {
        name:'Vídeo Direto', color:'#46d369', icon:'📹', timeout:30000,
        sandbox:null, isVideo:true,
        fix(u){ return u.trim(); }
    },

    /* ── Embed Genérico (iframe SEM sandbox) ─────────────────── */
    embed: {
        name:'Embed', color:'#888', icon:'🔗', timeout:22000, sandbox:null,
        fix(u){ return u.trim(); }
    }
};

function getAd(type){ return ADAPTERS[type] || ADAPTERS.embed; }

function detectType(url){
    if(!url) return 'embed';
    const u = url.toLowerCase();
    if(u.includes('mixdrop'))                           return 'mixdrop';
    if(u.includes('streamtape'))                        return 'streamtape';
    if(u.includes('filemoon'))                          return 'filemoon';
    if(u.includes('voe.sx')||u.includes('voe.'))        return 'voe';
    if(u.includes('dood')||u.includes('d0000d'))        return 'doodstream';
    if(u.includes('mp4upload'))                         return 'mp4upload';
    if(u.includes('ok.ru'))                             return 'okru';
    if(u.includes('drive.google'))                      return 'drive';
    if(u.includes('yourupload'))                        return 'yourupload';
    if(u.includes('youtube.com')||u.includes('youtu.be')) return 'youtube';
    if(u.includes('vimeo.com'))                         return 'vimeo';
    if(u.includes('superflix'))                         return 'superflix';
    if(u.includes('warezcdn'))                          return 'warezcdn';
    if(u.includes('streamsb')||u.includes('sbplay'))    return 'streamsb';
    if(u.includes('upstream.to'))                       return 'upstream';
    if(u.includes('vidoza'))                            return 'vidoza';
    if(/\.(mp4|m3u8|webm|mkv)(\?|$)/i.test(u))        return 'direct';
    return 'embed';
}

/* cria o elemento de mídia (iframe ou video) */
function makeMediaEl(ad, finalUrl){
    if(ad.isVideo){
        const v = document.createElement('video');
        v.src = finalUrl;
        v.controls = true;
        v.autoplay  = true;
        v.playsInline = true;
        v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000;object-fit:contain;border:0';
        return v;
    }
    const f = document.createElement('iframe');
    f.src = finalUrl;
    f.allowFullscreen = true;
    f.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope');
    f.setAttribute('scrolling','no');
    f.setAttribute('frameborder','0');
    f.setAttribute('referrerpolicy','no-referrer');
    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000;border:0;display:block';
    if(ad.sandbox) f.setAttribute('sandbox', ad.sandbox);
    // sem sandbox → não seta o atributo → iframe tem acesso total ao player
    return f;
}

function normSources(item){
    if(Array.isArray(item.videoSources)&&item.videoSources.length) return item.videoSources;
    if(item.videoUrl?.trim()){
        const t = detectType(item.videoUrl);
        return [{type:t, label:getAd(t).name, url:item.videoUrl.trim()}];
    }
    return [];
}
function normEpSources(ep){
    if(Array.isArray(ep.videoSources)&&ep.videoSources.length) return ep.videoSources;
    if(ep.videoUrl?.trim()){
        const t = detectType(ep.videoUrl);
        return [{type:t, label:getAd(t).name, url:ep.videoUrl.trim()}];
    }
    return [];
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let catalog=[], activeItem=null, selCat='Todos', isSignUp=false;
let selGenres=[], cropperInst=null, cropTarget=null, prevModal=null;
let isAdmin=false, authBusy=false, uid_=null;
let sugSelMode=false, sugSelected=new Set(), allSugs=[];

let crData = { type:'movie', movieSources:[], seasons:[] };
let uiOpenS = new Set(), uiOpenE = new Set();

const PS = {                  // player state
    open:false, sources:[], idx:0,
    mainTitle:'', subTitle:'',
    ctrlTimer:null, errTimer:null,
    audioCtx:null, gainNode:null,
    boosted:new WeakSet(), boostInt:null,
    gain:160                  // 160% automático, invisível
};

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
const uid  = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const $    = id => document.getElementById(id);
const isTV = ()=> /smarttv|googletv|appletv|hbbtv|tizen|webos|crkey|netcast|viera|roku|firetv|philipstv/i.test(navigator.userAgent)||(window.innerWidth>=1920&&!('ontouchstart' in window));

(()=>{ if(isTV()) document.body.classList.add('tv'); window.addEventListener('resize',()=>document.body.classList.toggle('tv',isTV())); })();

function openM(id){ $(id)?.classList.remove('hidden'); document.body.classList.add('no-scroll'); }
function closeM(id){ $(id)?.classList.add('hidden'); document.body.classList.remove('no-scroll'); }
function normTxt(t){ return t?t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim():''; }
function getPost(i){ return i.coverUrl||i.backdropUrl||''; }
function getBd(i)  { return i.backdropUrl||i.coverUrl||''; }
function genres(i) { return Array.isArray(i.genres)&&i.genres.length?i.genres:i.category?[i.category]:[]; }
function matchCat(i,c){ if(c==='Todos')return true; if(c==='Filmes')return i.type==='movie'; if(c==='Séries')return i.type==='serie'; return genres(i).includes(c); }
function showMsg(txt,type){
    const m=$('msg'); if(!m)return;
    m.textContent=txt;
    m.className=type==='success'?'msg-ok':type==='info'?'msg-info':'msg-err';
    m.classList.remove('hidden');
    clearTimeout(m._t); m._t=setTimeout(()=>m.classList.add('hidden'),4000);
}
function validImg(u){ if(!u)return false; if(u.includes(location.origin)&&!u.startsWith('data:'))return false; return u.startsWith('http')||u.startsWith('data:image'); }
function fmtBytes(b){ if(!b)return'0 B'; const k=1024,s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(k)); return parseFloat((b/Math.pow(k,i)).toFixed(2))+' '+s[i]; }
function estBytes(o){ try{return new Blob([JSON.stringify(o)]).size;}catch{return JSON.stringify(o).length*2;} }
function ago(ts){ const d=Date.now()-ts,m=Math.floor(d/60000); if(m<1)return'agora'; if(m<60)return m+'m'; const h=Math.floor(m/60); return h<24?h+'h':Math.floor(h/24)+'d'; }
function authErr(c){ return({'auth/email-already-in-use':'E-mail já cadastrado!','auth/invalid-email':'E-mail inválido.','auth/weak-password':'Senha fraca (mín 6).','auth/user-not-found':'Conta não encontrada.','auth/wrong-password':'Senha incorreta.','auth/invalid-credential':'E-mail ou senha incorretos.','auth/too-many-requests':'Muitas tentativas.','auth/network-request-failed':'Sem internet.'})[c]||`Erro: ${c}`; }

// ── cache ──────────────────────────────────────────────────────
const cKey = k => uid_?`mfx_${uid_}_${k}`:null;
const setC  = (k,v)=>{ const key=cKey(k); if(key&&v) localStorage.setItem(key,v); };
const getC  = k=>{ const key=cKey(k); return key?localStorage.getItem(key):null; };
function clearLegacy(){ ['masterflix_user_name','masterflix_user_bio','masterflix_user_fav_genre','masterflix_user_avatar','masterflix_user_banner'].forEach(k=>localStorage.removeItem(k)); }

// ── theme ──────────────────────────────────────────────────────
function hexRgba(h,a){ const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }
function applyTheme(c){
    if(!c||isTV()) return;
    document.documentElement.style.setProperty('--primary',c);
    document.documentElement.style.setProperty('--primary-glow',hexRgba(c,.35));
    localStorage.setItem('mfx_theme',c);
    if(uid_) setC('theme',c);
}
const savedTheme=localStorage.getItem('mfx_theme');
if(savedTheme&&!isTV()) applyTheme(savedTheme);

window.addEventListener('scroll',()=>{ $('header')?.classList.toggle('scrolled',scrollY>50); });

// ═══════════════════════════════════════════════════════════════
// AUDIO BOOST — invisível, automático
// ═══════════════════════════════════════════════════════════════
function initAudio(){
    if(PS.audioCtx) return;
    try{
        PS.audioCtx = new (window.AudioContext||window.webkitAudioContext)();
        PS.gainNode = PS.audioCtx.createGain();
        PS.gainNode.connect(PS.audioCtx.destination);
        PS.gainNode.gain.value = PS.gain/100;
    }catch(e){ console.warn('AudioCtx:',e); }
}
function boostEl(el){
    if(!PS.audioCtx||!PS.gainNode||PS.boosted.has(el)) return;
    try{ PS.audioCtx.createMediaElementSource(el).connect(PS.gainNode); PS.boosted.add(el); }catch{}
}
function scanBoost(){
    if(!PS.audioCtx||!PS.open) return;
    document.querySelectorAll('#pVideo video,#pVideo audio').forEach(boostEl);
    try{ const f=document.querySelector('#pVideo iframe'); if(f?.contentDocument) f.contentDocument.querySelectorAll('video,audio').forEach(boostEl); }catch{}
}
function startBoost(){ stopBoost(); PS.boostInt=setInterval(scanBoost,3000); }
function stopBoost(){ if(PS.boostInt){clearInterval(PS.boostInt);PS.boostInt=null;} }

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════
const openSB  = ()=>{ $('sidebar')?.classList.add('on'); $('sbOverlay')?.classList.add('on'); $('menuBtn')?.classList.add('active'); document.body.classList.add('no-scroll'); };
const closeSB = ()=>{ $('sidebar')?.classList.remove('on'); $('sbOverlay')?.classList.remove('on'); $('menuBtn')?.classList.remove('active'); document.body.classList.remove('no-scroll'); };

$('menuBtn')?.addEventListener('click',()=> $('sidebar')?.classList.contains('on')?closeSB():openSB());
$('sbClose')?.addEventListener('click',closeSB);
$('sbOverlay')?.addEventListener('click',closeSB);
$('brandBtn')?.addEventListener('click',()=>{ selCat='Todos'; updateCats(); renderApp(); scrollTo({top:0,behavior:'smooth'}); });

document.querySelectorAll('.sb-item').forEach(it=>{
    it.addEventListener('click',()=>{
        const a=it.dataset.nav;
        document.querySelectorAll('.sb-item').forEach(x=>x.classList.remove('active'));
        if(['home','movies','series','continue'].includes(a)) it.classList.add('active');
        closeSB();
        if(a==='home'){ selCat='Todos'; updateCats(); renderApp(); scrollTo({top:0,behavior:'smooth'}); }
        else if(a==='movies'){ selCat='Filmes'; updateCats(); renderApp(); scrollTo({top:300,behavior:'smooth'}); }
        else if(a==='series'){ selCat='Séries'; updateCats(); renderApp(); scrollTo({top:300,behavior:'smooth'}); }
        else if(a==='continue'){ const r=$('continueRow'); if(r&&!r.classList.contains('hidden')) r.scrollIntoView({behavior:'smooth'}); else showMsg('Nada em andamento!','error'); }
        else if(a==='suggestions') openM('sugModal');
        else if(a==='profile')  openM('profileModal');
        else if(a==='admin'){   renderAdminList(); openM('adminModal'); }
        else if(a==='creator')  openCreator();
        else if(a==='sugAdmin'){ loadSugAdmin(); openM('sugAdminModal'); }
        else if(a==='storage'){ loadStorage(); openM('storageModal'); }
        else if(a==='logout'){ if(confirm('Sair da conta?')) doLogout(); }
    });
});

function updateCats(){ document.querySelectorAll('.cat').forEach(c=>c.classList.toggle('on',c.dataset.cat===selCat)); }
document.querySelectorAll('.cat').forEach(c=>{ c.addEventListener('click',()=>{ selCat=c.dataset.cat; updateCats(); renderApp(); }); });

// ═══════════════════════════════════════════════════════════════
// GENRE SELECTOR
// ═══════════════════════════════════════════════════════════════
function renderGenres(){
    const box=$('genreBox'); if(!box) return;
    box.innerHTML='';
    GENRES.forEach(g=>{
        const t=document.createElement('div');
        t.className='g-tag'+(selGenres.includes(g)?' sel':'');
        t.textContent=g;
        t.addEventListener('click',()=>{ const i=selGenres.indexOf(g); i>=0?selGenres.splice(i,1):selGenres.push(g); renderGenres(); });
        box.appendChild(t);
    });
    const ct=$('gCount'); if(!ct) return;
    ct.textContent=selGenres.length?`✓ ${selGenres.length}: ${selGenres.join(', ')}`:'⚠️ Selecione ao menos 1 gênero';
    ct.style.color=selGenres.length?'var(--primary)':'var(--warn)';
}

// ═══════════════════════════════════════════════════════════════
// CREATOR TABS
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.cr-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
        syncCr();
        document.querySelectorAll('.cr-tab').forEach(t=>t.classList.remove('on'));
        document.querySelectorAll('.cr-tc').forEach(c=>c.classList.remove('on'));
        tab.classList.add('on');
        document.querySelector(`[data-tc="${tab.dataset.tab}"]`)?.classList.add('on');
    });
});

// ═══════════════════════════════════════════════════════════════
// CREATOR — MOVIE SOURCES
// ═══════════════════════════════════════════════════════════════
function renderMovieSrc(){
    const box=$('mSrcList'); if(!box) return;
    box.innerHTML='';
    if(!crData.movieSources.length){
        box.innerHTML='<div class="src-empty">Nenhuma fonte. Clique em <strong>+ Adicionar Fonte</strong>.</div>';
        return;
    }
    const tmpl=$('srcTmpl');
    crData.movieSources.forEach((src,idx)=>{
        const cl=tmpl.content.cloneNode(true);
        const card=cl.querySelector('.src-card');
        card.querySelector('.src-badge').textContent=`Fonte ${idx+1}`;
        const ts=card.querySelector('.src-type'); ts.value=src.type||'';
        const tl=card.querySelector('.src-label'); tl.value=src.label||'';
        const tu=card.querySelector('.src-url');   tu.value=src.url||'';

        // disable already-used types
        const used=crData.movieSources.filter((_,i)=>i!==idx).map(s=>s.type).filter(Boolean);
        Array.from(ts.options).forEach(o=>{ if(o.value&&o.value!=='embed'&&o.value!==src.type&&used.includes(o.value)){o.disabled=true; if(!o.text.includes('✓'))o.text+=' ✓';} });

        ts.addEventListener('change',()=>{
            const nt=ts.value;
            if(nt&&nt!=='embed'&&crData.movieSources.some((s,i)=>i!==idx&&s.type===nt)){showMsg(`Já existe fonte "${getAd(nt).name}"!`,'error');ts.value=src.type||'';return;}
            crData.movieSources[idx].type=nt;
            if(!crData.movieSources[idx].label&&nt) crData.movieSources[idx].label=getAd(nt).name;
            renderMovieSrc();
        });
        tl.addEventListener('input',()=>{ crData.movieSources[idx].label=tl.value; });
        tu.addEventListener('input',()=>{
            crData.movieSources[idx].url=tu.value;
            if(!crData.movieSources[idx].type&&tu.value){
                const d=detectType(tu.value);
                if(!crData.movieSources.some((s,i)=>i!==idx&&s.type===d)){
                    crData.movieSources[idx].type=d;
                    if(!crData.movieSources[idx].label) crData.movieSources[idx].label=getAd(d).name;
                    renderMovieSrc();
                }
            }
        });
        card.querySelector('[data-action="rm-src"]').addEventListener('click',()=>{ crData.movieSources.splice(idx,1); renderMovieSrc(); });
        box.appendChild(card);
    });
}

$('addMovieSrc')?.addEventListener('click',()=>{ crData.movieSources.push({id:uid(),type:'',label:'',url:''}); renderMovieSrc(); });

// ═══════════════════════════════════════════════════════════════
// CREATOR — SYNC inputs → state
// ═══════════════════════════════════════════════════════════════
function syncCr(){
    if(crData.type!=='serie') return;
    crData.seasons.forEach(s=>{
        (s.episodes||[]).forEach(ep=>{
            const te=document.querySelector(`[data-et="${ep.id}"]`);
            const de=document.querySelector(`[data-ed="${ep.id}"]`);
            if(te) ep.title=te.value;
            if(de) ep.duration=de.value;
            (ep.sources||[]).forEach(src=>{
                const st=document.querySelector(`[data-st="${src.id}"]`);
                const sl=document.querySelector(`[data-sl="${src.id}"]`);
                const su=document.querySelector(`[data-su="${src.id}"]`);
                if(st) src.type=st.value;
                if(sl) src.label=sl.value;
                if(su) src.url=su.value;
            });
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// CREATOR — SEASONS
// ═══════════════════════════════════════════════════════════════
function renderSeasons(){
    const box=$('seasonsList'); if(!box) return;
    box.innerHTML='';
    if(!crData.seasons.length){
        box.innerHTML='<div class="empty-state"><span class="e-ico">📺</span>Nenhuma temporada. Adicione a primeira!</div>';
        return;
    }
    crData.seasons.forEach((s,si)=>{
        const open=uiOpenS.has(s.id);
        const epc=(s.episodes||[]).length;
        const hasC=(s.episodes||[]).some(ep=>ep.sources?.some(x=>x.url?.trim()));
        const acc=document.createElement('div');
        acc.className='s-acc'+(open?' open':'');
        acc.innerHTML=`
        <div class="s-head" data-sh="${s.id}">
          <div class="s-head-left">
            <div class="s-toggle">▶</div>
            <div><div class="s-title">Temporada ${si+1}</div>
            <div class="s-sub">${epc} episódio(s)${hasC?' • <span style="color:var(--green)">✓ com fontes</span>':''}</div></div>
          </div>
          <div class="s-actions"><button type="button" class="s-mini danger" data-rs="${s.id}">🗑️</button></div>
        </div>
        <div class="s-body">
          <div class="ig">
            <label>🖼️ Foto da Temporada</label>
            <label class="fu-box" style="cursor:pointer" data-scb="${s.id}">
              <span class="fu-label">📁 Escolher</span>
              <input type="file" id="sci_${s.id}" accept="image/*" class="hidden">
              <img id="scp_${s.id}" src="${s.seasonCoverUrl||''}" class="fu-prev${s.seasonCoverUrl?'':' hidden'}" data-sc="${s.id}">
            </label>
          </div>
          <label style="font-size:11px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:block">🎬 Episódios</label>
          <div data-el="${s.id}"></div>
          <button type="button" class="add-block" data-ae="${s.id}" style="margin-top:10px">+ Novo Episódio</button>
        </div>`;
        box.appendChild(acc);
        renderEps(s);

        // toggle
        acc.querySelector(`[data-sh="${s.id}"]`).addEventListener('click',e=>{
            if(e.target.closest('button')) return;
            syncCr();
            uiOpenS.has(s.id)?uiOpenS.delete(s.id):uiOpenS.add(s.id);
            renderSeasons();
        });
        // remove season
        acc.querySelector(`[data-rs="${s.id}"]`).addEventListener('click',e=>{
            e.stopPropagation();
            if(!confirm('Remover temporada e episódios?')) return;
            crData.seasons.splice(crData.seasons.findIndex(x=>x.id===s.id),1);
            uiOpenS.delete(s.id); renderSeasons();
        });
        // add episode
        acc.querySelector(`[data-ae="${s.id}"]`).addEventListener('click',()=>{
            syncCr();
            const n=(s.episodes?.length||0)+1;
            const ep={id:uid(),title:`Episódio ${n}`,duration:'45m',thumbUrl:'',sources:[]};
            s.episodes=s.episodes||[]; s.episodes.push(ep);
            uiOpenE.add(ep.id); renderSeasons();
        });
        // season cover
        const coverLbl=acc.querySelector(`[data-scb="${s.id}"]`);
        const coverInp=acc.querySelector(`#sci_${s.id}`);
        coverLbl.addEventListener('click',()=>coverInp.click());
        coverInp.addEventListener('change',e=>{
            const f=e.target.files[0]; if(!f) return;
            const rd=new FileReader();
            rd.onload=ev=>{ const img=$(`scp_${s.id}`); if(img){img.src=ev.target.result;img.classList.remove('hidden');s.seasonCoverUrl=ev.target.result;} };
            rd.readAsDataURL(f);
        });
    });
}

function renderEps(season){
    const box=document.querySelector(`[data-el="${season.id}"]`); if(!box) return;
    box.innerHTML='';
    const eps=season.episodes||[];
    if(!eps.length){ box.innerHTML='<div class="empty-state" style="padding:14px;font-size:11px"><span class="e-ico" style="font-size:22px">🎬</span>Nenhum episódio</div>'; return; }

    eps.forEach((ep,ei)=>{
        const open=uiOpenE.has(ep.id);
        const hasS=ep.sources?.some(s=>s.url?.trim());
        const sc=ep.sources?.filter(s=>s.url?.trim()).length||0;
        const acc=document.createElement('div');
        acc.className='e-acc'+(open?' open':'');
        acc.innerHTML=`
        <div class="e-head" data-eh="${ep.id}">
          <div class="e-head-left">
            <span class="ep-num">${ei+1}</span>
            <div class="ep-mini">
              <div class="ep-mini-t">${ep.title||`Episódio ${ei+1}`}</div>
              <div class="ep-mini-s">
                ${ep.duration?'⏱️ '+ep.duration:''}
                ${hasS?`<span class="ok">✓ ${sc} fonte(s)</span>`:'<span class="warn">⚠ sem fonte</span>'}
              </div>
            </div>
          </div>
          <div class="e-actions">
            <button type="button" class="s-mini danger" data-re="${season.id}|${ep.id}">🗑️</button>
            <span class="e-toggle">▶</span>
          </div>
        </div>
        <div class="e-body">
          <div class="ig"><label>Título</label><input type="text" data-et="${ep.id}" value="${(ep.title||'').replace(/"/g,'&quot;')}" autocomplete="off"></div>
          <div class="ig"><label>Duração</label><input type="text" data-ed="${ep.id}" value="${(ep.duration||'').replace(/"/g,'&quot;')}" placeholder="45m" autocomplete="off"></div>
          <div class="ig">
            <label>🖼️ Thumbnail</label>
            <label class="fu-box" style="cursor:pointer" data-etb="${ep.id}">
              <span class="fu-label">📸 Escolher</span>
              <input type="file" id="eti_${ep.id}" accept="image/*" class="hidden">
              <img id="etp_${ep.id}" src="${ep.thumbUrl||''}" class="fu-prev${ep.thumbUrl?'':' hidden'}" data-epth="${ep.id}">
            </label>
          </div>
          <div class="ig">
            <label style="font-size:11px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.5px">🎞️ Fontes</label>
            <div data-es="${ep.id}"></div>
            <button type="button" class="add-block" data-as="${ep.id}" style="margin-top:10px;font-size:11px;padding:10px">+ Fonte</button>
          </div>
        </div>`;
        box.appendChild(acc);
        renderEpSrc(ep);

        acc.querySelector(`[data-eh="${ep.id}"]`).addEventListener('click',e=>{
            if(e.target.closest('button')) return;
            syncCr();
            uiOpenE.has(ep.id)?uiOpenE.delete(ep.id):uiOpenE.add(ep.id);
            renderSeasons();
        });
        acc.querySelector(`[data-re="${season.id}|${ep.id}"]`).addEventListener('click',e=>{
            e.stopPropagation();
            if(!confirm('Remover episódio?')) return;
            const i=season.episodes.findIndex(x=>x.id===ep.id);
            if(i>=0){ season.episodes.splice(i,1); uiOpenE.delete(ep.id); renderSeasons(); }
        });
        acc.querySelector(`[data-as="${ep.id}"]`).addEventListener('click',()=>{
            syncCr(); ep.sources=ep.sources||[];
            ep.sources.push({id:uid(),type:'',label:'',url:''}); renderSeasons();
        });
        // thumb
        const tb=acc.querySelector(`[data-etb="${ep.id}"]`);
        const ti=acc.querySelector(`#eti_${ep.id}`);
        tb.addEventListener('click',()=>ti.click());
        ti.addEventListener('change',e=>{
            const f=e.target.files[0]; if(!f) return;
            const rd=new FileReader();
            rd.onload=ev=>{ const img=$(`etp_${ep.id}`); if(img){img.src=ev.target.result;img.classList.remove('hidden');ep.thumbUrl=ev.target.result;} };
            rd.readAsDataURL(f);
        });
        // live title/dur
        acc.querySelector(`[data-et="${ep.id}"]`)?.addEventListener('input',e=>{ ep.title=e.target.value; });
        acc.querySelector(`[data-ed="${ep.id}"]`)?.addEventListener('input',e=>{ ep.duration=e.target.value; });
    });
}

function findEp(epId){ for(const s of crData.seasons){ const f=(s.episodes||[]).find(e=>e.id===epId); if(f)return f; } return null; }

function renderEpSrc(ep){
    const box=document.querySelector(`[data-es="${ep.id}"]`); if(!box) return;
    box.innerHTML='';
    const srcs=ep.sources||[];
    if(!srcs.length){ box.innerHTML='<div class="src-empty" style="font-size:11px">Sem fontes.</div>'; return; }
    const tmpl=$('srcTmpl');
    srcs.forEach((src,si)=>{
        const cl=tmpl.content.cloneNode(true);
        const card=cl.querySelector('.src-card');
        card.querySelector('.src-badge').textContent=`Fonte ${si+1}`;
        const ts=card.querySelector('.src-type'); ts.value=src.type||''; ts.setAttribute('data-st',src.id);
        const tl=card.querySelector('.src-label'); tl.value=src.label||''; tl.setAttribute('data-sl',src.id);
        const tu=card.querySelector('.src-url');   tu.value=src.url||'';   tu.setAttribute('data-su',src.id);

        const used=srcs.filter((_,i)=>i!==si).map(s=>s.type).filter(Boolean);
        Array.from(ts.options).forEach(o=>{ if(o.value&&o.value!=='embed'&&o.value!==src.type&&used.includes(o.value)) o.disabled=true; });

        ts.addEventListener('change',()=>{
            const nt=ts.value;
            if(nt&&nt!=='embed'&&srcs.some((s,i)=>i!==si&&s.type===nt)){showMsg('Tipo duplicado!','error');ts.value=src.type||'';return;}
            src.type=nt; if(!src.label&&nt) src.label=getAd(nt).name; renderEpSrc(ep);
        });
        tl.addEventListener('input',()=>{ src.label=tl.value; });
        tu.addEventListener('input',()=>{
            src.url=tu.value;
            if(!src.type&&tu.value){
                const d=detectType(tu.value);
                if(!srcs.some((s,i)=>i!==si&&s.type===d)){src.type=d;if(!src.label)src.label=getAd(d).name;renderEpSrc(ep);}
            }
        });
        card.querySelector('[data-action="rm-src"]').addEventListener('click',()=>{ srcs.splice(si,1); renderEpSrc(ep); });
        box.appendChild(card);
    });
}

$('addSeason')?.addEventListener('click',()=>{
    syncCr();
    const s={id:uid(),seasonNumber:crData.seasons.length+1,seasonCoverUrl:'',episodes:[]};
    const ep={id:uid(),title:'Episódio 1',duration:'45m',thumbUrl:'',sources:[]};
    s.episodes.push(ep); crData.seasons.push(s);
    uiOpenS.add(s.id); uiOpenE.add(ep.id); renderSeasons();
});

// ═══════════════════════════════════════════════════════════════
// CROPPER
// ═══════════════════════════════════════════════════════════════
function setupCropperFor(fileInputId, previewId, ratio){
    const inp=$(fileInputId), prev=$(previewId); if(!inp) return;
    inp.addEventListener('change',e=>{
        const file=e.target.files[0]; if(!file) return;
        const rd=new FileReader();
        rd.onload=ev=>{
            const tmp=new Image();
            tmp.onload=()=>{
                if(tmp.naturalWidth<=800&&tmp.naturalHeight<=800){
                    if(prev){prev.src=ev.target.result;prev.classList.remove('hidden');} inp.value=''; return;
                }
                cropTarget=prev;
                if(!$('profileModal')?.classList.contains('hidden')){prevModal='profileModal';closeM('profileModal');}
                else if(!$('creatorModal')?.classList.contains('hidden')){prevModal='creatorModal';closeM('creatorModal');}
                else prevModal=null;
                const ci=$('cropImg'); if(ci) ci.src=ev.target.result;
                openM('cropperModal');
                if(cropperInst){cropperInst.destroy();cropperInst=null;}
                cropperInst=new Cropper(ci,{aspectRatio:ratio||NaN,viewMode:1,autoCropArea:1,responsive:true,
                    crop(){ const cv=cropperInst.getCroppedCanvas({width:800}); if(cv){const u=cv.toDataURL('image/jpeg',.9); ['prevMob','prevPc','prevTv'].forEach(id=>{const el=$(id);if(el)el.src=u;});}
                }});
            };
            tmp.src=ev.target.result;
        };
        rd.readAsDataURL(file);
    });
}

// profile
setupCropperFor('pfPhotoFile','pfPhotoPreview',1);
setupCropperFor('pfBannerFile','pfBannerPreview',3);
// creator
setupCropperFor('mCoverFile','mCoverPrev',0.6667);
setupCropperFor('mBdFile','mBdPrev',1.7778);

$('confirmCrop')?.addEventListener('click',()=>{
    if(!cropperInst) return;
    const cv=cropperInst.getCroppedCanvas({width:1200});
    if(cv&&cropTarget){
        const d=cv.toDataURL('image/jpeg',.92);
        cropTarget.src=d; cropTarget.classList.remove('hidden');
        // update state if season/ep
        const sc=cropTarget.dataset.sc; if(sc){const s=crData.seasons.find(x=>x.id===sc);if(s)s.seasonCoverUrl=d;}
        const et=cropTarget.dataset.epth; if(et){const ep=findEp(et);if(ep)ep.thumbUrl=d;}
    }
    cropperInst?.destroy(); cropperInst=null;
    closeM('cropperModal');
    if(prevModal){openM(prevModal);prevModal=null;}
});
$('closeCropper')?.addEventListener('click',()=>{
    cropperInst?.destroy(); cropperInst=null;
    closeM('cropperModal');
    if(prevModal){openM(prevModal);prevModal=null;}
});

// ═══════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════
const sBox=$('searchBox'), sIn=$('sInput'), sDrop=$('sDrop');

$('sBtn')?.addEventListener('click',e=>{
    e.stopPropagation();
    if(sBox?.classList.contains('open')){ if(!sIn?.value.trim()) sBox.classList.remove('open'); }
    else{ sBox?.classList.add('open'); setTimeout(()=>sIn?.focus(),250); }
});
sIn?.addEventListener('input',()=>{
    const v=sIn.value.trim();
    if(v){sBox?.classList.add('has-text');renderSearch(v);}
    else{sBox?.classList.remove('has-text');sDrop?.classList.remove('visible');}
});
$('sClear')?.addEventListener('click',e=>{ e.stopPropagation(); if(sIn)sIn.value=''; sBox?.classList.remove('has-text'); sDrop?.classList.remove('visible'); sIn?.focus(); });
document.addEventListener('click',e=>{ const w=$('searchWrap'); if(w&&!w.contains(e.target)){sDrop?.classList.remove('visible');if(!sIn?.value.trim())sBox?.classList.remove('open');} });

function smartSearch(q){
    const nq=normTxt(q); if(!nq) return [];
    return catalog.map(i=>{
        const t=normTxt(i.title); if(!t) return null;
        let s=0;
        if(t===nq)s=10000; else if(t.startsWith(nq))s=1000-t.length; else if(t.includes(nq))s=100-t.length;
        else{ const mc=nq.split(' ').filter(w=>w&&t.includes(w)).length; if(mc)s=mc*20; }
        return s>0?{item:i,score:s}:null;
    }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,10).map(x=>x.item);
}
function hlMatch(t,q){ const nt=normTxt(t),nq=normTxt(q),i=nt.indexOf(nq); if(i<0)return t; return t.slice(0,i)+'<mark>'+t.slice(i,i+q.length)+'</mark>'+t.slice(i+q.length); }

function renderSearch(q){
    if(!sDrop) return;
    const res=smartSearch(q); sDrop.innerHTML='';
    if(!res.length){ sDrop.innerHTML=`<div class="sd-empty"><span class="ico">🔍</span>Nenhum resultado</div>`; }
    else{
        sDrop.innerHTML=`<div class="sd-head">🔍 ${res.length} resultado(s)</div>`;
        res.forEach(item=>{
            const d=document.createElement('div'); d.className='sd-item'; d.tabIndex=0;
            const gs=genres(item);
            d.innerHTML=`<img class="sd-thumb" src="${getPost(item)}" loading="lazy" onerror="this.style.display='none'"><div class="sd-info"><div class="sd-title">${hlMatch(item.title,q)}</div><div class="sd-meta"><span class="badge">${item.type==='movie'?'Filme':'Série'}</span>${item.year?`<span>${item.year}</span>`:''}${gs.length?`<span>${gs.slice(0,2).join(', ')}</span>`:''}</div></div>`;
            d.addEventListener('click',()=>{ sDrop.classList.remove('visible'); if(sIn)sIn.value=''; sBox?.classList.remove('has-text'); location.hash=`#/m/${item.id}`; openDetails(item); });
            d.addEventListener('keydown',e=>{ if(e.key==='Enter')d.click(); });
            sDrop.appendChild(d);
        });
    }
    sDrop.classList.add('visible');
}

// ═══════════════════════════════════════════════════════════════
// HASH ROUTING
// ═══════════════════════════════════════════════════════════════
function handleHash(){ const h=location.hash; if(h.startsWith('#/m/')){ const item=catalog.find(x=>x.id===h.slice(4)); if(item) openDetails(item); } }
window.addEventListener('hashchange',handleHash);

// ═══════════════════════════════════════════════════════════════
// MEDIA TYPE TOGGLE (Creator)
// ═══════════════════════════════════════════════════════════════
$('mType')?.addEventListener('change',e=>{
    crData.type=e.target.value;
    const movie=crData.type==='movie';
    $('movieArea')?.classList.toggle('hidden',!movie);
    $('seriesArea')?.classList.toggle('hidden',movie);
    const lbl=$('mDurLabel'); if(lbl) lbl.textContent=movie?'Duração (Ex: 2h 10m)':'Duração Média (Ex: 45m/ep)';
    if(!movie&&!crData.seasons.length){
        const s={id:uid(),seasonNumber:1,seasonCoverUrl:'',episodes:[]};
        const ep={id:uid(),title:'Episódio 1',duration:'45m',thumbUrl:'',sources:[]};
        s.episodes.push(ep); crData.seasons.push(s);
        uiOpenS.add(s.id); uiOpenE.add(ep.id); renderSeasons();
    }
});

// ═══════════════════════════════════════════════════════════════
// CATALOG / CONTINUE WATCHING
// ═══════════════════════════════════════════════════════════════
async function loadCatalog(){
    try{
        const snap=await get(ref(db,'catalog'));
        catalog=[];
        if(snap.exists()){ const d=snap.val(); for(const k in d){ const item={id:k,...d[k]}; if(!Array.isArray(item.genres)) item.genres=item.category?[item.category]:[]; catalog.push(item); } }
        renderApp(); renderAdminList(); handleHash();
    }catch(e){ showMsg('Erro ao carregar: '+e.message,'error'); }
}

function getCL(){ if(!uid_) return []; try{return JSON.parse(localStorage.getItem(`mfx_${uid_}_cl`)||'[]');}catch{return[];} }
function saveCL(l){ if(uid_) localStorage.setItem(`mfx_${uid_}_cl`,JSON.stringify(l)); }
function cleanCL(){ let l=getCL(); l=l.filter(i=>Date.now()-(i.lw||0)<CONTINUE_TTL); saveCL(l); return l; }
function saveCW(item,extra='',epInfo=null){ if(!uid_) return; let l=getCL(); l=l.filter(i=>i.id!==item.id); l.unshift({id:item.id,title:item.title,type:item.type,cover:getBd(item)||getPost(item),duration:item.duration||extra,lw:Date.now(),epInfo}); if(l.length>30)l.pop(); saveCL(l); renderContinue(); }
function rmCW(id){ saveCL(getCL().filter(i=>i.id!==id)); renderContinue(); }
function getCW(id){ return getCL().find(i=>i.id===id)||null; }

function renderContinue(){
    const row=$('continueRow'),list=$('continueList'); if(!row||!list) return;
    list.innerHTML=''; if(!uid_){row.classList.add('hidden');return;}
    let l=cleanCL();
    if(selCat==='Filmes')l=l.filter(i=>i.type==='movie');
    else if(selCat==='Séries')l=l.filter(i=>i.type==='serie');
    else if(selCat!=='Todos')l=l.filter(i=>{ const o=catalog.find(m=>m.id===i.id); return o&&genres(o).includes(selCat); });
    if(!l.length){row.classList.add('hidden');return;}
    row.classList.remove('hidden');
    l.forEach(item=>{
        const c=document.createElement('div'); c.className='cc'; c.tabIndex=0;
        const ep=item.epInfo?`<div class="cc-ep">▶ ${item.epInfo}</div>`:'';
        c.innerHTML=`<img src="${item.cover||''}" loading="lazy" onerror="this.src=''"><button type="button" class="cc-rm">✕</button><div class="cc-play">▶</div><div class="cc-info"><div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</div>${ep}<div class="cc-dur">${item.lw?'🕐 '+ago(item.lw):''}</div></div>`;
        c.querySelector('.cc-rm').addEventListener('click',e=>{e.stopPropagation();rmCW(item.id);});
        c.addEventListener('click',()=>{ const o=catalog.find(m=>m.id===item.id); if(o) openDetails(o); });
        list.appendChild(c);
    });
}

function renderApp(){
    const ml=$('moviesList'),sl=$('seriesList'),mr=$('moviesRow'),sr=$('seriesRow'); if(!ml||!sl) return;
    ml.innerHTML=''; sl.innerHTML='';
    mr.classList.toggle('hidden',selCat==='Séries');
    sr.classList.toggle('hidden',selCat==='Filmes');
    catalog.forEach(item=>{
        if(!matchCat(item,selCat)) return;
        const c=document.createElement('div'); c.className='mc'; c.tabIndex=0;
        const ps=getPost(item), gs=genres(item), tag=gs.length?gs[0]:(item.type==='movie'?'Filme':'Série');
        c.innerHTML=ps?`<img class="mc-img" src="${ps}" loading="lazy" onerror="this.style.display='none'"><div class="mc-ov"><span class="mc-tag">${tag}</span><div class="mc-name">${item.title}</div></div>`:`<div class="mc-fb">🎬</div><div class="mc-ov"><span class="mc-tag">${tag}</span><div class="mc-name">${item.title}</div></div>`;
        c.addEventListener('click',()=>{ location.hash=`#/m/${item.id}`; openDetails(item); });
        c.addEventListener('keydown',e=>{ if(e.key==='Enter')c.click(); });
        if(item.type==='movie') ml.appendChild(c); else sl.appendChild(c);
    });
    renderContinue();
    if(catalog.length&&!activeItem) setHero(catalog[Math.floor(Math.random()*Math.min(catalog.length,5))]);
}

function setHero(item){
    activeItem=item;
    $('heroTitle').textContent=item.title;
    $('heroDesc').textContent=item.description||'';
    const gs=genres(item);
    $('heroMeta').innerHTML=`<strong>${item.type==='movie'?'🎬 FILME':'📺 SÉRIE'}</strong>${item.year?` <span class="dot">•</span> ${item.year}`:''}${item.duration?` <span class="dot">•</span> ⏱️ ${item.duration}`:''}${gs.length?` <span class="dot">•</span> ${gs.slice(0,3).join(', ')}`:''}`; 
    const bd=getBd(item); if(bd) $('heroBg').style.backgroundImage=`url('${bd}')`;
    $('heroPlay').onclick=()=>{ if(item.type==='movie'){saveCW(item);initiatePlay(normSources(item),item.title,'Filme');}else openDetails(item); };
    $('heroInfo').onclick=()=>openDetails(item);
}

// ═══════════════════════════════════════════════════════════════
// DETAILS MODAL
// ═══════════════════════════════════════════════════════════════
function openDetails(item){
    activeItem=item;
    const bd=getBd(item), bg=$('detBg');
    if(bg){bg.style.backgroundImage=bd?`url('${bd}')`:'';bg.style.background=bd?'':`#1a1a1a`;}
    const ps=getPost(item),dp=$('detPoster');
    if(dp){dp.src=ps||'';dp.style.display=ps?'block':'none';}
    $('detTitle').textContent=item.title;
    $('detMeta').textContent=`${item.type==='movie'?'FILME':'SÉRIE'} • ${item.year||''}${item.duration?' • ⏱️ '+item.duration:''}`;
    const gbox=$('detGenres'); if(gbox){gbox.innerHTML='';genres(item).forEach(g=>{const b=document.createElement('span');b.style.cssText='padding:5px 14px;background:rgba(229,9,20,.12);border:1px solid rgba(229,9,20,.3);border-radius:16px;font-size:10px;font-weight:800;color:var(--primary);text-transform:uppercase';b.textContent=g;gbox.appendChild(b);});}
    $('detDesc').textContent=item.description||'';
    const ci=getCW(item.id);
    if(item.type==='movie'){
        $('detMovie')?.classList.remove('hidden'); $('detSerie')?.classList.add('hidden');
        const bp=$('playMovie');
        if(bp){bp.textContent=ci?'▶ Continuar Assistindo':'▶ Assistir Filme';bp.onclick=()=>{saveCW(item);closeM('detailsModal');initiatePlay(normSources(item),item.title,'Filme');};}
    }else{
        $('detMovie')?.classList.add('hidden'); $('detSerie')?.classList.remove('hidden');
        const tabs=$('sTabs'); if(tabs)tabs.innerHTML='';
        let rsi=0,rei=-1;
        if(ci?.epInfo){const m=ci.epInfo.match(/T(\d+)\s*E(\d+)/i);if(m){rsi=parseInt(m[1])-1;rei=parseInt(m[2])-1;}}
        (item.seasons||[]).forEach((s,idx)=>{
            const tab=document.createElement('div');
            tab.className='s-tab'+(idx===rsi?' on':''); tab.textContent=`T${idx+1}`; tab.tabIndex=0;
            tab.addEventListener('click',()=>{
                document.querySelectorAll('.s-tab').forEach(t=>t.classList.remove('on')); tab.classList.add('on');
                if(s.seasonCoverUrl?.trim()&&bg) bg.style.backgroundImage=`url('${s.seasonCoverUrl}')`;
                else if(bg) bg.style.backgroundImage=bd?`url('${bd}')`:'';
                renderEpList(s.episodes||[],idx,s,item,idx===rsi?rei:-1);
            });
            tab.addEventListener('keydown',e=>{if(e.key==='Enter')tab.click();});
            tabs?.appendChild(tab);
        });
        if(item.seasons?.length){
            const si=Math.min(rsi,item.seasons.length-1),ts=item.seasons[si];
            if(ts?.seasonCoverUrl?.trim()&&bg) bg.style.backgroundImage=`url('${ts.seasonCoverUrl}')`;
            renderEpList(ts?.episodes||[],si,ts,item,si===rsi?rei:-1);
        }
    }
    openM('detailsModal');
    const ct=$('detCt'); if(ct) ct.scrollTop=0;
}

function renderEpList(eps,si,sd,ser,rei){
    const c=$('epList'); if(!c) return; c.innerHTML='';
    const fi=sd?.seasonCoverUrl?.trim()||getBd(ser)||getPost(ser)||'';
    eps.forEach((ep,idx)=>{
        const d=document.createElement('div'); d.className='ep-card'; d.tabIndex=0;
        const th=ep.thumbUrl?.trim()||fi;
        const dur=ep.duration?`<span style="color:#888;font-size:10px;margin-left:6px">⏱️ ${ep.duration}</span>`:'';
        const lbl=`T${si+1} E${idx+1}`; const isR=idx===rei;
        d.innerHTML=`<div class="ep-thumb"><img src="${th}" loading="lazy" onerror="this.src='${fi}'"><div class="ep-play"><span>▶</span></div></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">${lbl} - ${ep.title||'Sem Título'}${dur}</div><span style="font-size:11px;color:var(--primary);font-weight:700">▶ ${isR?'Continuar':'Assistir'}</span>${isR?'<div class="ep-resume">⏳ Onde parou</div>':''}</div>`;
        if(isR){d.style.border='1.5px solid rgba(255,202,40,.35)';d.style.background='rgba(255,202,40,.04)';}
        d.addEventListener('click',()=>{ closeM('detailsModal'); saveCW(activeItem,ep.duration||'',`${lbl} - ${ep.title||''}`); initiatePlay(normEpSources(ep),activeItem.title,`${lbl} - ${ep.title||''}`); });
        d.addEventListener('keydown',e=>{if(e.key==='Enter')d.click();});
        c.appendChild(d);
    });
    if(rei>=0) setTimeout(()=>{ const cards=c.querySelectorAll('.ep-card'); if(cards[rei]) cards[rei].scrollIntoView({behavior:'smooth',block:'nearest'}); },150);
}

$('closeDetails')?.addEventListener('click',()=>{ location.hash=''; closeM('detailsModal'); });

// ═══════════════════════════════════════════════════════════════
// PLAYER — COMPLETAMENTE REFEITO
// ═══════════════════════════════════════════════════════════════
const pBox=$('pBox'), pTop=$('pTop'), pVideo=$('pVideo'), pLoad=$('pLoad');

const playerOpen=()=>!$('playerModal')?.classList.contains('hidden');

/* ── controles de visibilidade ───────────────────────────── */
function showCtrl(){
    if(!playerOpen()) return;
    pTop?.classList.remove('hide');
    clearTimeout(PS.ctrlTimer);
    PS.ctrlTimer=setTimeout(()=>{ if(playerOpen()) pTop?.classList.add('hide'); },4000);
}
pBox?.addEventListener('mousemove',showCtrl);
pBox?.addEventListener('touchstart',showCtrl,{passive:true});
pVideo?.addEventListener('click',()=>{ pTop?.classList.contains('hide')?showCtrl():pTop?.classList.add('hide'); });

/* ── fullscreen ──────────────────────────────────────────── */
async function reqFs(){
    const el=pBox; if(!el) return;
    try{
        if(el.requestFullscreen)           await el.requestFullscreen();
        else if(el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        else if(el.mozRequestFullScreen)    await el.mozRequestFullScreen();
        else if(el.msRequestFullscreen)     await el.msRequestFullscreen();
        try{ if(screen.orientation?.lock) await screen.orientation.lock('landscape'); }catch{}
    }catch(e){ console.warn('FS:',e); }
}
async function exitFs(){
    try{
        if(document.exitFullscreen)           await document.exitFullscreen();
        else if(document.webkitExitFullscreen) await document.webkitExitFullscreen();
        else if(document.mozCancelFullScreen)  await document.mozCancelFullScreen();
        else if(document.msExitFullscreen)     await document.msExitFullscreen();
        try{ if(screen.orientation?.unlock) screen.orientation.unlock(); }catch{}
    }catch{}
}
const inFs=()=>!!(document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement);
function updFsBtn(){ const b=$('pFs'); if(b) b.textContent=inFs()?'⤢':'⛶'; }
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange'].forEach(ev=>document.addEventListener(ev,()=>{updFsBtn();showCtrl();}));

$('pFs')?.addEventListener('click',async e=>{ e.stopPropagation(); inFs()?await exitFs():await reqFs(); showCtrl(); });
$('pReload')?.addEventListener('click',e=>{ e.stopPropagation(); if(PS.sources.length) playByIdx(PS.idx); showCtrl(); });
$('pSwitch')?.addEventListener('click',e=>{ e.stopPropagation(); showSrcPanel(); showCtrl(); });

/* ── source panel ────────────────────────────────────────── */
function showSrcPanel(){
    const panel=$('pSrc'),list=$('pSrcList'),sub=$('pSrcSub'); if(!panel||!list) return;
    if(sub) sub.textContent=`${PS.sources.length} fonte(s) disponível(is)`;
    list.innerHTML='';
    PS.sources.forEach((src,idx)=>{
        const ad=getAd(src.type);
        const btn=document.createElement('button');
        btn.type='button'; btn.className='p-src-btn'+(idx===PS.idx?' cur':''); btn.tabIndex=0;
        const isCur=idx===PS.idx;
        const shortUrl=src.url?(src.url.length>55?src.url.slice(0,55)+'…':src.url):'';
        btn.innerHTML=`<div class="st"><span class="sn">${ad.icon} ${src.label||ad.name}${isCur?'<span class="cur-tag">Atual</span>':''}</span><span class="sp" style="color:${ad.color}">${ad.name}</span></div><div class="su">${shortUrl}</div>`;
        btn.addEventListener('click',()=>{ hideSrcPanel(); PS.idx=idx; playByIdx(idx); });
        list.appendChild(btn);
    });
    panel.classList.remove('off'); showCtrl();
    setTimeout(()=>list.querySelector('.p-src-btn')?.focus(),100);
}
function hideSrcPanel(){ $('pSrc')?.classList.add('off'); }
$('pSrcCancel')?.addEventListener('click',()=>{ PS.sources.length&&PS.idx>=0?hideSrcPanel():closePlayer(); });

/* ── error screen ────────────────────────────────────────── */
function showErr(title,desc){
    $('pErrTitle').textContent=title; $('pErrDesc').textContent=desc;
    const b=$('pErrSwitch'); if(b) b.style.display=PS.sources.length>1?'':'none';
    $('pErr')?.classList.remove('off'); pLoad?.classList.add('off');
}
function hideErr(){ $('pErr')?.classList.add('off'); }
$('pErrSwitch')?.addEventListener('click',()=>{ hideErr(); showSrcPanel(); });
$('pErrReload')?.addEventListener('click',()=>{ hideErr(); playByIdx(PS.idx); });

/* ── clear video area ────────────────────────────────────── */
function clearVideo(){ pVideo?.querySelectorAll('iframe,video').forEach(el=>el.remove()); }

/* ── play by index — FUNÇÃO PRINCIPAL ───────────────────── */
function playByIdx(idx){
    const src=PS.sources[idx];
    if(!src?.url?.trim()){ showErr('Link inválido','A fonte não possui URL.'); return; }

    const ad   = getAd(src.type);
    const fUrl = ad.fix(src.url);
    PS.idx=idx;

    /* atualiza topbar */
    $('pTitle').textContent=PS.mainTitle||'Assistindo';
    $('pSub').textContent=PS.subTitle||'MasterFlix';
    const badge=$('pBadge');
    if(badge){
        badge.textContent=`${ad.icon} ${src.label||ad.name}`;
        badge.style.background=`${ad.color}25`;
        badge.style.borderColor=`${ad.color}60`;
        badge.classList.remove('hidden');
    }

    /* mostra loading */
    pLoad?.classList.remove('off');
    const lt=$('pLoadText'),ls=$('pLoadSub');
    if(lt) lt.textContent=`Carregando ${ad.name}...`;
    if(ls) ls.textContent=ad.sandbox?'Modo seguro (sandbox)':'Modo direto (sem sandbox)';

    hideErr(); hideSrcPanel(); clearVideo();

    /* cria elemento de mídia */
    const el=makeMediaEl(ad,fUrl);

    /* eventos de load */
    el.addEventListener('load',()=>{
        clearTimeout(PS.errTimer);
        setTimeout(()=>{
            pLoad?.classList.add('off');
            initAudio();
            if(PS.audioCtx?.state==='suspended') PS.audioCtx.resume();
            PS.gainNode && (PS.gainNode.gain.value=PS.gain/100);
            scanBoost(); startBoost();
        },600);
    });

    if(el.tagName==='VIDEO'){
        el.addEventListener('canplay',()=>{
            clearTimeout(PS.errTimer);
            pLoad?.classList.add('off');
            initAudio();
            if(PS.audioCtx?.state==='suspended') PS.audioCtx.resume();
            PS.gainNode && (PS.gainNode.gain.value=PS.gain/100);
            boostEl(el);
        });
        el.addEventListener('error',()=>showErr(`Falha em ${ad.name}`,'O arquivo não pôde ser carregado. Tente outra fonte.'));
    }

    pVideo?.appendChild(el);

    /* timeout para ocultar loading (iframes nem sempre disparam 'load') */
    clearTimeout(PS.errTimer);
    PS.errTimer=setTimeout(()=>pLoad?.classList.add('off'), ad.timeout);

    showCtrl();
}

/* ── initiatePlay — entry point ──────────────────────────── */
function initiatePlay(sources,mainTitle,subTitle){
    if(!sources?.length){showMsg('Nenhum link de vídeo!','error');return;}
    PS.sources=sources.slice(); PS.idx=0;
    PS.mainTitle=mainTitle||''; PS.subTitle=subTitle||'';
    PS.open=true;

    $('pSwitch')?.classList.toggle('hidden',sources.length<=1);

    openM('playerModal');

    if(sources.length===1){ playByIdx(0); }
    else{ pLoad?.classList.add('off'); showSrcPanel(); }
}

/* ── closePlayer ─────────────────────────────────────────── */
function closePlayer(){
    clearTimeout(PS.ctrlTimer); clearTimeout(PS.errTimer);
    stopBoost();
    if(inFs()) exitFs();
    clearVideo();
    hideErr(); hideSrcPanel();
    pLoad?.classList.remove('off');
    pTop?.classList.remove('hide');
    PS.open=false; PS.sources=[]; PS.idx=0; PS.mainTitle=''; PS.subTitle='';
    if(PS.gainNode) PS.gainNode.gain.value=1.0;
    $('pBadge')?.classList.add('hidden');
    $('pSwitch')?.classList.add('hidden');
    updFsBtn();
    closeM('playerModal');
    renderContinue();
}

$('pClose')?.addEventListener('click',e=>{ e.stopPropagation(); closePlayer(); });

/* ── keyboard ────────────────────────────────────────────── */
document.addEventListener('keydown',e=>{
    if(playerOpen()){
        if(e.key==='Escape'){ closePlayer(); return; }
        if(e.key==='f'||e.key==='F'){ e.preventDefault(); $('pFs')?.click(); }
        if(e.key==='r'||e.key==='R'){ e.preventDefault(); $('pReload')?.click(); }
        if(e.key==='c'||e.key==='C'){ e.preventDefault(); $('pSwitch')?.click(); }
        showCtrl(); return;
    }
    if(e.key==='Escape'||e.key==='GoBack'||e.keyCode===10009){
        const mods=['cropperModal','storageModal','sugAdminModal','sugModal','creatorModal','adminModal','profileModal','detailsModal','forgotOkModal','forgotModal'];
        for(const id of mods){ const m=$(id); if(m&&!m.classList.contains('hidden')){closeM(id);e.preventDefault();return;} }
        if($('sidebar')?.classList.contains('on')){closeSB();e.preventDefault();}
    }
});

// ═══════════════════════════════════════════════════════════════
// FORM SUBMIT — SAVE MEDIA
// ═══════════════════════════════════════════════════════════════
$('mediaForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); syncCr();
    if(!selGenres.length){showMsg('Selecione ao menos 1 gênero!','error');document.querySelector('.cr-tab[data-tab="info"]')?.click();return;}
    const title=$('mTitle')?.value.trim();
    if(!title){showMsg('Digite um título!','error');document.querySelector('.cr-tab[data-tab="info"]')?.click();return;}
    const editId=$('editId')?.value;
    let cv=$('mCoverPrev')?.src||'', bd=$('mBdPrev')?.src||'';
    if(!validImg(cv)&&editId){const ex=catalog.find(m=>m.id===editId);if(ex)cv=ex.coverUrl;}
    if(!validImg(bd)&&editId){const ex=catalog.find(m=>m.id===editId);if(ex)bd=ex.backdropUrl;}

    const payload={
        type:crData.type, genres:[...selGenres], category:selGenres[0], title,
        year:$('mYear')?.value.trim()||'', duration:$('mDur')?.value.trim()||'',
        description:$('mDesc')?.value.trim()||'',
        coverUrl:validImg(cv)?cv:'', backdropUrl:validImg(bd)?bd:''
    };

    if(crData.type==='movie'){
        const vs=crData.movieSources.filter(s=>s.url?.trim());
        if(!vs.length){showMsg('Adicione ao menos 1 fonte de vídeo!','error');document.querySelector('.cr-tab[data-tab="content"]')?.click();return;}
        payload.videoSources=vs.map(s=>({type:s.type||'embed',label:s.label||getAd(s.type).name||'Fonte',url:s.url.trim()}));
        payload.videoUrl=payload.videoSources[0].url;
    }else{
        const seasons=[];
        for(let si=0;si<crData.seasons.length;si++){
            const s=crData.seasons[si]; const eps=[];
            for(let ei=0;ei<(s.episodes||[]).length;ei++){
                const ep=s.episodes[ei];
                const esrcs=(ep.sources||[]).filter(src=>src.url?.trim());
                eps.push({title:ep.title?.trim()||`Episódio ${ei+1}`,duration:ep.duration?.trim()||'',thumbUrl:validImg(ep.thumbUrl)?ep.thumbUrl:'',videoSources:esrcs.map(src=>({type:src.type||'embed',label:src.label||getAd(src.type).name||'Fonte',url:src.url.trim()})),videoUrl:esrcs.length?esrcs[0].url.trim():''});
            }
            seasons.push({seasonNumber:si+1,seasonCoverUrl:validImg(s.seasonCoverUrl)?s.seasonCoverUrl:'',episodes:eps});
        }
        payload.seasons=seasons;
    }

    try{
        if(editId) await set(ref(db,'catalog/'+editId),payload);
        else await set(push(ref(db,'catalog')),payload);
        showMsg('Salvo! ✅','success'); closeM('creatorModal'); resetCreator(); await loadCatalog();
    }catch(err){ showMsg('Erro: '+err.message,'error'); }
});

$('cancelCreator')?.addEventListener('click',()=>{ if(confirm('Descartar alterações?')){closeM('creatorModal');resetCreator();} });

function resetCreator(){
    crData={type:'movie',movieSources:[],seasons:[]}; uiOpenS.clear(); uiOpenE.clear(); selGenres=[];
    $('mediaForm')?.reset(); const ei=$('editId'); if(ei)ei.value='';
    $('mCoverPrev')?.classList.add('hidden'); $('mBdPrev')?.classList.add('hidden');
    const mt=$('mType'); if(mt){mt.value='movie';mt.disabled=false;}
    $('movieArea')?.classList.remove('hidden'); $('seriesArea')?.classList.add('hidden');
    renderGenres(); renderMovieSrc(); renderSeasons();
    document.querySelector('.cr-tab[data-tab="info"]')?.click();
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════
window.editMedia=id=>{
    const item=catalog.find(m=>m.id===id); if(!item) return;
    resetCreator();
    $('editId').value=item.id;
    const mt=$('mType'); if(mt){mt.value=item.type;mt.disabled=true;}
    crData.type=item.type;
    $('movieArea')?.classList.toggle('hidden',item.type!=='movie');
    $('seriesArea')?.classList.toggle('hidden',item.type==='movie');
    selGenres=Array.isArray(item.genres)&&item.genres.length?[...item.genres]:item.category?[item.category]:[];
    renderGenres();
    $('mTitle').value=item.title||''; $('mYear').value=item.year||''; $('mDur').value=item.duration||''; $('mDesc').value=item.description||'';
    if(item.coverUrl){const i=$('mCoverPrev');if(i){i.src=item.coverUrl;i.classList.remove('hidden');}}
    if(item.backdropUrl){const i=$('mBdPrev');if(i){i.src=item.backdropUrl;i.classList.remove('hidden');}}
    $('crTitle').textContent='Editar'; $('crSub').textContent='Ajuste os dados';
    if(item.type==='movie'){
        crData.movieSources=normSources(item).map(s=>({id:uid(),...s})); renderMovieSrc();
    }else{
        crData.seasons=(item.seasons||[]).map((s,si)=>({id:uid(),seasonNumber:si+1,seasonCoverUrl:s.seasonCoverUrl||'',episodes:(s.episodes||[]).map(ep=>({id:uid(),title:ep.title||'',duration:ep.duration||'',thumbUrl:ep.thumbUrl||'',sources:normEpSources(ep).map(src=>({id:uid(),...src}))})) }));
        if(crData.seasons[0]) uiOpenS.add(crData.seasons[0].id); renderSeasons();
    }
    closeM('adminModal'); openM('creatorModal');
};
window.deleteMedia=async id=>{ if(!confirm('Apagar permanentemente?'))return; try{await remove(ref(db,'catalog/'+id));showMsg('Removido!','success');loadCatalog();}catch{showMsg('Erro','error');} };

function renderAdminList(){
    const c=$('adminList'); if(!c) return;
    const sv=normTxt($('adminSearch')?.value||''); c.innerHTML='';
    catalog.forEach(item=>{
        if(sv&&!normTxt(item.title).includes(sv)) return;
        const d=document.createElement('div'); d.className='admin-item';
        d.innerHTML=`<div><strong>${item.title}</strong><div style="font-size:10px;color:#888">${item.type==='movie'?'🎬 Filme':'📺 Série'}${item.year?' • '+item.year:''}</div></div><div style="display:flex;gap:6px"><button class="btn-s" onclick="editMedia('${item.id}')">✏️</button><button class="btn-d" onclick="deleteMedia('${item.id}')">🗑️</button></div>`;
        c.appendChild(d);
    });
}
$('adminSearch')?.addEventListener('input',renderAdminList);
$('closeAdmin')?.addEventListener('click',()=>closeM('adminModal'));
$('adminAdd')?.addEventListener('click',()=>{ closeM('adminModal'); openCreator(); });

function openCreator(){
    resetCreator(); $('crTitle').textContent='Publicar'; $('crSub').textContent='Preencha os dados abaixo'; openM('creatorModal');
}
$('closeCreator')?.addEventListener('click',()=>{ if(confirm('Fechar sem salvar?')){closeM('creatorModal');resetCreator();} });

// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS
// ═══════════════════════════════════════════════════════════════
$('closeSug')?.addEventListener('click',()=>closeM('sugModal'));
$('sendSug')?.addEventListener('click',async()=>{
    const user=auth.currentUser; if(!user) return showMsg('Faça login!','error');
    const txt=$('sugText')?.value.trim(), type=$('sugType')?.value;
    if(!txt||txt.length<5) return showMsg('Escreva mais!','error');
    try{ await set(push(ref(db,'suggestions')),{userId:user.uid,userEmail:user.email,userName:getC('name')||user.email.split('@')[0],text:txt,type,timestamp:Date.now()}); $('sugText').value=''; showMsg('Enviado! 💡','success'); closeM('sugModal'); }catch{ showMsg('Erro','error'); }
});
$('closeSugAdmin')?.addEventListener('click',()=>{ exitSelMode(); closeM('sugAdminModal'); });
async function loadSugAdmin(){
    try{
        const snap=await get(ref(db,'suggestions')); allSugs=[];
        if(snap.exists()){const d=snap.val();for(const k in d)allSugs.push({id:k,...d[k]});}
        allSugs.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
        const ct=$('sugCount'); if(ct) ct.textContent=`${allSugs.length} item(s)`;
        renderSugList();
    }catch{}
}
function renderSugList(){
    const c=$('sugAdminList'); if(!c) return; c.innerHTML='';
    if(!allSugs.length){c.innerHTML='<p style="text-align:center;color:#666;padding:30px">Nenhuma.</p>';return;}
    allSugs.forEach(s=>{
        const d=document.createElement('div'); d.className='sug-box';
        const date=s.timestamp?new Date(s.timestamp).toLocaleDateString('pt-BR'):'?';
        const cb=sugSelMode?`<input type="checkbox" class="sug-chk" data-id="${s.id}" ${sugSelected.has(s.id)?'checked':''}>`:'' ;
        const del=!sugSelMode?`<button class="btn-d" style="padding:6px 10px;font-size:11px" onclick="delSug('${s.id}')">🗑️</button>`:'';
        const badge=s.type==='bug'?'🐛 BUG':'💡 SUG';
        d.innerHTML=`<div class="sg-h"><div style="display:flex;align-items:center;gap:8px">${cb}<div><div class="sg-u">${s.userName||'?'} <span style="background:rgba(229,9,20,.15);padding:1px 6px;border-radius:4px;font-size:9px">${badge}</span></div><div class="sg-e">${s.userEmail||''}</div></div></div><div style="display:flex;align-items:center;gap:6px"><span class="sg-d">${date}</span>${del}</div></div><div class="sg-t">${s.text}</div>`;
        if(sugSelMode){const chk=d.querySelector('.sug-chk');if(chk)chk.addEventListener('change',()=>{chk.checked?sugSelected.add(s.id):sugSelected.delete(s.id);});}
        c.appendChild(d);
    });
}
function enterSelMode(){sugSelMode=true;sugSelected.clear();$('sugSelMode')?.classList.add('hidden');$('sugDelSel')?.classList.remove('hidden');$('sugSelAll')?.classList.remove('hidden');$('sugCancelSel')?.classList.remove('hidden');renderSugList();}
function exitSelMode(){sugSelMode=false;sugSelected.clear();$('sugSelMode')?.classList.remove('hidden');$('sugDelSel')?.classList.add('hidden');$('sugSelAll')?.classList.add('hidden');$('sugCancelSel')?.classList.add('hidden');renderSugList();}
$('sugSelMode')?.addEventListener('click',enterSelMode);
$('sugCancelSel')?.addEventListener('click',exitSelMode);
$('sugSelAll')?.addEventListener('click',()=>{ sugSelected.size===allSugs.length?sugSelected.clear():allSugs.forEach(s=>sugSelected.add(s.id)); renderSugList(); });
$('sugDelSel')?.addEventListener('click',async()=>{
    if(!sugSelected.size||!confirm(`Apagar ${sugSelected.size}?`))return;
    try{for(const id of sugSelected)await remove(ref(db,'suggestions/'+id));showMsg('OK!','success');exitSelMode();loadSugAdmin();}catch{}
});
window.delSug=async id=>{ if(!confirm('Apagar?'))return; try{await remove(ref(db,'suggestions/'+id));loadSugAdmin();}catch{}; };

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════
$('closeStorage')?.addEventListener('click',()=>closeM('storageModal'));
async function loadStorage(){
    const c=$('storageCt'); if(!c) return;
    c.innerHTML='<div style="text-align:center;padding:30px"><div class="p-spin" style="margin:0 auto 14px;width:40px;height:40px"></div><p style="color:#888;font-size:12px">Analisando...</p></div>';
    try{
        const [cs,us,ss]=await Promise.all([get(ref(db,'catalog')).catch(()=>null),get(ref(db,'users')).catch(()=>null),get(ref(db,'suggestions')).catch(()=>null)]);
        const cd=cs?.exists()?cs.val():{},ud=us?.exists()?us.val():{},sd=ss?.exists()?ss.val():{};
        const cb=estBytes(cd),ub=estBytes(ud),sb=estBytes(sd),tb=cb+ub+sb;
        const cc=Object.keys(cd).length,uc=Object.keys(ud).length,sc=Object.keys(sd).length;
        let mv=0,sv=0,te=0;
        Object.values(cd).forEach(i=>{if(i.type==='movie')mv++;else{sv++;(i.seasons||[]).forEach(s=>te+=(s.episodes||[]).length);}});
        const pct=Math.min(100,(tb/RTDB_LIMIT)*100),free=RTDB_LIMIT-tb;
        let bc='#46d369',st='✅ Saudável';
        if(pct>50)bc='#8bc34a'; if(pct>70){bc='#ff9800';st='⚠️ Atenção';} if(pct>85){bc='#ff5722';st='🔴 Crítico';}
        c.innerHTML=`<div style="text-align:center;margin-bottom:20px"><div style="font-size:38px;font-weight:900;color:${bc}">${pct.toFixed(1)}%</div><div style="font-size:14px;font-weight:800;margin-top:4px">${st}</div></div><div style="margin-bottom:22px"><div class="sto-outer"><div class="sto-inner" style="width:${Math.max(2,pct)}%;background:${bc}"></div></div><div class="sto-info"><span>${fmtBytes(tb)} usado</span><span>${fmtBytes(free)} livre</span></div></div><div style="display:flex;gap:10px;margin-bottom:22px"><div class="sto-card"><span class="si">🎬</span><div class="sc">${mv}</div><div class="sl">Filmes</div></div><div class="sto-card"><span class="si">📺</span><div class="sc">${sv}</div><div class="sl">Séries</div></div><div class="sto-card"><span class="si">🎞️</span><div class="sc">${te}</div><div class="sl">Episódios</div></div></div><div class="sto-det"><span class="sto-l">Catálogo (${cc})</span><span class="sto-v">${fmtBytes(cb)}</span></div><div class="sto-det"><span class="sto-l">Usuários (${uc})</span><span class="sto-v">${fmtBytes(ub)}</span></div><div class="sto-det"><span class="sto-l">Sugestões (${sc})</span><span class="sto-v">${fmtBytes(sb)}</span></div>`;
    }catch(e){c.innerHTML=`<p style="text-align:center;color:#ff5252;padding:20px">${e.message}</p>`;}
}

// ═══════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════
$('avatarBtn')?.addEventListener('click',()=>openM('profileModal'));
$('closeProfile')?.addEventListener('click',()=>closeM('profileModal'));

$('saveProfile')?.addEventListener('click',async()=>{
    const user=auth.currentUser; if(!user) return;
    const tc=$('themeColor')?.value||'#e50914';
    if(!isTV()) applyTheme(tc);
    const n=$('pfNameIn')?.value.trim()||'', b=$('pfBioIn')?.value.trim()||'';
    const fg=$('pfGenre')?.value||'Ação';
    const ph=$('pfPhotoPreview')?.src||'', bn=$('pfBannerPreview')?.src||'';
    const data={name:n,bio:b,favGenre:fg,photo:validImg(ph)?ph:'',banner:validImg(bn)?bn:'',themeColor:tc};
    try{
        await set(ref(db,'users/'+user.uid),data);
        if(n)setC('name',n); if(b)setC('bio',b); if(fg)setC('fav_genre',fg);
        if(data.photo)setC('avatar',data.photo); if(data.banner)setC('banner',data.banner);
        setC('theme',tc); updateAvatar(data); showMsg('Salvo! ✅','success'); closeM('profileModal');
    }catch(e){showMsg('Erro: '+e.message,'error');}
});

async function loadProfile(user){
    if(!user) return;
    try{
        const s=await get(ref(db,'users/'+user.uid));
        if(s.exists()){
            const d=s.val();
            if(d.name)setC('name',d.name); if(d.bio)setC('bio',d.bio); if(d.favGenre)setC('fav_genre',d.favGenre);
            if(d.photo)setC('avatar',d.photo); if(d.banner)setC('banner',d.banner); if(d.themeColor)setC('theme',d.themeColor);
            updateAvatar(d);
            if(d.themeColor&&!isTV()){applyTheme(d.themeColor);const p=$('themeColor');if(p)p.value=d.themeColor;}
        }else updateAvatar({});
    }catch{updateAvatar({});}
}

function resetPfUI(){
    const st=(id,v)=>{const el=$(id);if(el)el.textContent=v;};
    const sv=(id,v)=>{const el=$(id);if(el)el.value=v;};
    st('avatarText','U'); $('avatarImg')?.classList.add('hidden');
    st('pfAvatarText','U'); $('pfAvatarImg')?.classList.add('hidden');
    st('pfName','Usuário'); sv('pfNameIn',''); sv('pfBioIn',''); st('pfEmail','');
    const pb=$('pfBanner'); if(pb)pb.src='https://placehold.co/600x200/1e1e1e/8c8c8c?text=Banner';
    $('pfPhotoPreview')?.classList.add('hidden'); $('pfBannerPreview')?.classList.add('hidden');
    st('sbName','Usuário'); st('sbEmail','email@exemplo.com');
    const sa=$('sbAvatar'); if(sa)sa.innerHTML='<span id="sbAvatarText">U</span>';
    sv('themeColor','#e50914');
}

function updateAvatar(data={}){
    const un=data.name||getC('name')||'', ub=data.bio||getC('bio')||'', ug=data.favGenre||getC('fav_genre')||'';
    const av=data.photo||getC('avatar')||'', bn=data.banner||getC('banner')||'';
    const user=auth.currentUser;
    const letter=un?un.charAt(0).toUpperCase():user?user.email.charAt(0).toUpperCase():'U';
    const st=(id,v)=>{const el=$(id);if(el)el.textContent=v;};
    const sv=(id,v)=>{const el=$(id);if(el)el.value=v;};
    if(un){st('pfName',un);sv('pfNameIn',un);st('sbName',un);}else if(user){const n=user.email.split('@')[0];st('sbName',n);st('pfName',n);}
    if(user){st('pfEmail',user.email);st('sbEmail',user.email);}
    if(ub){st('pfBio',`"${ub}"`);sv('pfBioIn',ub);}
    if(ug)sv('pfGenre',ug);
    if(bn){const bi=$('pfBanner');if(bi)bi.src=bn;const bp=$('pfBannerPreview');if(bp){bp.src=bn;bp.classList.remove('hidden');}}
    const sa=$('sbAvatar'); if(sa)sa.innerHTML='';
    if(av){
        const ai=$('avatarImg');if(ai){ai.src=av;ai.classList.remove('hidden');}$('avatarText')?.classList.add('hidden');
        const abi=$('pfAvatarImg');if(abi){abi.src=av;abi.classList.remove('hidden');}$('pfAvatarText')?.classList.add('hidden');
        const pp=$('pfPhotoPreview');if(pp){pp.src=av;pp.classList.remove('hidden');}
        if(sa){const img=document.createElement('img');img.src=av;sa.appendChild(img);}
    }else{
        st('avatarText',letter); st('pfAvatarText',letter);
        if(sa)sa.innerHTML=`<span id="sbAvatarText">${letter}</span>`;
    }
}

$('changePass')?.addEventListener('click',async()=>{
    const user=auth.currentUser; if(!user) return;
    if(!confirm(`Enviar link de redefinição para ${user.email}?`)) return;
    try{await sendPasswordResetEmail(auth,user.email);showMsg(`Link enviado para ${user.email}! 📧`,'success');}
    catch(e){showMsg('Erro: '+e.message,'error');}
});

async function doLogout(){
    try{
        stopBoost(); uid_=null;
        await signOut(auth); resetPfUI();
        document.documentElement.style.setProperty('--primary','#e50914');
        document.documentElement.style.setProperty('--primary-glow','rgba(229,9,20,.35)');
        closeM('profileModal'); closeSB();
        activeItem=null; catalog=[]; isAdmin=false; renderApp();
        showMsg('Saiu! 👋','success');
    }catch{showMsg('Erro ao sair','error');}
}
$('logoutBtn')?.addEventListener('click',doLogout);

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
$('togglePass')?.addEventListener('click',()=>{
    const pw=$('authPass'); if(!pw) return;
    const show=pw.type==='password'; pw.type=show?'text':'password';
    $('togglePass').textContent=show?'🙈':'👁️';
});
$('btnForgot')?.addEventListener('click',()=>{closeM('authModal');openM('forgotModal');});
$('backLogin')?.addEventListener('click',()=>{closeM('forgotModal');openM('authModal');});
$('closeForgot')?.addEventListener('click',()=>{closeM('forgotModal');openM('authModal');});
$('forgotOkClose')?.addEventListener('click',()=>{closeM('forgotOkModal');openM('authModal');});

$('forgotForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('forgotEmail')?.value.trim().toLowerCase(); if(!email){showMsg('Digite o e-mail!','error');return;}
    const btn=$('sendReset'),ot=btn?.textContent; if(btn){btn.textContent='⏳ Enviando...';btn.disabled=true;}
    try{await sendPasswordResetEmail(auth,email);closeM('forgotModal');const el=$('forgotOkEmail');if(el)el.textContent=email;openM('forgotOkModal');}
    catch(err){showMsg(authErr(err.code),'error');}
    if(btn){btn.textContent=ot;btn.disabled=false;}
});

function updAuthMode(){
    const body=$('authBody');
    if(isSignUp)body?.classList.add('signup'); else body?.classList.remove('signup');
    const sub=$('authSub'); if(sub) sub.textContent=isSignUp?'Crie sua conta gratuita':'Entre na sua conta para continuar';
    const btn=$('authSubmit'); if(btn) btn.textContent=isSignUp?'Criar Conta':'Entrar na Conta';
    const tog=$('toggleAuth'); if(tog) tog.innerHTML=isSignUp?'Já tem conta? <span style="color:var(--primary)">Entrar</span>':'Não tem conta? <span style="color:var(--primary)">Crie agora</span>';
    clearAuth();
}
function clearAuth(){
    ['authEmail','authPass','authName'].forEach(id=>{const el=$(id);if(el)el.value='';});
    const pw=$('authPass'); if(pw)pw.type='password';
    const btn=$('togglePass'); if(btn)btn.textContent='👁️';
}

$('toggleAuth')?.addEventListener('click',()=>{isSignUp=!isSignUp;updAuthMode();});

$('authForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(authBusy) return; authBusy=true;
    const sb=$('authSubmit'),ot=sb?.textContent; if(sb){sb.textContent='⏳ Aguarde...';sb.disabled=true;}
    const email=$('authEmail')?.value.trim().toLowerCase();
    const pass=$('authPass')?.value;
    const name=$('authName')?.value.trim()||'';
    if(!email||!pass||pass.length<6){showMsg('Preencha tudo! Senha mín. 6 chars','error');authBusy=false;if(sb){sb.textContent=ot;sb.disabled=false;}return;}
    if(isSignUp&&!name){showMsg('Digite um nome!','error');authBusy=false;if(sb){sb.textContent=ot;sb.disabled=false;}return;}
    try{
        if(isSignUp){
            if(auth.currentUser) await signOut(auth);
            const cred=await createUserWithEmailAndPassword(auth,email,pass);
            await set(ref(db,'users/'+cred.user.uid),{name,bio:'',favGenre:'Ação',photo:'',banner:'',themeColor:'#e50914',createdAt:Date.now()});
            showMsg('Conta criada! ✅','success');
        }else{
            if(auth.currentUser) await signOut(auth);
            await signInWithEmailAndPassword(auth,email,pass);
            showMsg('Bem-vindo! 🎬','success');
        }
        closeM('authModal'); clearAuth();
    }catch(err){showMsg(authErr(err.code),'error');}
    authBusy=false; if(sb){sb.textContent=ot;sb.disabled=false;}
});

// ═══════════════════════════════════════════════════════════════
// AUTH STATE
// ═══════════════════════════════════════════════════════════════
onAuthStateChanged(auth,async user=>{
    if(user){
        uid_=user.uid; resetPfUI(); closeM('authModal'); clearAuth();
        const em=$('pfEmail'); if(em)em.textContent=user.email;
        isAdmin=user.email.toLowerCase()===ADMIN_EMAIL.toLowerCase();
        ['pfAdmin','navAdmin','navCreator','navSugAdmin','navStorage'].forEach(id=>$(id)?.classList.toggle('hidden',!isAdmin));
        await loadProfile(user); loadCatalog();
    }else{
        stopBoost(); uid_=null; isAdmin=false; resetPfUI();
        document.documentElement.style.setProperty('--primary','#e50914');
        document.documentElement.style.setProperty('--primary-glow','rgba(229,9,20,.35)');
        openM('authModal'); clearAuth();
        ['navAdmin','navCreator','navSugAdmin','navStorage','pfAdmin'].forEach(id=>$(id)?.classList.add('hidden'));
        isSignUp=false; updAuthMode();
    }
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
clearLegacy();
renderGenres();
renderMovieSrc();
