import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { supabase } from '../api/supabase';
import OrderConversation from '../components/OrderConversation';

const statusLabels = {
  en_attente: 'En attente',
  en_fabrication: 'En fabrication',
  prete: 'Prête',
  livree: 'Livrée',
  annulee: 'Annulée'
};

function shortDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function latestByOrder(messages) {
  const latest = new Map();
  messages.forEach((message) => {
    if (!latest.has(message.commande_id)) latest.set(message.commande_id, message);
  });
  return latest;
}

export default function Messages({ user }) {
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([api.get('/commandes'), api.get('/messages')])
      .then(([ordersResponse, messagesResponse]) => {
        if (!active) return;
        const assignedOrders = ordersResponse.data.commandes.filter((order) => order.cordonnier_id);
        setOrders(assignedOrders);
        setMessages(messagesResponse.data.messages);
        setSelectedOrderId((current) => current || assignedOrders[0]?.id || null);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Impossible de charger la messagerie.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const channel = supabase
      .channel(`messagerie:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'commande_messages'
      }, (payload) => {
        setMessages((current) => [payload.new, ...current.filter((message) => message.id !== payload.new.id)]);
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  const latestMessages = useMemo(() => latestByOrder(messages), [messages]);
  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr');
    return [...orders]
      .filter((order) => {
        if (!normalizedSearch) return true;
        return [order.numero_commande, order.client_nom, order.cordonnier_nom, order.revendeur_nom, order.modele]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(normalizedSearch);
      })
      .sort((first, second) => {
        const firstDate = latestMessages.get(first.id)?.created_at || first.date_creation;
        const secondDate = latestMessages.get(second.id)?.created_at || second.date_creation;
        return new Date(secondDate) - new Date(firstDate);
      });
  }, [latestMessages, orders, search]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  if (loading) {
    return <div className="page-loader"><span className="loader-ring" /><p>Ouverture de la messagerie…</p></div>;
  }

  return (
    <div className="page-shell space-y-5">
      <div className="page-header">
        <div>
          <h1>Messagerie</h1>
          <p>Échangez directement entre revendeur et cordonnier pour chaque commande.</p>
        </div>
        <span className="messaging-security"><i /> Conversations privées</span>
      </div>

      {error && <p className="conversation-error">{error}</p>}

      {orders.length === 0 ? (
        <div className="messaging-empty">
          <span aria-hidden="true">✉</span>
          <h2>Aucune conversation disponible</h2>
          <p>Une conversation apparaîtra dès qu’une commande sera attribuée à un cordonnier.</p>
        </div>
      ) : (
        <div className="messaging-layout">
          <aside className="messaging-inbox">
            <div className="messaging-inbox-header">
              <div><strong>Conversations</strong><small>{orders.length} commande{orders.length > 1 ? 's' : ''}</small></div>
              <input
                type="search"
                aria-label="Rechercher une conversation"
                placeholder="Rechercher…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="messaging-list">
              {filteredOrders.length === 0 && <p className="messaging-no-result">Aucune conversation trouvée.</p>}
              {filteredOrders.map((order) => {
                const lastMessage = latestMessages.get(order.id);
                const counterpart = user.role === 'cordonnier' ? order.revendeur_nom : order.cordonnier_nom;
                return (
                  <button
                    type="button"
                    key={order.id}
                    className={`messaging-order${selectedOrderId === order.id ? ' active' : ''}`}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <span className="messaging-avatar">{counterpart?.slice(0, 1).toUpperCase() || 'E'}</span>
                    <span className="messaging-order-copy">
                      <span className="messaging-order-top">
                        <strong>{order.numero_commande}</strong>
                        <time>{shortDate(lastMessage?.created_at)}</time>
                      </span>
                      <span className="messaging-counterpart">{counterpart || 'Équipe EHE'}</span>
                      <span className="messaging-preview">
                        {lastMessage ? `${lastMessage.auteur_id === user.id ? 'Vous : ' : ''}${lastMessage.contenu}` : 'Commencer la conversation…'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="messaging-panel">
            {selectedOrder ? (
              <>
                <header className="messaging-panel-header">
                  <div>
                    <span>Commande {selectedOrder.numero_commande}</span>
                    <strong>{selectedOrder.modele}</strong>
                  </div>
                  <span className={`status-badge status-${selectedOrder.statut}`}>{statusLabels[selectedOrder.statut]}</span>
                </header>
                <OrderConversation
                  commandeId={selectedOrder.id}
                  commandeStatut={selectedOrder.statut}
                  user={user}
                />
              </>
            ) : (
              <div className="messaging-empty compact"><p>Sélectionnez une conversation.</p></div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
