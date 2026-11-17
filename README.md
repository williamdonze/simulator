# Armées Peintes

Peins des armées, des châteaux, des forêts et des rivières, puis regarde des dizaines de milliers de soldats s'affronter.

Ouvre simplement `index.html` dans un navigateur récent (WebGL2 requis). Aucune dépendance, aucun build.

## Comment jouer

1. Choisis une unité dans la barre du bas.
2. Glisse sur le terrain : à gauche de la ligne pointillée tes troupes sont rouges, à droite bleues.
3. Clique sur **Lancer**.
4. À la fin, clique sur **Voir les stats** si tu veux le détail (pertes, éliminations, meilleure unité).

- La molette (ou le pincement sur mobile) change la taille du pinceau. Le terrain tient toujours dans l'écran : pas de zoom.
- **Rejouer** relance la même bataille ; la poubelle efface tout.
- Raccourcis clavier : `Entrée` lance ou rejoue, `Espace` met en pause, `C` efface tout, `[` `]` changent la taille du pinceau.

## Contenu (guerre moderne)

- **Infanterie (11)** : fusilier, mitrailleur, sniper, lance-roquettes, grenadier, lance-flammes, médecin, officier, bouclier balistique, commando, sapeur C4.
- **Véhicules (6)** : jeep mitrailleuse, blindé de transport, char d'assaut, obusier, lance-roquettes multiple, véhicule anti-aérien.
- **Aérien (4)** : drone kamikaze, drone bombardier, hélicoptère, avion d'attaque.
- **Bâtiments (11)** : caserne, usine de blindés, héliport, base de drones, hôpital de campagne, quartier général, bunker, tourelle automatique, batterie de missiles sol-air, mine, dépôt de carburant.
- **Terrain** : forêt, herbes hautes, eau, eau profonde, boue, sable, route, rochers, mur de béton, sacs de sable, barbelés, plus le feu et la gomme.

Comportements notables :

- **Unités aériennes** : elles survolent murs, rivières et troupes. Seules les armes à feu, les roquettes et la DCA peuvent les toucher, et les armes légères ratent souvent les cibles volantes.
- **Drones kamikazes** : ils visent en priorité les blindés et les bâtiments. Les **drones bombardiers** larguent puis s'écartent pour revenir. Les **avions** font des passes de bombardement et reviennent.
- **Véhicule anti-aérien** et **batterie de missiles** (missiles à tête chercheuse) : ils ne tirent que sur ce qui vole.
- **Char** : blindage énorme, les balles ricochent. **Lance-roquettes** : dégâts ×2,5 sur blindés, bâtiments et hélicoptères.
- **Blindé de transport** : 4 fusiliers en sortent quand il est détruit.
- **Mines** : invisibles pour l'ennemi, elles explosent à son passage.
- **Commando** : il s'infiltre derrière les lignes et vise snipers, médecins et officiers.
- **Médecins** et **hôpital** soignent ; l'**officier** et le **QG** galvanisent les troupes proches.
- **Feu**, **morale** (les unités submergées et blessées paniquent), **murs** contournés ou démolis.

## Architecture (performances)

- `js/sim.js` : simulation orientée données (tableaux typés, aucun objet par unité), pas fixe de 30 Hz.
  - Grille spatiale reconstruite à chaque tick par tri par comptage (O(n)).
  - Un **flow field** BFS par équipe pour le pathfinding global (contournement des murs et rivières, percée si l'ennemi est enfermé), recalculé de façon échelonnée.
  - Un champ de distance « ennemi le plus proche » par équipe, qui permet aux recherches de cible de sauter les zones vides, plus un cache de cible par cellule et par équipe.
  - Recherche de cible échelonnée par anneaux sur la grille ; collisions résolues en Jacobi sur des tableaux compactés dans l'ordre des cellules (sans biais gauche/droite).
  - Les morts sont résolues simultanément en fin de tick (pas d'avantage au premier qui agit).
- `js/render.js` : WebGL2, **un seul draw call instancié par couche**, tri en profondeur par counting sort, sol procédural en shader, couche persistante de décalques (cadavres, cratères, flèches plantées) dans un framebuffer.
- `js/sprites.js` : tous les sprites sont dessinés procéduralement au démarrage dans un atlas, avec un masque pour la couleur d'équipe.

Ordre de grandeur de la simulation (mesuré dans Node, sans rendu) : environ 9 à 16 ms par tick de simulation pour 50 000 unités en plein combat (scénario « Test de charge »), et moins de 3 ms pour 5 000 à 10 000 unités.
