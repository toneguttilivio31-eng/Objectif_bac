# Objectif Bac — version complète

Application Terminale de Lorette, partagée avec Livio.

## Fonctionnalités principales
- Accueil, emploi du temps et calendrier conservés.
- Cours, chapitres, photos/fichiers, retranscription des photos, cours structuré, résumé court, notions, flashcards, QCM et ressources vidéo.
- Révisions avec sélection par matière et répétition espacée.
- Devoirs avec statut manuel, matière, énoncé, photos, notes, analyse IA facultative et échéance facultative.
- Devoirs **sans date**, **date à confirmer** ou **date précise** ; un devoir sans date n'est jamais considéré comme en retard.
- Notes et moyenne.
- Onglet **Bac 2027** avec les épreuves pertinentes pour Lorette.
- HGGSP et SES sont les **deux spécialités** de Lorette.
- Histoire-Géographie et Mathématiques ont chacune leur propre catégorie pour les cours et les révisions.
- Grand oral relié aux spécialités.
- IA via `/.netlify/functions/ai` : aucune clé API dans le navigateur.
- Lecture de PDF/DOCX/TXT/MD via `extract-document`.
- Synchronisation réelle entre appareils via Netlify Blobs.

## Bac général — session 2027
- Contrôle continu : 40 %.
- Épreuves terminales : 60 %.
- HGGSP : coef 16.
- SES : coef 16.
- Philosophie : coef 8.
- Grand oral : coef 8.
- Français : écrit coef 5 + oral coef 5, épreuves anticipées de Première.
- Mathématiques : épreuve anticipée écrite coef 2, épreuve de Première pour la session 2027.
- Histoire-Géographie, LVA, LVB, enseignement scientifique et EPS participent au contrôle continu ; EPS est coef 6.

## Variables Netlify pour l'IA
Dans Netlify → Project configuration → Environment variables :
- `OPENROUTER_API_KEY` = ta clé API OpenRouter
- `OPENROUTER_MODEL` = `google/gemma-4-26b-a4b-it:free` (facultatif)
- `OPENROUTER_FALLBACK_MODEL` = `google/gemma-4-31b-it:free` (facultatif)
- `GEMINI_API_KEY` = ta nouvelle clé Google AI Studio (recommandé pour les photos)
- `GEMINI_MODEL` = `gemini-3.8-flash` (facultatif ; le serveur essaie ensuite `gemini-3.7-flash` puis `gemini-flash-latest` en secours)
- `SITE_URL` = l'adresse publique de ton site (facultatif)

L'IA passe par `/.netlify/functions/ai`. La clé ne doit jamais être mise dans GitHub ni dans `index.html`.

## Déploiement
Le dossier entier peut être envoyé sur GitHub. Netlify doit utiliser la racine du dépôt comme dossier publié et `netlify/functions` comme dossier des Functions (déjà configuré dans `netlify.toml`).

## Compatibilité avec l'ancienne version
Les préfixes techniques de stockage existants sont volontairement conservés pour éviter de perdre les données déjà synchronisées. Le nom public de l'application est désormais **Objectif Bac**.

## Important
Netlify Blobs fournit le stockage partagé du dossier. La synchronisation remplace la valeur partagée par l'état complet envoyé par l'application : une suppression ne peut donc plus être ressuscitée par une ancienne liste serveur. Comme le projet est une application sans compte utilisateur, toute personne qui connaît l'adresse du site peut théoriquement appeler les fonctions de synchronisation. Pour un usage privé, une authentification/clé de partage dédiée peut être ajoutée ensuite.

## IA OpenRouter

La clé doit être ajoutée dans Netlify avec le nom exact `OPENROUTER_API_KEY` et rester uniquement côté serveur.

Variables facultatives :
- `OPENROUTER_MODEL` : modèle principal (par défaut `google/gemma-4-26b-a4b-it:free`)
- `OPENROUTER_FALLBACK_MODEL` : modèle de secours (par défaut `google/gemma-4-31b-it:free`)

La Function IA utilise le fallback OpenRouter et effectue aussi une seconde tentative explicite sur le modèle de secours si nécessaire. Le bouton de diagnostic appelle `ai-health` et affiche désormais l'erreur réelle renvoyée par OpenRouter.


## V10 — Coaching & gamification
- Coaching quotidien inspiré des meilleures mécaniques de révision : série, objectif hebdomadaire, défis, trophées et divisions personnelles.
- XP avec récompenses lors des sessions, QCM, cours, objectifs et devoirs terminés.
- Flashcards interactives : toucher une carte pour révéler la réponse.
- Espace Coaching dédié, sans faux classement entre élèves.
- Conservation de l'emploi du temps, calendrier et modules Objectif Bac existants.


## IA multimodale et photos

Les photos sont envoyées directement au serveur et, lorsque `GEMINI_API_KEY` est configurée, le serveur essaie Gemini en priorité pour les tâches avec images. Le modèle par défaut est `gemini-3.8-flash`. Si Gemini est indisponible ou atteint une limite, OpenRouter sert de secours.

Les Cours et les Devoirs traitent plusieurs photos par petits lots (2 images par appel), puis utilisent une seconde requête texte pour structurer le résultat. Cela évite de faire une seule requête géante susceptible de dépasser le délai d'une Function Netlify.

La discussion IA sans photo continue d'utiliser le chemin OpenRouter existant.
