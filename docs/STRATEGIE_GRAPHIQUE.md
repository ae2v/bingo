# Bingo AE2V — stratégie de création graphique

> Direction préparée pour `bingo.ae2v.fr`, soirée d’intégration AE2V du 17 septembre 2026.
> Référence étudiée : Gartic Phone, observé le 17 septembre 2026. Les captures ci-dessous servent uniquement à l’analyse. Aucun asset, personnage, logo ou écran n’est copié.

## 1. Captures de repérage

| Écran observé | Mobile | Bureau |
|---|---|---|
| Accueil et entrée dans le jeu | [capture mobile](research/gartic-phone/02-accueil-mobile.png) | [capture bureau](research/gartic-phone/01-accueil-desktop.png) |
| Salon, joueurs et modes | [capture mobile](research/gartic-phone/03-salon-mobile.png) | [capture bureau](research/gartic-phone/04-salon-desktop.png) |
| Réglages avancés | [capture mobile](research/gartic-phone/06-personnalisation-mobile.png) | [capture bureau](research/gartic-phone/05-personnalisation-desktop.png) |
| Partage et QR | [capture mobile](research/gartic-phone/07-partage-mobile.png) | [capture bureau](research/gartic-phone/08-partage-desktop.png) |

## 2. Ce que Gartic Phone fait bien

1. **Une action dominante par écran.** Le bouton principal est toujours isolé, massif et placé dans la zone naturelle du pouce.
2. **Le jeu s’explique par l’image et le verbe.** Chaque mode associe un pictogramme expressif, un titre court et une seule phrase utile.
3. **Les états ont une silhouette.** Sélection, attente, action et modal ont des contours, profondeurs et couleurs différentes ; on comprend avant de lire.
4. **Le partage est théâtralisé.** Le QR devient le protagoniste d’un écran sombre et focalisé au lieu d’être noyé dans des réglages.
5. **Le mobile n’est pas une réduction du bureau.** Les actions principales restent collées au bas, le contenu devient une pile et les cartes remplissent la largeur.
6. **La personnalité vient de détails cohérents.** Typographie dense, aplats francs, contours légèrement irréguliers et illustrations simples forment un système reconnaissable.

## 3. Ce qu’il ne faut pas reprendre

- le fond violet/magenta, les oiseaux, le logo, les illustrations ou la composition exacte ;
- les doubles contours et ombres sur chaque élément : efficaces pour un jeu de dessin, mais trop bruyants pour une grille 4×4 ;
- les longues listes de réglages visibles côté joueur ;
- la petite taille de certains textes et les contrastes faibles du violet sur violet ;
- les animations permanentes. Le mouvement AE2V doit expliquer un changement, pas décorer l’attente.

## 4. Décision sheet AE2V

### Intention

**Un carnet de rencontres qui s’allume.** L’interface doit évoquer un badge de soirée et une feuille de bingo manipulable, avec l’énergie d’une affiche étudiante mais la clarté d’un outil utilisable debout, d’une seule main et sous une lumière imparfaite.

### Protagoniste

La grille 4×4 est le protagoniste. Elle occupe la majorité de l’écran de jeu. Le code personnel, les règles et les résultats sont des vues secondaires accessibles par la navigation basse.

### Palette

- `Encre` `#17151B` : texte, contours, fond des modales ;
- `Papier` `#FFF9EE` : fond principal chaud et lisible ;
- `Rouge AE2V` `#D60106` : marque et action critique ;
- `Corail` `#FF5A4F` : action principale et progression ;
- `Jaune badge` `#FFD84D` : accent festif et focus ;
- `Menthe validée` `#8FE3B0` : validation confirmée ;
- `Bleu attente` `#88C8FF` : synchronisation et information.

Le rouge n’est pas utilisé seul pour signifier une erreur. Icône, libellé et contraste accompagnent toujours la couleur.

### Typographie

- titres : **Arial Black / ui-rounded**, capitales courtes et interlettrage serré ;
- texte : **Inter / system-ui**, lisible sans téléchargement obligatoire ;
- codes : **ui-monospace**, chiffres et lettres sans ambiguïté.

### Formes et matière

- coins moyens, pas de pilules systématiques ;
- bord noir de 2 px et ombre franche de 3–5 px seulement sur les éléments manipulables ;
- grille inspirée de petits tickets imprimés, avec une micro-rotation alternée de ±0,35° sur grand écran seulement ;
- motifs originaux : confettis, étoile à quatre branches, trait de surligneur et éclat de badge.

### Iconographie

Une seule famille : Lucide, trait 2–2,5 px. Les illustrations explicatives sont des SVG originaux simples, construits avec les mêmes contours et la même palette.

## 5. Architecture des écrans joueur

### Entrée

Une accroche, une illustration utile, deux champs, un bouton « Créer ma grille ». En attente de l’ouverture, le bouton devient un état explicite avec la date de la soirée.

### Grille

- bandeau compact : prénom, état du jeu, progression `7/16` ;
- grille 4×4 immédiatement visible ;
- chaque case reste un vrai bouton de 44 px minimum, même sur 320 px ;
- toucher une case ouvre une feuille basse avec deux choix : scanner ou saisir le code ;
- après validation, retour automatique à la grille et animation de tampon.

### Mon code

Le QR et le code temporaire occupent le centre. Le prénom public est visible ; le nom de famille ne l’est jamais. Un anneau indique le temps avant renouvellement.

### Résultats

Le premier bingo est annoncé par une séquence courte de badge qui se déplie. Le tirage final révèle les prénoms un par un, sans effet casino ni attente artificielle.

## 6. Mouvement et explication

- apparition d’écran : 180 ms, translation verticale de 8 px et fondu ;
- pression d’un bouton : 90 ms, enfoncement de l’ombre franche ;
- case confirmée : tampon élastique de 260 ms, puis repos complet ;
- validation en attente : petit trait circulaire, jamais une pulsation de toute la case ;
- victoire : 700 ms maximum, confettis CSS peu nombreux et badge central ;
- `prefers-reduced-motion` : aucune translation, aucun confetti, fondus de 80 ms maximum.

## 7. Responsive et accessibilité

- conception de base : 320–480 px ;
- navigation basse tenant compte de `env(safe-area-inset-bottom)` ;
- grille sans défilement horizontal, texte limité avec ellipsis et détail lisible au toucher ;
- à partir de 768 px : grille et panneau de progression côte à côte ;
- à partir de 1200 px : largeur de lecture plafonnée, aucun étirement décoratif ;
- contrastes WCAG AA, focus clavier visible, modales piégeant le focus, libellés complets pour lecteur d’écran ;
- caméra toujours doublée d’une saisie manuelle.

## 8. Règle de qualité

À chaque écran, une personne doit pouvoir répondre en moins de deux secondes à trois questions : **où suis-je, que dois-je faire, qu’est-ce qui vient de se passer ?** Si un élément n’aide pas une de ces réponses, il est retiré de l’interface joueur.
