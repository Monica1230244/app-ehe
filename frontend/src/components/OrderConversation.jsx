import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { supabase } from '../api/supabase';
import { sendPushForOrder } from '../services/pushNotifications';

const roleLabels = {
  revendeur: 'Revendeur',
  cordonnier: 'Cordonnier',
  admin: 'Administrateur'
};

function dateLabel(value) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function mergeMessages(current, incoming) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));
  return [...messagesById.values()].sort((first, second) => new Date(first.created_at) - new Date(second.created_at));
}

export default function OrderConversation({ commandeId, commandeStatut, user }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const threadEnd = useRef(null);

  useEffect(() => {
    let active = true;

    api.get(`/commandes/${commandeId}/messages`)
      .then((response) => {
        if (active) setMessages((current) => mergeMessages(current, response.data.messages));
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Impossible de charger la conversation.');
      });

    const channel = supabase
      .channel(`commande-messages:${commandeId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'commande_messages',
        filter: `commande_id=eq.${commandeId}`
      }, (payload) => {
        setMessages((current) => mergeMessages(current, [payload.new]));
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [commandeId]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  async function sendMessage(event) {
    event.preventDefault();
    const contenu = draft.trim();
    if (!contenu || sending) return;

    setSending(true);
    setError('');
    try {
      const response = await api.post(`/commandes/${commandeId}/messages`, { contenu });
      setMessages((current) => mergeMessages(current, [response.data.message]));
      setDraft('');
      await sendPushForOrder(commandeId, 'message');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible d’envoyer le message.');
    } finally {
      setSending(false);
    }
  }

  const guidance = commandeStatut === 'livree'
    ? 'Transmettez ici les remarques du client et convenez des éventuelles corrections.'
    : commandeStatut === 'prete'
      ? 'Échangez sur les derniers détails avant la livraison au client.'
      : 'Utilisez cet espace pour préciser la fabrication et conserver une trace des échanges.';

  return (
    <section className="order-conversation rounded-xl border bg-white p-5 shadow-sm">
      <div className="conversation-heading">
        <div>
          <h2 className="text-lg font-bold">Conversation sur la fabrication</h2>
          <p>{guidance}</p>
        </div>
        <span className="conversation-live"><i /> En direct</span>
      </div>

      <div className="conversation-thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="conversation-empty">
            <strong>Aucun message pour le moment</strong>
            <span>Le revendeur et le cordonnier peuvent commencer la discussion ici.</span>
          </div>
        )}
        {messages.map((message) => {
          const isMine = message.auteur_id === user.id;
          return (
            <article key={message.id} className={`conversation-message${isMine ? ' mine' : ''}`}>
              <div className="conversation-author">
                <strong>{isMine ? 'Vous' : message.auteur_nom}</strong>
                <span>{roleLabels[message.auteur_role] || message.auteur_role}</span>
              </div>
              <p>{message.contenu}</p>
              <time dateTime={message.created_at}>{dateLabel(message.created_at)}</time>
            </article>
          );
        })}
        <span ref={threadEnd} />
      </div>

      <form className="conversation-form" onSubmit={sendMessage}>
        <label htmlFor={`commande-message-${commandeId}`}>Votre message</label>
        <textarea
          id={`commande-message-${commandeId}`}
          maxLength={2000}
          placeholder={user.role === 'cordonnier' ? 'Répondez au revendeur…' : 'Décrivez les remarques du client…'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          required
        />
        <div>
          <small>{draft.length}/2000</small>
          <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
            {sending ? 'Envoi…' : 'Envoyer'} <span>→</span>
          </button>
        </div>
      </form>
      {error && <p className="conversation-error">{error}</p>}
    </section>
  );
}
