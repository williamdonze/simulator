# Petit Monde — transformation en simulateur de monde vivant

Ce document fait le point sur l'audit du moteur de départ, ce qui a été fait, et ce qui reste à faire. Il essaie d'être honnête : ce qui est marqué « testé » l'a été par la suite `tests/run.js` ou dans un navigateur (Chromium, via Playwright).

## 1. Problèmes trouvés dans le moteur de départ

| Problème | Conséquence | Correction |
|---|---|---|
| `Math.random()` utilisé directement dans la simulation | aucune partie reproductible | générateur central `G.rand()` avec graine (`js/rng.js`) |
| Variations de terrain (`tvar`, dont la durée de vie des arbres) tirées avant l'application de la graine | même graine, histoires différentes | tirées par le générateur de monde |
| Une seule catastrophe possible à la fois (`S.cata`), tirée presque au hasard | aucun lien avec l'état de l'écosystème, pas d'événements simultanés | directeur d'événements avec catalogue, risques et règles de compatibilité |
| Humidité des sols absente ; ensuite, premier bilan hydrique toujours négatif | famines généralisées et artificielles | bilan qui tend vers un équilibre fixé par le climat, la pluie tombée, la température et l'eau proche |
| Liste (cellule, terrain) filtrée élément par élément à la fin d'une sécheresse | valeur de terrain invalide, puis `NaN` dans la végétation | restauration par paires, valeurs vérifiées |
| Événements « par espèce » enchaînés sans espèce cible | plantage | le directeur choisit l'espèce pour laquelle l'événement s'applique vraiment, ou annule |
| Conséquences enchaînées qui ne correspondaient plus à la réalité | ex. « les souris s'effondrent (173 → 290) » | les événements de constat exigent que leur condition soit vraie au moment voulu |
| Pas de sauvegarde | — | `js/save.js` (navigateur et fichier) |
| Pas de régions, pas de climat persistant, migrations individuelles seulement | pas d'histoire à grande échelle | `regions.js`, `climate.js`, `migration.js` |
| Chronique en texte brut | pas de gravité, de lieu ni de conséquences | `history.js` avec entrées structurées et individus remarquables |
| Monde de départ avec trop de prédateurs pour les proies | prédateurs qui vident la vallée puis meurent de faim | prédateurs dimensionnés selon les proies présentes |
| Avance rapide qui perd des pas quand le processeur ne suit pas | le temps passe moins vite qu'affiché à ×64 | voir la section 7 |

## 2. Fichiers créés

- `js/rng.js` : générateur aléatoire central.
- `js/bus.js` : bus d'événements.
- `js/regions.js` : régions nommées et leurs statistiques.
- `js/climate.js` : climat à long terme.
- `js/events/conditions.js` : indicateurs et risques.
- `js/events/registry.js` : catalogue des 30 événements.
- `js/events/chains.js` : chaînes de conséquences.
- `js/events/director.js` : directeur d'événements.
- `js/migration.js`, `js/history.js`, `js/powers.js`, `js/save.js`, `js/godui.js`.
- `tests/run.js` et `tests/sim_tests.js` : suite de tests sous Node.
- `docs/RAPPORT.md` : ce document.

## 3. Fichiers modifiés

- `js/eco.js` :
  - générateur central ;
  - modificateurs par espèce (fertilité, mortalité, métabolisme, mutations, sélection, proies supplémentaires) ;
  - zones divines (sanctuaire, reproduction, froid, chaleur, mortalité) ;
  - croissance des plantes selon la région et la fertilité du sol ;
  - effets sur le monde (`S.fxw`), utilisés par les événements et les pouvoirs ;
  - envoi d'un animal en migration (`S.sendTo`), lignées, export et import ;
  - publication des extinctions, retours et générations sur le bus ;
  - suppression de l'ancien moteur de catastrophes, désormais délégué au directeur.
- `js/worldgen.js` : graine appliquée à toute la simulation, prédateurs proportionnés aux proies, événement `generated`.
- `js/ui.js` : outil Inspecter, visée des pouvoirs, déplacement de la caméra, chronique riche et filtrable, onglet Écosystème, horloge (température, événements en cours), rapport du voyage dans le temps.
- `js/defs.js`, `index.html` (scripts, onglets, styles) et `README.md`.

## 4. Fonctionnalités implémentées et testées

- **Directeur d'événements** (testé sur plusieurs graines) :
  - événements tirés selon des risques calculés chaque jour ;
  - délais de réapparition par événement et par espèce ;
  - au plus 5 événements simultanés et 1 événement majeur à la fois ;
  - incompatibilités entre événements ;
  - calme après une crise majeure, tension qui monte pendant les longues accalmies ;
  - événements régionaux et globaux, événements rares (séisme, éruption, super-incendie) ;
  - événements déclenchés par le joueur ou par d'autres événements.
- **Catalogue de 30 événements** :
  - testé : 27 sur 30 se déclenchent dans un même monde sans casser l'état. Les 3 autres (mutation, adaptation, divergence) exigent un historique génétique ou des jeunes, et apparaissent dans les simulations longues ;
  - les effets réels de la sécheresse, de l'inondation, de l'incendie et du séisme sont vérifiés.
- **Chaînes de conséquences** (testé) : conséquences programmées, réactions aux faits publiés sur le bus (extinction, retour, extinction régionale et recolonisation, grande migration, changement de régime climatique), interactions entre événements simultanés.
- **Migrations collectives** (testé) : migrations de crise, saisonnières et de colonisation, en groupe pour les espèces sociales.
- **Climat à long terme** : régimes climatiques de plusieurs années, humidité par région, lacs qui se vident et se remplissent dans leur bassin, désertification, fertilité des sols qui garde la trace des catastrophes.
- **Espèces invasives** : population venue d'ailleurs, génétiquement différente, fertile au début. Elle réussit ou échoue selon l'environnement (on a observé des invasions de hiboux réussies, d'autres ratées).
- **34 pouvoirs divins** en 6 catégories et 3 modes. Tous testés : chacun s'active, puis la simulation continue sans `NaN`.
- **Chronique, fiches d'espèces, individus remarquables** (fondateurs, ancêtres de lignées, derniers de leur espèce, survivants, mutants).
- **Interface** (testée dans Chromium, sans erreur) : panneau divin avec énergie, paramètres, visée et confirmation ; fil d'actualité cliquable ; chronique filtrable et cliquable ; inspecteur de région et fiche d'espèce ; onglet Écosystème ; sauvegarde, chargement, export et import.
- **Reproductibilité** : testée, même graine donne la même histoire.
- **Sauvegarde** : testée, un aller-retour redonne exactement le même monde.

## 5. Fonctionnalités partielles

- **Rencontres entre populations** : le brassage génétique est réel (les animaux se reproduisent avec ceux qu'ils croisent), mais il n'y a pas d'événement « rencontre » propre. La divergence entre régions est détectée.
- **Migrations de reproduction** : seules les migrations saisonnières existent (cerfs, bisons, canards, corbeaux). Pas encore de frai des poissons ni de retour des grenouilles vers les mares au printemps.
- **Super-incendie et éruption** : fonctionnels mais très rares. On les voit surtout via la « Catastrophe majeure » du panneau divin.
- **Mode « Divin équilibré »** : coûts et recharges sont des premières valeurs, à affiner en jouant.
- **Interface mobile** : utilisable, mais le fil d'actualité est masqué sur petit écran.
- **Web Workers** : non utilisés. La simulation tourne dans le fil principal, avec un budget de temps par image (voir la section 7).

## 6. Tests

Lancer `node tests/run.js` (complet) ou `node tests/run.js quick`. Résultat de la dernière exécution : voir la fin de ce document.

## 7. Performance

- Environ 1,2 à 1,5 ms par pas avec 2 200 animaux (pas ×4 de l'avance rapide). Une année simulée prend 10 à 30 s selon la population.
- Le directeur, la chronique et le climat ne tournent qu'une fois par jour, les statistiques régionales tous les 3 jours, les migrations une fois par semaine : leur coût est négligeable devant celui des animaux.
- Les points chauds restent la grille spatiale reconstruite à chaque pas et les recherches de voisins (`nearest`).
- À ×64, la boucle principale limite le temps de calcul par image (28 ms) et abandonne l'excédent. Sur une machine lente, le temps simulé avance donc moins vite que la vitesse affichée. C'est voulu, pour que l'interface reste fluide, mais ce n'est pas encore signalé à l'écran.

## 8. Améliorations encore nécessaires

1. Construire la grille spatiale un pas sur deux, ou de façon incrémentale. Déplacer la simulation dans un Web Worker pour les très grands mondes.
2. Ajouter des migrations de reproduction (poissons, grenouilles) et un événement « rencontre de populations ».
3. Ajuster les coûts et recharges du mode Divin équilibré en jouant.
4. Améliorer l'accord grammatical (noms des individus selon le sexe, par exemple).
5. Afficher sur la carte les zones divines actives et l'épicentre des événements (pour l'instant, seulement dans l'inspecteur et la chronique).
6. Indiquer à l'écran quand l'avance rapide ne tient pas la vitesse demandée.

## Dernière exécution de la suite complète

```
  ok   génération d'un monde — 67 animaux, eau 0 %, forêt 56 % (0.0 s)
  ok   reproductibilité (même seed ⇒ même histoire) — 2078999980:285 (1.7 s)
  ok   mondes variés (eau) — sec 0.0 % / humide 25.5 % (0.0 s)
  ok   reproduction et mortalité sur un an — 433 naissances, 515 morts (8.8 s)
  ok   sauvegarde / chargement — 440 Ko (0.4 s)
  ok   chaque événement du catalogue peut se déclencher sans casser le monde — 27 déclenchés, non applicables ici : mutation, adaptation, divergence (7.5 s)
  ok   effets réels : sécheresse, inondation, incendie, séisme — ok (0.5 s)
  ok   chaînes de conséquences (pluies torrentielles → crue, fin → suites) — conséquences programmées : landslide (0.2 s)
  ok   migrations collectives — rabbit 1, beaver 1 (0.3 s)
      seed 1: 113 évts (massMigration×12 extinction×5 flood×2 overpop×12 boom×7 regionalExtinction×17 deluge×1 landslide×1 mutation×3 epidemic×12 parasites×2 preyCollapse×5 expansion×3 recolonisation×11 divergence×4 wetPeriod×1 adaptation×5 drought×2 storm×3 wildfire×2 harshWinter×1 inbreeding×1 renewal×1), 718 animaux, 19 s/an
      seed 2: 113 évts (massMigration×5 extinction×8 deluge×2 parasites×2 mutation×4 boom×6 landslide×3 flood×2 overpop×9 regionalExtinction×24 epidemic×7 storm×1 recolonisation×13 invasion×2 inbreeding×3 wetPeriod×1 adaptation×8 preyCollapse×4 expansion×2 heatwave×2 wildfire×1 divergence×3 earthquake×1), 384 animaux, 17 s/an
      seed 3: 97 évts (massMigration×9 boom×7 overpop×4 extinction×6 regionalExtinction×23 expansion×3 inbreeding×1 parasites×3 epidemic×6 recolonisation×16 preyCollapse×3 flood×3 adaptation×5 wetPeriod×2 divergence×1 mutation×1 invasion×1 landslide×1 deluge×1 harshWinter×1), 236 animaux, 27 s/an
      seed 4: 130 évts (massMigration×5 mutation×3 extinction×10 boom×8 overpop×13 deluge×2 regionalExtinction×30 flood×1 expansion×4 epidemic×9 preyCollapse×5 inbreeding×6 invasion×2 recolonisation×21 divergence×4 parasites×1 adaptation×4 landslide×1 storm×1), 1204 animaux, 34 s/an
  ok   directeur : plusieurs seeds, événements variés et rares — 26 types d'événements différents (290.4 s)
  ok   grande population (performance) — 2207 animaux, 1.26 ms par pas (0.8 s)
  ok   pouvoirs divins — 34/34 pouvoirs (0.9 s)
  ok   simulation longue (10 ans) — 700 animaux, 549 entrées de chronique, 438 événements, 134 s (134.2 s)

13 réussis, 0 échoués
EXIT 0
```
