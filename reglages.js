// reglages.js : musique de fond, effets sonores, luminosité et panneau Paramètres.
// Ce fichier est utilisé par l'accueil, le menu et les niveaux.

const CLE = "molkky_reglages";
const DEFAUT = { musique: 0.5, effets: 0.8, luminosite: 1 };
export const reglages = { ...DEFAUT };
try { Object.assign(reglages, JSON.parse(localStorage.getItem(CLE))); } catch {}

function sauver() {
    try { localStorage.setItem(CLE, JSON.stringify(reglages)); } catch {}
}

// ---------- Contexte audio partagé ----------
let ctx = null;
function audioCtx() {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
}

// ---------- Effet sonore "clack" ----------
export function jouerClack() {
    const c = audioCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = 1650;
    gain.gain.setValueAtTime(Math.max(0.0001, 0.5 * reglages.effets), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.13);
}

// ---------- Sons du jeu (fichiers dans audio/) ----------
const FICHIERS_SONS = { impact: "audio/sonBaton.mp3", defaite: "audio/sonDefaite.mp3" };
const sons = {};   // sons décodés, prêts à être joués

async function chargerSons() {
    for (const [nom, fichier] of Object.entries(FICHIERS_SONS)) {
        try {
            const reponse = await fetch(fichier);
            sons[nom] = await audioCtx().decodeAudioData(await reponse.arrayBuffer());
        } catch (erreur) {
            console.warn(`Son introuvable : ${fichier}`, erreur);
        }
    }
}

function jouerSon(nom) {
    const buffer = sons[nom];
    if (!buffer) return;
    const c = audioCtx();
    const source = c.createBufferSource();
    const gain = c.createGain();
    source.buffer = buffer;
    gain.gain.value = reglages.effets;
    source.connect(gain).connect(c.destination);
    source.start();
}

// Impact du bâton contre une quille
export function jouerImpact() { jouerSon("impact"); }

// Dernier lancer raté avant la défaite
export function jouerRate() { jouerSon("defaite"); }

// ---------- Musique de fond ----------
// Si audio/musique.mp3 existe, c'est lui qui est joué. Sinon, une petite musique est générée.
const musique = new Audio("audio/musique.mp3");
musique.loop = true;
let musiqueGeneree = false;
musique.addEventListener("error", () => { musiqueGeneree = true; });

// La musique reprend à la même position quand on passe d'une page à l'autre
const CLE_POSITION = "molkky_musique_position";
musique.addEventListener("loadedmetadata", () => {
    try {
        const p = parseFloat(sessionStorage.getItem(CLE_POSITION));
        if (p > 0 && p < musique.duration) musique.currentTime = p;
    } catch {}
});
addEventListener("pagehide", () => {
    try { sessionStorage.setItem(CLE_POSITION, String(musique.currentTime)); } catch {}
});

let sortieMusique = null;
const MELODIE = [0, 2, 4, 2, 3, 2, 1, 2, 4, 3, 2, 0, 1, 2, 3, 2];   // indices dans la gamme
const GAMME = [523.25, 587.33, 659.25, 783.99, 880];                 // do ré mi sol la
const BASSE = [65.41, 73.42, 87.31, 98.0];                            // do ré fa sol (grave)

function note(freq, t, duree, type, volume) {
    const c = audioCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    osc.connect(gain).connect(sortieMusique);
    osc.start(t);
    osc.stop(t + duree + 0.05);
}

function demarrerMusiqueGeneree() {
    if (sortieMusique) return;
    const c = audioCtx();
    c.resume();
    sortieMusique = c.createGain();
    sortieMusique.connect(c.destination);
    appliquerVolumeMusique();

    const croche = 60 / 100 / 2;   // 100 battements par minute
    let pas = 0;
    let prochain = c.currentTime + 0.1;
    const planifier = () => {      // on programme les notes un peu à l'avance
        while (prochain < c.currentTime + 0.3) {
            const position = pas % 16;
            note(GAMME[MELODIE[position]], prochain, croche * 0.9, "triangle", 0.4);
            if (position % 4 === 0) note(BASSE[position / 4], prochain, croche * 3.5, "sine", 0.6);
            prochain += croche;
            pas++;
        }
    };
    planifier();
    setInterval(planifier, 100);
}

function appliquerVolumeMusique() {
    musique.volume = reglages.musique;
    if (sortieMusique) sortieMusique.gain.value = reglages.musique * 0.35;
}

function lancerMusique() {
    if (musiqueGeneree) demarrerMusiqueGeneree();
    else musique.play().catch(() => {});
}

// Les navigateurs bloquent le son tant que la personne n'a pas cliqué sur la page
function initMusique() {
    musique.play().catch(() => addEventListener("pointerdown", lancerMusique, { once: true }));
}

// ---------- Luminosité ----------
// Chaque page enregistre ses lumières ; le réglage multiplie leur intensité de départ.
const lumieres = [];
export function enregistrerLumiere(lumiere) {
    lumieres.push({ lumiere, base: lumiere.intensity });
    appliquerLuminosite();
}
function appliquerLuminosite() {
    for (const { lumiere, base } of lumieres) lumiere.intensity = base * reglages.luminosite;
}

function appliquerTout() {
    appliquerVolumeMusique();
    appliquerLuminosite();
}

// ---------- Panneau Paramètres (bouton en haut à droite) ----------
export function initReglages() {
    const style = document.createElement("style");
    style.textContent = `
        #btnParametres { position: fixed; right: 12px; top: 10px; z-index: 7; padding: 8px 14px; border: 0;
            border-radius: 8px; background: #ffb319; color: #13241c; font: 600 16px system-ui, sans-serif; cursor: pointer; }
        #panneauParametres { position: fixed; right: 12px; top: 58px; z-index: 7; width: 260px; box-sizing: border-box;
            padding: 14px 16px; border-radius: 10px; background: rgba(251, 248, 239, 0.96); color: #13241c;
            font: 16px system-ui, sans-serif; text-align: left; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25); }
        #panneauParametres[hidden] { display: none; }
        #panneauParametres h2 { margin: 0 0 10px; font-size: 20px; }
        #panneauParametres label { display: grid; gap: 4px; margin-bottom: 12px; }
        #panneauParametres input[type=range] { width: 100%; }
        #panneauParametres button { padding: 6px 12px; border: 0; border-radius: 8px; background: #ffb319;
            font-size: 15px; cursor: pointer; }`;
    document.head.append(style);

    const bouton = document.createElement("button");
    bouton.id = "btnParametres";
    bouton.textContent = "⚙ Paramètres";

    const panneau = document.createElement("div");
    panneau.id = "panneauParametres";
    panneau.hidden = true;
    panneau.innerHTML = `
        <h2>Paramètres</h2>
        <label>Musique <span data-val="musique"></span>
            <input type="range" min="0" max="1" step="0.05" data-cle="musique"></label>
        <label>Effets sonores <span data-val="effets"></span>
            <input type="range" min="0" max="1" step="0.05" data-cle="effets"></label>
        <label>Luminosité <span data-val="luminosite"></span>
            <input type="range" min="0.4" max="1.6" step="0.05" data-cle="luminosite"></label>
        <button type="button" id="btnReinitialiser">Réinitialiser</button>`;
    document.body.append(bouton, panneau);

    const curseurs = [...panneau.querySelectorAll("input[data-cle]")];
    const afficher = () => {
        for (const c of curseurs) {
            const cle = c.dataset.cle;
            c.value = reglages[cle];
            panneau.querySelector(`[data-val="${cle}"]`).textContent = `${Math.round(reglages[cle] * 100)} %`;
        }
    };
    for (const c of curseurs) {
        c.addEventListener("input", () => {
            reglages[c.dataset.cle] = Number(c.value);
            appliquerTout();
            sauver();
            afficher();
        });
    }
    panneau.querySelector("#btnReinitialiser").onclick = () => {
        Object.assign(reglages, DEFAUT);
        appliquerTout();
        sauver();
        afficher();
    };
    bouton.onclick = () => { panneau.hidden = !panneau.hidden; };

    afficher();
    initMusique();
    chargerSons();
}
