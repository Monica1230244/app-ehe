# Checklist de livraison EHE ERP

1. Configurer les fichiers `.env` avec un mot de passe PostgreSQL et un `JWT_SECRET` propres au client.
2. Démarrer la base avec `docker compose up -d db`.
3. Démarrer l’API et vérifier `http://localhost:4000/health`.
4. Démarrer l’interface et vérifier `http://localhost:5173` sur ordinateur et téléphone.
5. Créer le compte revendeur initial, puis les comptes cordonnier nécessaires.
6. Ajouter un modèle au stock et créer une commande en le sélectionnant dans la galerie.
7. Créer une autre commande avec une nouvelle photo de modèle et vérifier que les photos des pieds restent facultatives.
8. Vérifier le parcours cordonnier : attente, en fabrication, prête.
9. Vérifier le parcours revendeur : notification reçue, puis confirmation de livraison.
10. Conserver le mot de passe PostgreSQL, le `JWT_SECRET` et une sauvegarde régulière du volume Docker dans un emplacement privé.
