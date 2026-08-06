import { useState } from 'react';
import api from '../api/client';

export default function UploadPhoto() {
  const [commandeId, setCommandeId] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!commandeId || !file) {
      setMessage('Veuillez choisir un fichier et renseigner l’ID de commande.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadResp = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const { url } = uploadResp.data.file;
      await api.post('/photos', {
        commande_id: commandeId,
        type_photo: 'modele',
        storage_path: url,
        file_name: file.name
      });
      setMessage('Photo uploadée avec succès.');
      setFile(null);
    } catch (err) {
      console.error(err);
      setMessage('Erreur lors de l’upload.');
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Upload photo</h1>
      <form className="space-y-4" onSubmit={handleUpload}>
        <div>
          <label className="block text-sm font-medium">ID commande</label>
          <input
            value={commandeId}
            onChange={(e) => setCommandeId(e.target.value)}
            className="w-full rounded border px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Fichier</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full"
            required
          />
        </div>
        <button className="bg-green-600 text-white rounded px-4 py-2">Envoyer</button>
      </form>
      {message && <div className="mt-4 text-sm">{message}</div>}
    </div>
  );
}
