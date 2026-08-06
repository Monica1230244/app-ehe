import { useEffect, useState } from 'react';
import api from '../api/client';

const emptyForm = { nom: '', email: '', password: '', role: 'cordonnier' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');

  async function loadUsers() {
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data.users);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de charger les utilisateurs.');
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function submitUser(event) {
    event.preventDefault();
    try {
      const response = await api.post('/auth/users', form);
      setUsers((current) => [...current, response.data.user].sort((first, second) => first.nom.localeCompare(second.nom)));
      setForm(emptyForm);
      setMessage('Compte créé.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de créer le compte.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <p className="mt-1 text-sm text-slate-600">Créez ici les comptes cordonnier ou revendeur autorisés.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={submitUser}>
          <input className="rounded border px-3 py-2" placeholder="Nom" value={form.nom} onChange={(event) => setForm({ ...form, nom: event.target.value })} required />
          <input className="rounded border px-3 py-2" type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          <input className="rounded border px-3 py-2" type="password" minLength="8" placeholder="Mot de passe (8 caractères min.)" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <select className="rounded border px-3 py-2" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="cordonnier">Cordonnier</option>
            <option value="revendeur">Revendeur</option>
          </select>
          <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white md:col-span-2">Créer le compte</button>
        </form>
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="divide-y">
          {users.map((user) => <div key={user.id} className="flex justify-between gap-4 py-3"><span>{user.nom}<small className="ml-2 text-slate-500">{user.email}</small></span><strong className="capitalize text-slate-700">{user.role}</strong></div>)}
        </div>
      </section>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
