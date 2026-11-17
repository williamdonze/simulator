# Petit Monde

Un bac à sable d'écosystème : peins des forêts, des prairies, des lacs, ajoute des animaux, et regarde la nature s'organiser toute seule.

Ouvre `index.html` dans un navigateur récent (WebGL2). Aucune installation. Le bouton 🌍 charge une vallée d'exemple.

## Comment jouer

- Choisis une plante, un terrain ou un animal dans la barre du bas et peins sur la carte (taille du pinceau : curseur, `[` `]` ou Maj + molette).
- **▶ Lancer la vie**, puis accélère le temps (×4, ×16) pour voir les saisons et les générations passer.
- **Zoom** : molette (vers le curseur), boutons + / − / ⤢, ou pincement sur mobile. **Se déplacer** : clic droit ou molette enfoncée, Espace + glisser, deux doigts.
- **✋ Attraper / observer** (onglet Outils) : clique sur un animal pour ouvrir sa fiche, glisse-le pour le déplacer (double-clic : fiche depuis n'importe quel outil).
- **Fiche d'un animal** :
  - nom modifiable, sexe, génération, mère ;
  - faim, soif, santé ;
  - ce qu'il a mangé (plantes, viande, miel, eau), ses proies par espèce, ses petits, ses fuites, la distance parcourue ;
  - son journal de vie, et un hommage à sa mort avec la cause ;
  - **🎥 Suivre** : la caméra le suit comme dans un documentaire.
- **📈** : courbes des populations. **📖 Carnet du naturaliste** : 26 phénomènes et secrets à découvrir, enregistrés dans le navigateur.

## Ce qui est simulé

- **Végétation vivante** : l'herbe repousse selon la saison et la pluie. Trop broutée, elle laisse la terre à nu, qui se recolonise ensuite. La forêt gagne lentement sur les prairies. Les écureuils oublient des noix qui deviennent des arbres. Les abeilles pollinisent et les fleurs se répandent. Après un incendie, les cendres redeviennent prairie.
- **Besoins** : faim, soif (il faut de l'eau sur la carte), sommeil selon le rythme de l'espèce (diurne, nocturne, crépusculaire), vieillissement, mort.
- **Reproduction** : mâles et femelles, gestation, portées, petits qui suivent leur mère (les canetons en file indienne). La croissance est freinée par la densité et les saisons.
- **Chaîne alimentaire** :
  - les lapins, cerfs, bisons, souris et écureuils broutent ;
  - le renard, le loup (chasse en meute), le lynx (affût), l'ours (baies, poissons, miel), l'aigle (piqué), le hibou (la nuit) et le héron (pêche à l'affût) chassent ;
  - vautours et corbeaux nettoient les carcasses, qui finissent par fertiliser le sol.
- **Défense** : les proies fuient. Les sangliers et les bisons font front quand un prédateur chasse leur troupeau. Les souris se cachent dans les hautes herbes et les écureuils dans les arbres.
- **Castors** : ils abattent des arbres et construisent des barrages qui créent des étangs.
- **Climat** :
  - cycle jour/nuit ;
  - 4 saisons (baies en été, noix en automne, neige et hibernation des ours en hiver) ;
  - pluie et orages, la foudre pouvant déclencher des incendies.

## Easter eggs

Il y en a plein. Quelques indices :
- un lapin doré ou des animaux albinos naissent parfois ;
- une créature légendaire apparaît dans les écosystèmes très équilibrés ;
- les loups réagissent à la pleine lune, et quelque chose rôde parfois la nuit dans les grandes forêts ;
- relis tes fables de La Fontaine (le renard et le corbeau) ;
- embrasse une grenouille ;
- un arc-en-ciel peut apparaître après la pluie ;
- au clavier, essaie de taper : `nessie`, `dodo`, `bigfoot`, `licorne`, `lune`… et le code Konami.

## Technique

- `js/eco.js` : simulation orientée données (tableaux typés), pas fixe de 30 Hz, grille spatiale avec masques d'espèces par cellule, champs de distance vers l'eau et la forêt, décisions échelonnées.
- `js/render.js` : WebGL2 instancié, sol procédural (végétation, saisons, neige, eau animée), lumière jour/nuit.
- `js/sprites.js` : tous les animaux et plantes sont dessinés par code au démarrage (style cartoon avec contour).
