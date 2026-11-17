# Pinceau de Guerre

Simulateur de batailles massives dans le navigateur : peins des armées (rouges et bleues), des bâtiments et du terrain, puis lance le combat.

Ouvre simplement `index.html` dans un navigateur récent (WebGL2 requis). Aucun serveur ni dépendance.

## Contenu
- **20 unités** aux comportements distincts : paysan (fuit blessé), soldat, lancier (×3 contre cavaliers, brise les charges), chevalier (armure), cavalier (charge et piétinement), archer (tir en cloche, recule), arbalétrier (carreaux perforants), mage (boules de feu), prêtre (soigne, fuit), pavoisier (bloque les flèches de face, attire les coups), berserker (rage), assassin (invisible, traque les tireurs), grenadier (bombes qui projettent), pyromane (cône de feu), nécromancien (relève les morts), squelette, champion (coups balayants), porte-étendard (aura), sapeur (explose sur les bâtiments), roi (aura ; sa mort démoralise l'armée).
- **13 bâtiments** : hutte, caserne, écurie, tour d'archers, château, temple, tour de mage (foudre en chaîne), catapulte, baliste, bombarde (boulet qui rebondit), cimetière, muraille, pieux.
- **Décor** : arbres (couvert, brûlent et propagent le feu), rochers, barils de poudre (réactions en chaîne), eau, boue, lave.
- **Pouvoirs** : météore, foudre, pluie de flèches, incendie, bénédiction, bourrasque, gomme.
- Scénarios prêts à jouer, dont une méga-bataille de ~35 000 soldats.

## Contrôles
- Clic gauche : peindre · clic droit / molette-clic / Espace + glisser : déplacer la vue · molette : zoom
- Mobile : un doigt peint, deux doigts déplacent/zooment
- `Entrée` combat · `P` pause · `R` rejouer · `Tab` changer d'équipe · `[` `]` taille du pinceau · `F` recadrer

## Performances
- Simulation en tableaux typés (structure de tableaux), grille spatiale par équipe reconstruite par tri par comptage à chaque pas, recherche de cibles en anneaux, navigation longue distance via une grille grossière de barycentres.
- IA et séparation des foules calculées un pas sur deux (alternance par unité).
- Rendu WebGL2 : un atlas de sprites généré procéduralement, quads instanciés (2 appels de dessin par image), cadavres/sang/brûlures imprimés dans une texture de sol persistante, herbe précalculée.
