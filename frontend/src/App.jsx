import { useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import CreateOrder from './pages/CreateOrder';
import Notifications from './pages/Notifications';
import UploadPhoto from './pages/UploadPhoto';
import useNotifications from './hooks/useNotifications';
import NotificationToast from './components/NotificationToast';

function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('ehe_user');
    return stored ? JSON.parse(stored) : null;
  });

  const handleLogin = (currentUser) => {
    localStorage.setItem('ehe_user', JSON.stringify(currentUser));
    setUser(currentUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('ehe_token');
    localStorage.removeItem('ehe_user');
    setUser(null);
  };

  const realtimeNotifications = useNotifications();
  const latestNotification = realtimeNotifications[0];

  const authRoutes = useMemo(
    () => (
      <>
        <nav className="bg-white border-b p-4 flex gap-3 flex-wrap">
          <Link to="/" className="text-blue-600">Tableau de bord</Link>
          <Link to="/orders" className="text-blue-600">Commandes</Link>
          <Link to="/create-order" className="text-blue-600">Créer commande</Link>
          <Link to="/notifications" className="text-blue-600">Notifications</Link>
          <Link to="/upload" className="text-blue-600">Upload photo</Link>
          <button onClick={handleLogout} className="text-red-600">Déconnexion</button>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/create-order" element={<CreateOrder />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/upload" element={<UploadPhoto />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </>
    ),
    []
  );

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <NotificationToast message={latestNotification?.message} />
        {user ? (
          authRoutes
        ) : (
          <Routes>
            <Route path="/register" element={<Register onRegister={handleLogin} />} />
            <Route path="/*" element={<Login onLogin={handleLogin} />} />
          </Routes>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
