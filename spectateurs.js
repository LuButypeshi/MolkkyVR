// =====================================================
// SPECTATEURS : petits bonhommes au bord du terrain
//  - ils sautent de joie quand le joueur marque des points (et en continu en cas de victoire)
//  - ils s'assoient, déçus, quand le lancer est raté (et restent assis en cas de défaite)
// Utilisation dans un niveau :
//   const spectateurs = creerSpectateurs(scene, DISTANCE_LANCER);
//   spectateurs.celebrer(2);        // saute pendant 2 s   (Infinity = jusqu'à reinitialiser())
//   spectateurs.decevoir(2.5);      // assis pendant 2.5 s (Infinity = jusqu'à reinitialiser())
//   spectateurs.reinitialiser();    // tout le monde debout, au repos
//   spectateurs.mettreAJour(dt);    // à appeler à chaque image dans la boucle principale
// =====================================================
import * as THREE from 'three';

const COULEURS_HAUT = ["#e63946", "#3a86ff", "#ffbe0b", "#8338ec", "#fb5607", "#2a9d8f", "#ff006e", "#06d6a0"];
const COULEURS_PEAU = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
const COULEUR_PANTALON = "#2b2d42";

// Dimensions d'un bonhomme (en mètres) : environ 95 cm de haut
const JAMBE = 0.35;      // longueur des jambes = hauteur des hanches
const BRAS = 0.28;
const EPAULES = 0.62;    // hauteur des épaules

function hasard(tableau) { return tableau[Math.floor(Math.random() * tableau.length)]; }

// Crée une géométrie de membre dont le point de pivot (0,0,0) est en haut et qui pend vers le bas
function membre(rayon, longueur) {
    const geo = new THREE.CapsuleGeometry(rayon, longueur - 2 * rayon, 4, 8);
    geo.translate(0, -longueur / 2, 0);
    return geo;
}

function creerBonhomme() {
    const matHaut = new THREE.MeshStandardMaterial({ color: hasard(COULEURS_HAUT), roughness: 0.7 });
    const matPeau = new THREE.MeshStandardMaterial({ color: hasard(COULEURS_PEAU), roughness: 0.8 });
    const matBas = new THREE.MeshStandardMaterial({ color: COULEUR_PANTALON, roughness: 0.9 });
    const matNoir = new THREE.MeshBasicMaterial({ color: "#111111" });

    const racine = new THREE.Group();     // posée au sol, tournée vers le terrain
    const corps = new THREE.Group();      // monte/descend (saut, position assise)
    racine.add(corps);

    // Hanches (pivot des jambes)
    const hanches = new THREE.Group();
    hanches.position.y = JAMBE;
    corps.add(hanches);

    const jambes = [-1, 1].map((cote) => {
        const j = new THREE.Mesh(membre(0.05, JAMBE), matBas);
        j.position.x = cote * 0.065;
        hanches.add(j);
        return j;
    });

    // Buste
    const buste = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.16, 4, 12), matHaut);
    buste.position.y = JAMBE + 0.15;
    corps.add(buste);

    // Bras (pivot à l'épaule)
    const bras = [-1, 1].map((cote) => {
        const b = new THREE.Mesh(membre(0.04, BRAS), matHaut);
        b.position.set(cote * 0.16, EPAULES, 0);
        b.userData.cote = cote;
        corps.add(b);
        return b;
    });

    // Tête (pivot au cou) avec deux yeux et une bouche
    const cou = new THREE.Group();
    cou.position.y = EPAULES + 0.05;
    corps.add(cou);
    const tete = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), matPeau);
    tete.position.y = 0.13;
    cou.add(tete);
    [-1, 1].forEach((cote) => {
        const oeil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), matNoir);
        oeil.position.set(cote * 0.045, 0.03, 0.118);
        tete.add(oeil);
    });
    const bouche = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), matNoir);
    bouche.position.set(0, -0.035, 0.122);
    tete.add(bouche);

    racine.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    return {
        racine, corps, jambes, bras, cou, bouche,
        phase: Math.random() * Math.PI * 2,     // chacun saute à son rythme
        vitesse: 9 + Math.random() * 3,
        assis: 0,        // 0 = debout, 1 = assis (on glisse doucement entre les deux)
        brasLeves: 0,    // 0 = bras le long du corps, 1 = bras en l'air
        hauteurSaut: 0
    };
}

export function creerSpectateurs(scene, distanceLancer) {
    const groupe = new THREE.Group();
    scene.add(groupe);

    // Deux petites tribunes de chaque côté des quilles, tournées vers le centre du jeu
    const centreZ = -distanceLancer - 0.3;
    const bonhommes = [];
    [-1, 1].forEach((cote) => {
        for (let rangee = 0; rangee < 2; rangee++) {
            for (let i = 0; i < 3; i++) {
                const b = creerBonhomme();
                const x = cote * (2.3 + rangee * 0.55) + (Math.random() - 0.5) * 0.15;
                const z = centreZ + (i - 1) * 0.7 + rangee * 0.3 + (Math.random() - 0.5) * 0.15;
                b.racine.position.set(x, 0, z);
                b.racine.lookAt(0, 0, centreZ + 1.2);     // regarde le terrain, un peu vers le joueur
                groupe.add(b.racine);
                bonhommes.push(b);
            }
        }
    });

    let humeur = "calme";     // "calme" | "joie" | "deception"
    let tempsRestant = 0;
    let horloge = 0;

    function changerHumeur(nouvelle, duree) {
        humeur = nouvelle;
        tempsRestant = duree;
    }

    return {
        celebrer: (duree = 2) => changerHumeur("joie", duree),
        decevoir: (duree = 2.5) => changerHumeur("deception", duree),
        reinitialiser: () => changerHumeur("calme", 0),

        mettreAJour(dt) {
            horloge += dt;
            if (humeur !== "calme") {
                tempsRestant -= dt;
                if (tempsRestant <= 0) humeur = "calme";
            }
            const lissage = 1 - Math.exp(-dt * 8);   // transitions douces entre les poses

            for (const b of bonhommes) {
                const t = horloge * b.vitesse + b.phase;

                // Cibles de la pose selon l'humeur
                const cibleAssis = humeur === "deception" ? 1 : 0;
                const cibleBras = humeur === "joie" ? 1 : 0;
                const cibleSaut = humeur === "joie" ? Math.abs(Math.sin(t * 0.5)) * 0.3 : 0;

                b.assis += (cibleAssis - b.assis) * lissage;
                b.brasLeves += (cibleBras - b.brasLeves) * lissage;
                b.hauteurSaut += (cibleSaut - b.hauteurSaut) * Math.min(1, lissage * 3);

                // Assis par terre : le corps descend et les jambes partent vers l'avant
                const descente = b.assis * (JAMBE - 0.06);
                b.corps.position.y = b.hauteurSaut - descente;
                b.jambes.forEach((j) => { j.rotation.x = -b.assis * Math.PI / 2; });

                // Bras : en l'air quand ils sautent (en s'agitant), posés sur les genoux quand ils sont assis
                const agite = Math.sin(t * 1.3) * 0.25 * b.brasLeves;
                b.bras.forEach((bras) => {
                    bras.rotation.z = bras.userData.cote * (b.brasLeves * 2.6 + agite + 0.08);
                    bras.rotation.x = -b.assis * 0.8;
                });

                // Tête : baissée quand ils sont déçus, petit balancement au repos
                b.cou.rotation.x = b.assis * 0.45;
                b.cou.rotation.z = humeur === "calme" ? Math.sin(horloge * 1.5 + b.phase) * 0.06 : 0;

                // Bouche : sourire (arc vers le bas) ou moue (arc retourné)
                b.bouche.rotation.z = b.assis > 0.5 ? 0 : Math.PI;
                b.bouche.position.y = b.assis > 0.5 ? -0.05 : -0.035;
            }
        }
    };
}
