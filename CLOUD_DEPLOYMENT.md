# Mise en ligne EHE ERP

L’architecture en ligne utilise GitHub Pages pour la PWA et Supabase pour l’authentification, PostgreSQL, les photos et la synchronisation en temps réel.

## 1. Créer le projet Supabase

1. Créez un projet sur [Supabase](https://database.new/).
2. Conservez le mot de passe PostgreSQL choisi lors de la création.
3. Dans `Project Settings > API`, récupérez :
   - le `Project URL` ;
   - la `Publishable key` ;
   - le `Project ID` ou `Reference ID`.
4. Dans les paramètres du compte Supabase, créez un `Access Token` personnel.
5. Dans `Authentication > URL Configuration`, définissez le `Site URL` sur `https://monica1230244.github.io/app-ehe/` et ajoutez cette même adresse aux URL de redirection autorisées.

Ne placez jamais la `service_role key` dans GitHub Pages ou dans une variable `VITE_*`.

## 2. Configurer le dépôt GitHub

Dans `Settings > Secrets and variables > Actions`, ajoutez ces variables de dépôt :

- `VITE_SUPABASE_URL` : URL du projet Supabase ;
- `VITE_SUPABASE_PUBLISHABLE_KEY` : clé publique Supabase.

Ajoutez ensuite ces secrets Actions :

- `SUPABASE_ACCESS_TOKEN` : jeton personnel Supabase ;
- `SUPABASE_PROJECT_ID` : identifiant du projet ;
- `SUPABASE_DB_PASSWORD` : mot de passe PostgreSQL du projet.

## 3. Installer la base en ligne

Dans l’onglet `Actions` du dépôt, lancez manuellement le workflow `Deploy Supabase backend`. Il applique la migration SQL sécurisée et déploie la fonction de création des comptes cordonnier/revendeur.

## 4. Publier la PWA

1. Dans `Settings > Pages`, sélectionnez `GitHub Actions` comme source.
2. Dans l’onglet `Actions`, lancez `Deploy EHE ERP PWA`.
3. L’application devient accessible à l’adresse :
   [https://monica1230244.github.io/app-ehe/](https://monica1230244.github.io/app-ehe/)

## 5. Premier démarrage

1. Ouvrez le lien et créez le premier compte revendeur.
2. Confirmez l’email si Supabase le demande, puis reconnectez-vous.
3. Depuis `Utilisateurs`, créez au moins un compte cordonnier.
4. Créez un client puis une commande, choisissez le cordonnier et joignez les trois photos.
5. Connectez-vous comme cordonnier sur un autre appareil : seules les commandes attribuées apparaissent.

## Installation mobile

- Android/Chrome : menu du navigateur, puis `Installer l’application` ou `Ajouter à l’écran d’accueil`.
- iPhone/iPad/Safari : bouton `Partager`, puis `Sur l’écran d’accueil`.

La PWA doit rester servie en HTTPS pour être installable ; GitHub Pages fournit automatiquement HTTPS.
