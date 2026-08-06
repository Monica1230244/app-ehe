import { useState } from 'react';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetails from './pages/OrderDetails';
import CreateOrder from './pages/CreateOrder';
import Clients from './pages/Clients';
import Users from './pages/Users';
import Notifications from './pages/Notifications';
import useNotifications from './hooks/useNotifications';
import NotificationToast from './components/NotificationToast';
import InstallAppButton from './components/InstallAppButton';
import api from './api/client';
import { isSupabaseConfigured } from './api/supabase';

function getStoredUser() {
  try {
    const stored = localStorage.getItem('ehe_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function App() {
  const [user, setUser] = useState(getStoredUser);
  const realtimeNotifications = useNotifications(user);
  const isManager = user && ['revendeur', 'admin'].includes(user.role);

  function handleLogin(currentUser) {
    localStorage.setItem('ehe_user', JSON.stringify(currentUser));
    setUser(currentUser);
  }

  async function handleLogout() {
    await api.logout();
    localStorage.removeItem('ehe_token');
    localStorage.removeItem('ehe_user');
    setUser(null);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Configuration requise</h1>
        <p className="mt-3 text-slate-600">Ajoutez l’adresse et la clé publique Supabase dans les variables de déploiement GitHub.</p>
      </main>
    );
  }

  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <InstallAppButton />
        <NotificationToast message={realtimeNotifications[0]?.message} />
        {user ? (
          <>
            <nav className="flex flex-wrap gap-3 border-b bg-white p-4 text-sm shadow-sm">
              <Link to="/" className="font-medium text-blue-700">Tableau de bord</Link>
              <Link to="/orders" className="font-medium text-blue-700">Commandes</Link>
              {isManager && <Link to="/clients" className="font-medium text-blue-700">Clients</Link>}
              {isManager && <Link to="/create-order" className="font-medium text-blue-700">Nouvelle commande</Link>}
              {isManager && <Link to="/users" className="font-medium text-blue-700">Utilisateurs</Link>}
              <Link to="/notifications" className="font-medium text-blue-700">Notifications</Link>
              <button type="button" onClick={handleLogout} className="font-medium text-red-700">Déconnexion</button>
            </nav>
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              <Route path="/orders" element={<Orders user={user} />} />
              <Route path="/orders/:id" element={<OrderDetails user={user} />} />
              <Route path="/clients" element={isManager ? <Clients /> : <Navigate to="/orders" replace />} />
              <Route path="/create-order" element={isManager ? <CreateOrder /> : <Navigate to="/orders" replace />} />
              <Route path="/users" element={isManager ? <Users /> : <Navigate to="/orders" replace />} />
              <Route path="/notifications" element={<Notifications realtimeNotifications={realtimeNotifications} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        ) : (
          <Routes>
            <Route path="/register" element={<Register onRegister={handleLogin} />} />
            <Route path="/*" element={<Login onLogin={handleLogin} />} />
          </Routes>
        )}
      </div>
    </HashRouter>
  );
}

export default App;
