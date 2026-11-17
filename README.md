# Petit Monde

Un simulateur de monde vivant et un *god game* : crée une vallée, peuple-la, puis regarde la nature écrire son histoire (sécheresses, migrations, épidémies, adaptations, extinctions, renaissances). Tu peux aussi intervenir en divinité, avec des conséquences réelles et parfois imprévisibles.

Ouvre `index.html` dans un navigateur récent (WebGL2). Aucune installation. Le bouton globe crée un **monde aléatoire** : relief, rivières et lacs (parfois presque pas d'eau), forêts, prairies, et une faune tirée selon l'habitat. Tu peux fixer l'eau, la forêt ou les prédateurs pour comparer, ou rejouer un monde à partir de son numéro (Chronique → « Rejouer ce monde »).

## Comment jouer

- Choisis une plante, un terrain ou un animal dans la barre du bas et peins sur la carte (taille du pinceau : curseur, `[` `]` ou Maj + molette).
- **Lancer la vie**, puis accélère le temps (×4, ×16, ×64 ≈ 2 min par an) ou fais un voyage dans le temps.
- **Calendrier réel** : années de 364 jours, saisons de 3 mois, dates. Un jour dure 24 s à ×1. Âges, gestations, maturité et longévité suivent la vraie biologie (un cerf vit une dizaine d'années, un lapin deux, une souris un an).
- **Zoom** : molette (vers le curseur), boutons + / − / ⤢, ou pincement sur mobile. **Se déplacer** : clic droit ou molette enfoncée, Espace + glisser, deux doigts.
- **Pouvoirs divins** (bouton étoile en bas à droite) : 34 pouvoirs en six catégories (Création, Destruction, Climat, Vie, Évolution, Monde). Choisis un pouvoir, règle ses paramètres (espèce, caractère, sens…), vise sur la carte (le cercle montre la zone), puis confirme. Trois modes :
  - **Libre** : interventions illimitées ;
  - **Divin équilibré** : énergie divine qui se recharge (plus vite quand le monde est calme), et temps de recharge ;
  - **Expérimental** : intensité, rayon et durée réglables.
- **Fil d'actualité** (à droite) : les événements importants de la vallée. Clique dessus pour y envoyer la caméra.
- **Inspecter** (onglet Outils, loupe) : clique sur une région pour voir ses biomes, son humidité, ses habitants, ses risques, les événements en cours et son histoire. Clique sur une espèce pour sa fiche historique (record, extinctions, adaptations, individus remarquables).
- **Attraper / observer** (onglet Outils) : clique sur un animal pour ouvrir sa fiche, glisse-le pour le déplacer (double-clic : fiche depuis n'importe quel outil).
- **Fiche d'un animal** :
  - nom modifiable, sexe, génération, mère, caractère et territoire ;
  - ce qu'il fait en ce moment (sieste, exploration, toilette, jeu, habitude de son espèce…) ;
  - faim, soif, santé ;
  - ce qu'il a mangé (plantes, viande, miel, eau), ses proies par espèce, ses petits, ses fuites, la distance parcourue ;
  - son journal de vie, et un hommage à sa mort avec la cause ;
  - **🎥 Suivre** : la caméra le suit comme dans un documentaire.
- **Graphiques** (bouton courbe) : onglets Populations, Évolution (gènes moyens par espèce), Chronique (toute l'histoire, filtrable, cliquable) et Écosystème (santé, naissances et morts, biomes, climat, risques, événements en cours, individus remarquables).
- **Carnet du naturaliste** (bouton livre) : 32 phénomènes et secrets à découvrir, enregistrés dans le navigateur.
- **Sauvegarder / charger** : dans le panneau Nouveau monde (bouton globe). Sauvegarde dans le navigateur, export et import d'un fichier `.json`.

## Ce qui est simulé

- **Végétation vivante** : l'herbe repousse selon la saison et la pluie. Trop broutée, elle laisse la terre à nu, qui se recolonise ensuite. La forêt gagne lentement sur les prairies. Les écureuils oublient des noix qui deviennent des arbres. Les abeilles pollinisent et les fleurs se répandent. Après un incendie, les cendres redeviennent prairie.
- **Besoins** : faim, soif (il faut de l'eau sur la carte), sommeil selon le rythme de l'espèce (diurne, nocturne, crépusculaire), vieillissement, mort.
- **Individualité** : chaque animal a son caractère (curieux ou casanier, téméraire ou craintif, sociable ou solitaire, paresseux ou infatigable, rapide ou lent, lève-tôt ou couche-tard), hérité en partie de sa mère. Il a aussi ses propres seuils de faim et de soif et son métabolisme.
- **Territoire** : chacun vit dans son domaine vital. Il va boire puis rentre chez lui, et anticipe sa soif selon la distance de l'eau. Devenus adultes, les jeunes quittent leur famille pour fonder leur territoire ; dans les hardes, les femelles restent. Les prédateurs solitaires ne se reproduisent pas si le coin est déjà occupé, et une seule meute par territoire.
- **Vie quotidienne** : repos et siestes aux heures chaudes, exploration (les plus curieux s'aventurent au-delà de leur territoire), guet, toilette, jeux des petits qui tètent leur mère, et une habitude propre à chaque espèce : bonds de joie du lapin, mulot chassé au bond par le renard, bain de boue du sanglier, ours qui se frotte aux arbres, hurlements de la meute, aigle qui monte dans un courant chaud, poisson qui saute, héron sur une patte… Les troupeaux se synchronisent : quand l'un se couche, les autres suivent souvent.
- **Génétique** : chaque animal porte 10 gènes (vitesse, taille, vue, fourrure, immunité, audace, curiosité, sociabilité, paresse, rythme). Chaque petit hérite d'un mélange de ses deux parents, avec des mutations. Chaque gène a un coût : être rapide, grand ou résistant consomme plus d'énergie. Les prédateurs attrapent d'abord les lents, les vieux et les malades, les femelles préfèrent les mâles vigoureux, et une fourrure épaisse aide l'hiver mais donne soif l'été. La sélection naturelle fait donc évoluer les espèces au fil des générations (onglet **Évolution**).
- **Saisons de reproduction** : comme dans la nature, le brame et les accouplements des cerfs ont lieu en automne, avec naissances au printemps ; les loups, renards et lynx s'accouplent en hiver ; les oiseaux nichent au printemps. Les lapins et les souris font plusieurs portées. Un prédateur n'élève des petits que s'il y a assez de proies.
- **Arbres** : jeunes pousses, arbres qui grandissent, graines qui colonisent les alentours, vieux arbres qui tombent et ouvrent des clairières. Les buissons pionniers reviennent sur les cendres et les prairies non broutées, puis deviennent forêt. Trop de cerfs, et les jeunes pousses sont broutées : la forêt ne se renouvelle plus.
- **Directeur d'événements** : chaque jour, il lit l'état du monde (populations et tendances, naissances, morts et leurs causes, nourriture, eau, humidité des sols, température, biomes, rapport prédateurs/proies, diversité génétique) et calcule des risques (famine, épidémie, incendie, surpopulation, extinction, pression migratoire, déséquilibre). Il tire les événements selon ces risques, en alternant périodes calmes et crises : après une crise majeure vient une accalmie, et les longues accalmies font monter la tension. Il gère aussi les délais de réapparition, les incompatibilités et les événements simultanés.
- **30 événements**, chacun avec des effets réels :
  - **Climat** : canicule, sécheresse prolongée, hiver extrême, tempête, pluies torrentielles, période humide ;
  - **Catastrophes** : grand incendie, super-incendie, inondation, séisme (failles, mares créées ou drainées), éruption volcanique (seulement s'il y a un massif rocheux), glissement de terrain ;
  - **Écologie** : surpopulation, famine, effondrement d'une population de proies (les prédateurs changent de proies), explosion démographique, expansion d'une espèce dominante, disparition d'une espèce, effondrement de l'écosystème ;
  - **Biologie** : épidémie, mutation exceptionnelle, invasion biologique (une population étrangère aux gènes différents), parasites, consanguinité ;
  - **Évolution et histoire** : apparition d'une adaptation, divergence de populations, recolonisation, migration exceptionnelle, extinction régionale, renaissance d'un écosystème.
- **Chaînes de conséquences** : un événement peut en préparer d'autres, mais la suite n'arrive que si le monde est vraiment dans cet état. Exemples : pluies torrentielles → crue, glissement de terrain ; sécheresse → famine → migrations → effondrement des proies → prédateurs qui changent de proies, puis renaissance. Une épidémie peut mener à une adaptation de l'immunité. Les événements simultanés interagissent : la pluie écourte une sécheresse, le gel tue les parasites.
- **Climat à long terme** : des régimes climatiques durent plusieurs années (années humides ou sèches, période froide ou chaude). L'humidité du sol est suivie région par région. Les lacs se retirent lors des longues sécheresses et se remplissent dans leur ancien bassin les années humides. Les sols nus s'étendent par désertification puis reverdissent. Le sol garde des traces : les cendres et le limon le rendent fertile, puis l'effet s'estompe.
- **Migrations collectives** : chaque semaine, chaque population compare sa région aux autres (nourriture par bouche, eau, prédateurs ou proies, humidité). Les troupeaux partent ensemble, les solitaires un par un (les curieux et les téméraires d'abord). Il existe aussi des migrations saisonnières (cerfs, bisons, canards, corbeaux) et des colonisations de territoires vides. Les gènes se mélangent quand les populations se rencontrent.
- **Espèces invasives** : une population venue d'ailleurs, aux gènes différents, très fertile au début. Elle réussit ou échoue selon l'habitat, les proies, les prédateurs et la sélection naturelle.
- **Mémoire du monde** : la chronique enregistre les événements avec leur gravité, leur date, leur région et leurs conséquences. Elle repère aussi les individus remarquables : fondateurs, ancêtres de grandes lignées, derniers de leur espèce, survivants de catastrophes, porteurs d'une mutation rare. Chaque espèce a une fiche historique. L'archivage est léger : seuls les faits et les statistiques sont gardés, pas les trajectoires.
- Rien n'est équilibré artificiellement : des espèces peuvent disparaître, voire toute la vallée. C'est fait pour observer.
- **Voyage dans le temps** : avance de 1 à 25 ans en accéléré, puis lis le rapport : naissances, morts et leurs causes, catastrophes, disparitions, évolution génétique de chaque espèce, populations avant/après. La **Chronique** garde l'histoire de la vallée.
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

Scripts classiques (pas de build), espace de noms global `G`, simulation orientée données (tableaux typés).

| Fichier | Rôle |
|---|---|
| `js/defs.js` | espèces (biologie réelle), terrains, tables de proies et de nourriture |
| `js/rng.js` | générateur pseudo-aléatoire central (mulberry32, graine) |
| `js/bus.js` | bus d'événements (publication / abonnement) |
| `js/eco.js` | moteur : animaux, gènes, comportements, plantes, feu, météo, effets sur le monde (`S.fxw`) |
| `js/regions.js` | 12 régions nommées et leurs statistiques |
| `js/climate.js` | régimes climatiques, température, humidité des sols, transformation lente des terres |
| `js/events/conditions.js` | indicateurs et risques calculés chaque jour |
| `js/events/registry.js` | catalogue des 30 événements |
| `js/events/chains.js` | conséquences programmées, réactions aux faits publiés, interactions |
| `js/events/director.js` | directeur : rythme, délais, limites, déclenchement, effets agrégés |
| `js/migration.js` | migrations de crise, saisonnières, colonisation |
| `js/history.js` | chronique, fiches d'espèces, individus remarquables |
| `js/powers.js` | les 34 pouvoirs divins et les trois modes |
| `js/save.js` | sauvegarde et chargement complets |
| `js/worldgen.js` | génération procédurale avec graine |
| `js/ui.js`, `js/godui.js` | interface, panneau divin, fil d'actualité, inspecteur, statistiques |

**Fréquences de mise à jour** : animaux à chaque pas (décisions tous les 6 pas, en décalé), plantes tous les 10 pas, feu tous les 3, monde et effets du directeur tous les 5. Le directeur, la chronique et le climat tournent une fois par jour, les statistiques régionales tous les 3 jours, les migrations une fois par semaine.

**Reproductibilité** : tout le hasard de la simulation passe par `G.rand()`. La même graine, les mêmes actions et le même pas de temps donnent exactement la même histoire, ce que vérifie un test. Il reste trois sources de non-déterminisme : les particules visuelles, les coups de pinceau du joueur, et le nombre de pas par image en temps réel (il dépend de la machine). Le voyage dans le temps, lui, est reproductible.

**Tests** : `node tests/run.js` (complet, quelques minutes) ou `node tests/run.js quick`. Ils couvrent la génération, la reproductibilité, la reproduction et la mortalité, la sauvegarde et le chargement, chaque événement du catalogue, les effets réels des catastrophes, les chaînes, les migrations, le directeur sur plusieurs graines (variété, rareté des événements majeurs, pas d'emballement), une grande population (performance), les 34 pouvoirs et une simulation de 10 ans. Ils vérifient aussi l'absence de NaN et de populations négatives.


- `js/eco.js` : simulation orientée données (tableaux typés), pas fixe de 30 Hz, grille spatiale avec masques d'espèces par cellule, champs de distance vers l'eau et la forêt, décisions échelonnées.
- `js/render.js` : WebGL2 instancié, sol procédural (végétation, saisons, neige, eau animée), lumière jour/nuit.
- `js/sprites.js` : tous les animaux et plantes sont dessinés par code au démarrage (style cartoon avec contour).
