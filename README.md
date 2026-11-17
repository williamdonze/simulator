# Armées Peintes

Peins des armées, des châteaux, des forêts et des rivières, puis regarde des dizaines de milliers de soldats s'affronter.

Ouvre simplement `index.html` dans un navigateur récent (WebGL2 requis). Aucune dépendance, aucun build.

## Commandes

| Action | Contrôle |
| --- | --- |
| Peindre l'outil sélectionné | clic gauche / glisser |
| Déplacer la caméra | clic droit, clic molette, ou `Espace` + glisser |
| Zoom | molette (pincer sur mobile) |
| Lancer / pause | bouton **Lancer**, `Entrée` ou `Espace` |
| Rejouer depuis le déploiement | `R` |
| Tout effacer | `C` |
| Taille du pinceau | `[` et `]` |
| Équipe (auto, rouge, bleu, vert, jaune) | `0` à `4` |
| Recadrer / masquer l'interface | `F` / `H` |

En mode **Auto**, tout ce qui est peint à gauche de la ligne pointillée est rouge, à droite bleu. Jusqu'à 4 équipes peuvent s'affronter. Clique sur **⚔ Attaque / 🛡 Défense** dans le panneau des équipes pour changer la posture d'une armée : en défense, elle tient sa position et n'engage que ce qui s'approche.

## Contenu

**26 unités** — paysan, fantassin, lancier, bouclier, chevalier, barbare, berserker, roi, archer, arbalétrier, javelinier, mousquetaire, tireur d'élite, grenadier, lance-flammes, mage, moine soigneur, tambour, ninja, sapeur, cavalier, archer monté, catapulte, baliste, canon, bélier.

**12 bâtiments** — hutte, caserne, camp d'archers, écurie, atelier de siège, tente de commandement, temple, tour d'archers, tour de mage, bastion à canon, château, baril de poudre.

**11 terrains** — forêt, herbes hautes, eau peu profonde, eau profonde, boue, sable, route, rochers, mur de pierre, palissade, pieux. Plus des outils : gomme, torche, prairie.

Chaque élément a son propre comportement (survole un outil pour le lire) :

- **Lanciers** : dégâts ×3 contre la cavalerie, ils brisent les charges.
- **Cavaliers** : ils accélèrent, percutent, traversent les lignes puis font demi-tour pour recharger.
- **Boucliers** : ils bloquent 85 % des projectiles venant de face.
- **Archers** et **mages** : ils reculent quand l'ennemi s'approche ; les archers montés tirent en se déplaçant.
- **Tireurs d'élite** et **ninjas** : ils visent les rois, soigneurs et tireurs ; les ninjas se téléportent dans leur dos.
- **Sapeurs** : ils foncent sur les bâtiments et se font exploser.
- **Béliers** : ils ignorent les soldats et défoncent bâtiments et murs.
- **Paysans** : ils fuient en infériorité et réparent les bâtiments alliés.
- **Tambours**, **tente de commandement** et **roi** : aura de vitesse, de dégâts et de courage. Si le roi tombe, son armée panique.
- **Feu** : il se propage dans l'herbe, la forêt et les palissades. Les unités en flammes paniquent ; l'eau les éteint ; le vent accélère l'incendie.
- **Murs** : les troupes les contournent s'il existe un chemin, sinon elles les démolissent. Les explosions les détruisent.
- **Barils de poudre** : ils explosent au moindre choc, d'où des réactions en chaîne.

## Architecture (performances)

- `js/sim.js` : simulation orientée données (tableaux typés, aucun objet par unité), pas fixe de 30 Hz.
  - Grille spatiale reconstruite à chaque tick par tri par comptage (O(n)).
  - Un **flow field** BFS par équipe pour le pathfinding global (contournement des murs et rivières, percée si l'ennemi est enfermé), recalculé de façon échelonnée.
  - Un champ de distance « ennemi le plus proche » par équipe, qui permet aux recherches de cible de sauter les zones vides, plus un cache de cible par cellule et par équipe.
  - Recherche de cible échelonnée par anneaux sur la grille ; collisions résolues en Jacobi sur des tableaux compactés dans l'ordre des cellules (sans biais gauche/droite).
  - Les morts sont résolues simultanément en fin de tick (pas d'avantage au premier qui agit).
- `js/render.js` : WebGL2, **un seul draw call instancié par couche**, tri en profondeur par counting sort, sol procédural en shader, couche persistante de décalques (cadavres, cratères, flèches plantées) dans un framebuffer.
- `js/sprites.js` : tous les sprites sont dessinés procéduralement au démarrage dans un atlas, avec un masque pour la couleur d'équipe.

Ordre de grandeur sur une machine de bureau : environ 9 à 16 ms par tick de simulation pour 50 000 unités en plein combat (scénario « Test de charge »), et moins de 3 ms pour 5 000 à 10 000 unités.
