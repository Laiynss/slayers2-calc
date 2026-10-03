# Slayers 2 : Calculateur & Optimiseur (site statique)

Ouvrir `site/index.html` par double-clic : ça marche en `file://`, sans serveur ni réseau. Toutes les données sont incluses dans `site/js/data.js`.

## Structure
- `site/index.html`, `site/css/style.css`
- `site/js/data.js` : **généré**, ne pas éditer à la main (`window.PS2_DATA`)
- `site/js/config.js` : **formule active** et constantes (base M1, cadence M1, modes, arrondi…)
- `site/js/engine.js` : calcul (une seule implémentation de formule, `core()`), rotation, validation
- `site/js/optimizer.js` : élagage par dominance puis recherche exhaustive
- `site/js/app.js` : interface (FR). L'état est sauvé dans le `localStorage` (clé `ps2calc_v1`)
- `tools/build_data_js.py` : regroupe `data/*.json` dans `site/js/data.js`
- `tools/headless_test.py` : test Chrome headless (erreurs console + captures dans `screenshots/`)

## Mettre à jour les données (sans toucher au code)
1. Les JSON dans `data/` ont été restaurés depuis le bundle livré : ils sont maintenant les sources locales du site. L'ancien `../build_data.py` n'est pas présent dans cette copie. Ne pas lancer le générateur historique `make_site_data_once.py` : il contient d'anciens modèles.
2. Modifier les données nécessaires dans `data/`. Les règles actuelles utilisent cinq emplacements partagés, sans plafond par type ; conserver les règles existantes. Les valeurs de dégâts et d'incantation absentes restent `null`.
3. Régénérer le bundle : `python3 site/tools/build_data_js.py` (depuis `ps2-calc/`).

Le résolveur extrait arrondit ses résultats à trois décimales. Cet arrondi ne prouve pas la formule d'application des dégâts.

## Changer de formule
Dans `site/js/config.js`, `formula: 'F2'` choisit un modèle exploratoire (F1 à F6), pas une formule récupérée du jeu. Le pool de statistiques additif est établi dans le résolveur extrait ; l'équation finale du M1 n'y est pas établie. Voir `.cache/import/DAMAGE_SOURCE_AUDIT.md`. Le menu de l'en-tête permet un essai temporaire sans modifier le fichier.

## Tests
`../.venv/bin/python site/tools/headless_test.py` (Playwright + Chrome) : doit afficher `"errors": []`.

## Déploiement
Copier le dossier `site/` tel quel (il ne contient que le site) sur GitHub Pages, Netlify (glisser-déposer) ou n'importe quel hébergeur statique. Aucun build n'est nécessaire.

Projet de fan non officiel. Les sources restent dans `data/*.json` ; l'interface ne supprime plus les notes d'incertitude. Un classement optimal dans un modèle n'est pas une preuve de maximum en jeu.

### Audit des contrats de statistiques

`node tools/test_damage_source.cjs` lit les sources Luau sans les exécuter et vérifie les corrections de titres, collection, arrondi, progression et les 191 champs de stats comparables au catalogue extrait. Les tests exhaustifs de recherche restent distincts de cette vérification.

## Recherche

Les recherches de builds s'exécutent désormais en arrière-plan, sans bloquer
les menus, même depuis `index.html` ouvert directement. Un nouveau calcul
remplace le précédent ; « Annuler le calcul » permet de l'arrêter. Les calculs
identiques récents utilisent un cache local borné. Les alternatives ne sont
pas un Top N exhaustif. Audit et critères : `.cache/import/OPTIMISATION.md`.
Tous les sélecteurs d'objets (5 équipements, arme, titres, clan, art, style, listes de l'optimiseur) sont des listes avec recherche (`site/js/combobox.js`) : filtrage en direct, insensible à la casse et aux accents, correspondance partielle n'importe où dans le nom (ex. « lant » → toutes les lanternes). Clavier : ↑/↓, Entrée, Échap. Les objets interdits par la règle restent grisés avec la raison. La Base de données a la même recherche par nom.

## Thème / interface
Thème encre et washi, accents cramoisi et or (`css/style.css`). Polices embarquées dans `css/fonts.css` (data URI, fonctionne hors ligne en double-cliquant) : sous-ensembles de BIZ UDPMincho Bold (titres, chiffres) et Inter (texte), licence SIL OFL 1.1 (`fonts/OFL-*.txt`). Le panneau de résultats met en avant le coup normal, le 5e coup et le DPS, avec la répartition de l'AD et des facteurs par source. Mise en page adaptée au mobile, et animations désactivées si le système le demande (prefers-reduced-motion). Les formules, les données et les résultats sont inchangés.

## Mise à jour des données (27/09/2026)
- Base enrichie : 129 équipements (dont capes/boas, kata-aki, lanternes), 56 armes (9 armes Damascus, Oceanwave Katana), 50 titres (buffs équipés et passifs débloqués, conditions, 17 titres « Perfected » liés à leur art), aliases pour les anciens noms.
- L'onglet Base de données affiche maintenant les stats secondaires, l'obtention des objets et les compétences connues des arts.
- Les captures d'écran ne sont pas incluses dans le zip. Pour les régénérer : `python tools/headless_test.py` (les écrit dans `screenshots/`).

## Complément depuis l'export local (28/09/2026)

- Les bonus défensifs et de déplacement sont directement calculés dans le Calculateur et la comparaison A/B. Les statistiques secondaires d'arme suivent le tier/raffinage pris en charge.
- Les objets disponibles se sélectionnent directement dans « Meilleur build » et « Optimiseur », sans passer par la BD ; la recommandation se charge dans le calculateur.
- 158 équipements (+26), 57 armes conservées ; trois équipements explicitement non obtenables restent dans la base mais sont exclus des sélections et de l'optimiseur.
- Nouveaux onglets **Tous les objets** (439 définitions) et **Compétences** (88 entrées, 20 arts/styles) : noms du module, cooldowns, endurance, maintien maximal et boss associés lorsqu'ils sont définis.
- Recherche par nom, art, famille ou obtention ; magasins et prix publiés visibles dans le catalogue. Un prix non publié reste vide. Le champ `Price` d'un module n'est pas assimilé au prix d'achat du marchand.
- Six projections manquantes ont été recalculées par parsing AST sous un nom temporaire ASCII ; aucun script du jeu exécuté. Les octets de source et leurs empreintes sont conservés dans la provenance.
- Les dégâts, nombres de coups et temps d'incantation manquants ne sont pas inventés. La formule M1 et les mesures antérieures restent inchangées.

Depuis la racine du projet :

```text
python -X utf8 -B tools/enrich_from_export.py ../rift_hunter/out/PS2/llm_package_final/PS2_data.zip --ast CHEMIN_LOCAL_VERS_LUAU_AST
python -X utf8 -B tools/build_data_js.py
python -X utf8 -B -m unittest discover -s tools -p "test_*.py"
```

`--ast` est facultatif : sans parseur, les tables indisponibles sont signalées, pas supposées. L'archive d'entrée et Rift Hunter ne sont jamais modifiés. Consulter `.cache/import/COMPLEMENTS.md` et `.cache/import/EXPORT_AUDIT.json` pour les limites et preuves.

## Capture et mémoire du 29/09/2026

La nouvelle capture est intégrée : 447 définitions, 99 recettes, 52 quêtes et
80 NPC avec leurs récompenses configurées. Les onglets **Fabrication** et
**Butins & NPC** permettent de calculer les matériaux et de rechercher les sources
de butin. Les recommandations montrent les acquisitions vérifiées.
Les 12 tables de coffres sont présentes mais leurs identifiants d’objets sont
masqués dans l’export ; ils ne sont pas supposés. La formule M1 reste une simulation.
Méthode, commandes et limites : `.cache/import/COMPLEMENTS_20260929.md`.

