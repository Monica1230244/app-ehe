import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetails from './pages/OrderDetails';
import CreateOrder from './pages/CreateOrder';
import Clients from './pages/Clients';
import Users from './pages/Users';
import Messages from './pages/Messages';
import Accounting from './pages/Accounting';
import Notifications from './pages/Notifications';
import useNotifications from './hooks/useNotifications';
import NotificationToast from './components/NotificationToast';
import InstallAppButton from './components/InstallAppButton';
import Brand from './components/Brand';
import api from './api/client';
import { isSupabaseConfigured, supabase } from './api/supabase';

const allowPublicSignup = import.meta.env.VITE_ALLOW_PUBLIC_SIGNUP === 'true';

function getStoredUser() {
  try {
    const stored = localStorage.getItem('ehe_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function NavIcon({ name }) {
  const paths = {
    dashboard: 'M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-5H4v5Zm10-11h6V4h-6v5Z',
    orders: 'M6 3h12l2 4-8 4-8-4 2-4Zm-2 6 8 4 8-4v9l-8 4-8-4V9Z',
    clients: 'M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM7 13a4 4 0 1 0 0-8 4 4 0 0 0 0 0 8Zm9 1c-3.3 0-6 1.8-6 4v3h12v-3c0-2.2-2.7-4-6-4ZM7 15c-2.8 0-5 1.5-5 3.5V21h6v-3c0-1.1.4-2.1 1.2-2.9A8 8 0 0 0 7 15Z',
    add: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z',
    users: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14Z',
    messages: 'M4 4h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 5v2h12V9H6Zm0 4v2h8v-2H6Z',
    accounting: 'M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4v2h12V7H6Zm0 4v2h5v-2H6Zm8 0v6h4v-6h-4ZM6 15v2h5v-2H6Z',
    notifications: 'M12 22a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2Zm7-6-2-2v-4a5 5 0 0 0-4-4.9V3h-2v2.1A5 5 0 0 0 7 10v4l-2 2v2h14v-2Z'
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function App() {
  const [user, setUser] = useState(getStoredUser);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const realtimeNotifications = useNotifications(user);
  const isManager = user && ['revendeur', 'admin'].includes(user.role);

  function handleLogin(currentUser) {
    localStorage.setItem('ehe_user', JSON.stringify(currentUser));
    setUser(currentUser);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;

    async function restoreSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        try {
          const response = await api.get('/auth/me');
          if (active) handleLogin(response.data.user);
        } catch {
          localStorage.removeItem('ehe_token');
          localStorage.removeItem('ehe_user');
          if (active) setUser(null);
        }
      } else if (getStoredUser()) {
        localStorage.removeItem('ehe_token');
        localStorage.removeItem('ehe_user');
        setUser(null);
      }

      if (active) setAuthReady(true);
    }

    restoreSession();
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    await api.logout();
    localStorage.removeItem('ehe_token');
    localStorage.removeItem('ehe_user');
    setUser(null);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="configuration-screen">
        <Brand />
        <h1>Configuration requise</h1>
        <p>Ajoutez l’adresse et la clé publique Supabase dans les variables de déploiement.</p>
      </main>
    );
  }

  if (!authReady) {
    return <div className="app-loader"><Brand /><span className="loader-ring" /><p>Ouverture de votre espace…</p></div>;
  }

  const navigation = user ? [
    { to: '/', label: 'Aperçu', icon: 'dashboard', end: true },
    { to: '/orders', label: 'Commandes', icon: 'orders' },
    ...(isManager ? [
      { to: '/clients', label: 'Clients', icon: 'clients' },
      { to: '/create-order', label: 'Nouvelle', icon: 'add' },
      { to: '/users', label: 'Équipe', icon: 'users' }
    ] : []),
    { to: '/messages', label: 'Messagerie', icon: 'messages' },
    ...(isManager ? [{ to: '/accounting', label: 'Comptabilité', icon: 'accounting' }] : []),
    { to: '/notifications', label: 'Alertes', icon: 'notifications' }
  ] : [];

  const navigationLinks = navigation.map((item) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  ));

  return (
    <HashRouter>
      <InstallAppButton />
      <NotificationToast notification={realtimeNotifications[0]} />
      {user ? (
        <div className="app-shell">
          <aside className="app-sidebar">
            <Brand inverse />
            <p className="sidebar-section-label">Espace de travail</p>
            <nav className="sidebar-navigation">{navigationLinks}</nav>
            <div className="sidebar-user">
              <span className="user-avatar">{user.nom?.slice(0, 1).toUpperCase()}</span>
              <span><strong>{user.nom}</strong><small>{user.role}</small></span>
              <button type="button" onClick={handleLogout} aria-label="Se déconnecter">↗</button>
            </div>
          </aside>

          <main className="app-main">
            <header className="app-topbar">
              <div>
                <span className="topbar-greeting">Bonjour, {user.nom?.split(' ')[0]}</span>
                <small>Voici l’activité de votre atelier aujourd’hui.</small>
              </div>
              <div className="topbar-actions">
                <span className="online-status"><i /> Données synchronisées</span>
                <button type="button" className="mobile-logout-button" onClick={handleLogout} aria-label="Se déconnecter">
                  <span aria-hidden="true">↗</span>
                  Quitter
                </button>
              </div>
            </header>
            <div className="page-content">
              <Routes>
                <Route path="/" element={<Dashboard user={user} />} />
                <Route path="/orders" element={<Orders user={user} />} />
                <Route path="/orders/:id" element={<OrderDetails user={user} />} />
                <Route path="/clients" element={isManager ? <Clients /> : <Navigate to="/orders" replace />} />
                <Route path="/create-order" element={isManager ? <CreateOrder /> : <Navigate to="/orders" replace />} />
                <Route path="/users" element={isManager ? <Users /> : <Navigate to="/orders" replace />} />
                <Route path="/messages" element={<Messages user={user} />} />
                <Route path="/accounting" element={isManager ? <Accounting /> : <Navigate to="/orders" replace />} />
                <Route path="/notifications" element={<Notifications realtimeNotifications={realtimeNotifications} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>

          <nav className="mobile-navigation">{navigationLinks}</nav>
        </div>
      ) : (
        <Routes>
          <Route path="/register" element={allowPublicSignup ? <Register onRegister={handleLogin} /> : <Navigate to="/" replace />} />
          <Route path="/*" element={<Login onLogin={handleLogin} allowRegistration={allowPublicSignup} />} />
        </Routes>
      )}
    </HashRouter>
  );
}

export default App;
