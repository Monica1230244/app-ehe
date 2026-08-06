# Modèle de données EHE ERP

## Rôles
- revendeur : crée les commandes, gère les clients et suit l'avancement.
- cordonnier : reçoit les commandes attribuées et met à jour le statut de fabrication.
- admin : supervision globale.

## Principales entités
- users : comptes utilisateurs.
- clients : informations clients.
- commandes : commandes de chaussures personnalisées.
- photos : images liées à une commande.
- notifications : messages envoyés aux utilisateurs.
- commande_statuts : historique des changements de statut.

## Statuts de commande
- en_attente
- en_fabrication
- prete
- livree
- annulee

## Recommandation de mise en place
1. Créer la base PostgreSQL.
2. Exécuter le fichier db.sql.
3. Ajouter un utilisateur de départ via l'API ou directement en base.
4. Connecter l'API backend à la base via DATABASE_URL.
