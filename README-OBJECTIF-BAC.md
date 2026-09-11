# Objectif Bac — version complète

Application Terminale de Lorette, partagée avec Livio.

## Fonctionnalités principales
- Accueil, emploi du temps et calendrier conservés.
- Cours, chapitres, photos/fichiers, synthèses IA et QCM.
- Révisions avec sélection par matière et répétition espacée.
- Devoirs avec statut manuel, photos, notes et échéance facultative.
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
- `AI_API_KEY` = ta clé API
- `AI_BASE_URL` = `https://api.openai.com/v1`
- `AI_MODEL` = le modèle API que tu as choisi

La clé ne doit jamais être mise dans GitHub.

## Déploiement
Le dossier entier peut être envoyé sur GitHub. Netlify doit utiliser la racine du dépôt comme dossier publié et `netlify/functions` comme dossier des Functions (déjà configuré dans `netlify.toml`).

## Compatibilité avec l'ancienne version
Les préfixes techniques de stockage existants sont volontairement conservés pour éviter de perdre les données déjà synchronisées. Le nom public de l'application est désormais **Objectif Bac**.

## Important
Netlify Blobs fournit le stockage partagé du dossier. Comme le projet est une application sans compte utilisateur, toute personne qui connaît l'adresse du site peut théoriquement appeler les fonctions de synchronisation. Pour un usage privé, une authentification/clé de partage dédiée peut être ajoutée ensuite.
