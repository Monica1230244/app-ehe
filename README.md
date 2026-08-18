# EHE ERP

Application PWA de gestion de fabrication de chaussures sur mesure. Elle permet au revendeur de gérer ses clients et commandes, et au cordonnier de suivre uniquement les commandes qui lui sont attribuées.

## Version en ligne recommandée

- GitHub Pages héberge l’application installable sur Android et iOS.
- Supabase fournit l’authentification, PostgreSQL, le stockage sécurisé des photos et les mises à jour en temps réel.
- Le guide complet se trouve dans [`CLOUD_DEPLOYMENT.md`](CLOUD_DEPLOYMENT.md).
- L’URL prévue est [https://monica1230244.github.io/app-ehe/](https://monica1230244.github.io/app-ehe/).

## Fonctionnalités

- comptes revendeur et cordonnier avec accès par rôle ;
- gestion des clients, de leur historique et des commandes ;
- galerie privée de modèles avec photo, référence, recherche et archivage ;
- catalogue public partageable par lien, panier client et réception privée des demandes par le revendeur, avec défi anti-robot, limitation des envois et liens clients personnels expirant après 3 jours ;
- commande multi-paires avec plusieurs lignes de modèles, couleurs, pointures, matières, semelles et quantités, galerie de modèles, photos facultatives des pieds et attribution d’un cordonnier ;
- suivi contrôlé : attente, fabrication, prête, livrée ou annulée ;
- message WhatsApp de commande prête utilisant la civilité `Mr` ou `Mme` enregistrée sur la fiche client ;
- conversation sécurisée par commande entre revendeur et cordonnier, avec notifications en temps réel ;
- comptabilité privée du revendeur par variante et par paire, avec coût cordonnier, prix de vente et bénéfices automatiquement totalisés en FCFA ;
- statistiques mensuelles du revendeur : ventes livrées, chiffre d’affaires, bénéfice et évolution sur douze mois ;
- recherche, filtres et historique de statut ;
- interface PWA adaptée au mobile.

## Prérequis

- Node.js 18 ou plus récent ;
- Docker Desktop pour démarrer PostgreSQL localement.

## Démarrage local

1. Copiez `.env.example` vers `.env` et choisissez un mot de passe PostgreSQL local.
2. Copiez `backend/.env.example` vers `backend/.env`, puis adaptez `DATABASE_URL` avec les mêmes identifiants.
3. Générez une longue valeur aléatoire pour `JWT_SECRET` dans `backend/.env`.
4. Lancez la base : `docker compose up -d db`.
5. Installez les dépendances : `cd backend; npm install`, puis `cd ../frontend; npm install`.
6. Dans deux terminaux, lancez `cd backend; npm run dev` et `cd frontend; npm run dev`.
7. Ouvrez [http://localhost:5173](http://localhost:5173), créez le premier compte revendeur, puis créez les comptes cordonnier depuis le menu Utilisateurs.

La base est initialisée automatiquement à partir de `backend/src/db.sql` lors du premier démarrage du conteneur. Pour repartir de zéro, arrêtez les services puis supprimez explicitement le volume Docker `ehe-erp_ehe_erp_postgres_data` avant de relancer la base.

## Vérifications

- API : `cd backend; npm test`
- Interface : `cd frontend; npm run build`
- Santé de l’API : [http://localhost:4000/health](http://localhost:4000/health)

## Livraison client

Avant remise, désactivez les inscriptions publiques dans Supabase, créez les comptes nécessaires depuis l’espace revendeur et testez une commande complète avec les trois photos. La PWA est publiée sur GitHub Pages et les données sont conservées dans Supabase ; prévoyez également une procédure régulière d’export ou de sauvegarde des données.
