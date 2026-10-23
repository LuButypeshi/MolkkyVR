// vr.js : panneaux 3D et manettes pour l'accueil et le menu (utilisables en réalité virtuelle).
// Les panneaux n'apparaissent qu'en VR. Chaque manette envoie un rayon droit devant elle :
// la gâchette clique sur ce que le rayon touche.
import * as THREE from 'three';
import { reglages, modifierReglage, reinitialiserReglages } from './reglages.js';

export const COULEURS = {
    fond: '#f4e6c8',
    bouton: '#ffb319',
    survol: '#ffd27a',
    texte: '#13241c',
    bandeau: '#469db0',
    blanc: '#ffffff'
};

// Panneau plat dont la texture est un canvas. dessiner(panneau) remplit panneau.g et panneau.zones.
export class PanneauVR {
    constructor({ largeur, hauteur, dessiner, ecran = 'accueil' }) {
        this.W = 768;
        this.H = Math.round(this.W * hauteur / largeur);
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.W;
        this.canvas.height = this.H;
        this.g = this.canvas.getContext('2d');
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(largeur, hauteur),
            new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide })
        );
        this.mesh.userData.panneau = this;
        this.mesh.visible = false;          // le panneau n'apparaît qu'en réalité virtuelle
        this.dessiner = dessiner;
        this.ecran = ecran;                 // page affichée dans le panneau
        this.zones = [];                    // boutons cliquables : {x, y, w, h, action}
        this.survolAction = null;           // bouton visé en ce moment
        this.cle = '';
    }

    // Redessine seulement si l'écran, les données affichées ou le bouton visé ont changé
    mettreAJour(donnees) {
        const cle = `${this.ecran}|${donnees}|${this.survolAction}`;
        if (cle === this.cle) return;
        this.cle = cle;
        this.zones = [];
        this.dessiner(this);
        this.texture.needsUpdate = true;
    }

    // Bouton situé sous un point du panneau (coordonnées uv, de 0 à 1)
    zoneSous(uv) {
        const x = uv.x * this.W;
        const y = (1 - uv.y) * this.H;
        return this.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null;
    }
}

// ---------- Dessin ----------
export function fond(p) {
    p.g.fillStyle = COULEURS.fond;
    p.g.fillRect(0, 0, p.W, p.H);
}

export function bandeauTitre(p, titre) {
    p.g.fillStyle = COULEURS.bandeau;
    p.g.fillRect(0, 0, p.W, 110);
    ecrire(p, titre, p.W / 2, 56, { taille: 56, gras: true, couleur: COULEURS.blanc });
}

export function ecrire(p, t, x, y, { taille = 30, gras = false, align = 'center', couleur = COULEURS.texte } = {}) {
    p.g.fillStyle = couleur;
    p.g.font = `${gras ? 'bold ' : ''}${taille}px system-ui, sans-serif`;
    p.g.textAlign = align;
    p.g.textBaseline = 'middle';
    p.g.fillText(t, x, y);
}

export function bouton(p, { x, y, w, h, texte, action, couleur = COULEURS.bouton, taille = 36 }) {
    p.g.fillStyle = p.survolAction === action ? COULEURS.survol : couleur;
    p.g.fillRect(x, y, w, h);
    ecrire(p, texte, x + w / 2, y + h / 2 + 2, { taille, gras: true });
    p.zones.push({ x, y, w, h, action });
}

// Lignes Musique / Effets / Lumière avec les boutons − et +
export function lignesReglages(p, y0) {
    const lignes = [['musique', 'Musique'], ['effets', 'Effets sonores'], ['luminosite', 'Lumière']];
    lignes.forEach(([cle, libelle], k) => {
        const y = y0 + k * 90;
        ecrire(p, libelle, 40, y + 35, { taille: 32, align: 'left' });
        bouton(p, { x: 470, y, w: 80, h: 70, texte: '−', action: `moins:${cle}`, taille: 44 });
        ecrire(p, `${Math.round(reglages[cle] * 100)} %`, 595, y + 35, { taille: 26, gras: true });
        bouton(p, { x: 640, y, w: 80, h: 70, texte: '+', action: `plus:${cle}`, taille: 44 });
    });
}

// Exécute une action de réglage ; renvoie false si l'action n'en est pas une
export function actionReglage(action) {
    if (action.startsWith('moins:')) modifierReglage(action.slice(6), -0.1);
    else if (action.startsWith('plus:')) modifierReglage(action.slice(5), 0.1);
    else if (action === 'reinitialiser') reinitialiserReglages();
    else return false;
    return true;
}

// Valeurs des réglages, pour savoir quand redessiner un panneau
export function donneesReglages() {
    return `${reglages.musique}|${reglages.effets}|${reglages.luminosite}`;
}

// Place les panneaux à distance devant la tête, face à la personne. La position de départ de la VR
// dépend du casque (au sol ou à hauteur de tête) : on se base donc sur la tête, pas sur des coordonnées fixes.
const _tete = new THREE.Vector3();
const _avant = new THREE.Vector3();
export function placerDevantTete(camera, panneaux, { distance = 1.5, hauteur = 0 } = {}) {
    camera.getWorldPosition(_tete);
    camera.getWorldDirection(_avant);
    _avant.y = 0;
    if (_avant.lengthSq() < 1e-4) _avant.set(0, 0, -1);
    _avant.normalize();
    for (const p of panneaux) {
        p.mesh.position.set(_tete.x + _avant.x * distance, _tete.y + hauteur, _tete.z + _avant.z * distance);
        p.mesh.lookAt(_tete);
    }
}

// ---------- Manettes ----------
const origine = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const direction = new THREE.Vector3();
const LONGUEUR_RAYON = 3;

export class ControlesVR {
    constructor({ renderer, scene, camera = null, placement = null, panneaux = [], cibles = () => [], auSurvol = () => {}, auClic }) {
        this.camera = camera;
        this.placement = placement;
        this.attente = 0;                   // images à attendre avant de placer les panneaux
        this.panneaux = panneaux;
        this.cibles = cibles;
        this.auSurvol = auSurvol;
        this.auClic = auClic;
        this.rayon = new THREE.Raycaster();
        this.touches = [null, null];        // ce que chaque manette vise en ce moment

        this.manettes = [0, 1].map((i) => {
            const manette = renderer.xr.getController(i);
            scene.add(manette);
            const laser = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
                new THREE.LineBasicMaterial({ color: COULEURS.blanc })
            );
            laser.scale.z = LONGUEUR_RAYON;
            laser.visible = false;
            manette.add(laser);
            manette.userData.laser = laser;
            manette.addEventListener('connected', (e) => { manette.userData.source = e.data; });
            manette.addEventListener('selectstart', () => {
                if (this.touches[i]) this.auClic(this.touches[i]);
            });
            return manette;
        });

        // Les panneaux et les rayons n'existent qu'en réalité virtuelle
        const enVR = (visible) => {
            for (const p of this.panneaux) p.mesh.visible = visible;
            for (const m of this.manettes) m.userData.laser.visible = visible;
        };
        renderer.xr.addEventListener('sessionstart', () => { enVR(true); this.attente = 2; });
        renderer.xr.addEventListener('sessionend', () => enVR(false));
    }

    // À appeler à chaque image pendant la session VR
    update() {
        // deux images après le début de la session, la tête est suivie : on place les panneaux devant elle
        if (this.attente > 0 && --this.attente === 0 && this.camera && this.placement) {
            placerDevantTete(this.camera, this.panneaux, this.placement);
        }
        const cibles = this.cibles();
        this.manettes.forEach((manette, i) => {
            if (!manette.userData.source) { this.touches[i] = null; return; }
            manette.getWorldPosition(origine);
            manette.getWorldQuaternion(orientation);
            direction.set(0, 0, -1).applyQuaternion(orientation);
            this.rayon.set(origine, direction);
            const touche = this.rayon.intersectObjects(cibles, false)[0];
            this.touches[i] = touche ? { objet: touche.object, uv: touche.uv, distance: touche.distance } : null;
            manette.userData.laser.scale.z = touche ? touche.distance : LONGUEUR_RAYON;
        });

        for (const p of this.panneaux) p.survolAction = null;
        for (const t of this.touches) {
            const p = t?.objet.userData.panneau;
            if (p) p.survolAction = p.zoneSous(t.uv)?.action ?? null;
        }
        this.auSurvol(this.touches.find(Boolean) ?? null);
    }
}
