// Perfis, amizades, busca e mensagens (funções do banco, ver supabase/003_social.sql).
import { rpc } from './supabase.js';

const first = (d) => (Array.isArray(d) ? d[0] || null : d);

export const searchUsers = (q) => rpc('search_users', { p_q: q });
export const getProfile = async (name) => first(await rpc('get_profile', { p_name: name }));
export const saveAbout = (text) => rpc('save_about', { p_text: text });

export const friendStatus = (id) => rpc('friend_status', { p_target: id });
export const sendFriendRequest = (id) => rpc('send_friend_request', { p_target: id });
export const respondFriendRequest = (id, accept) => rpc('respond_friend_request', { p_from_user: id, p_accept: accept });
export const removeFriend = (id) => rpc('remove_friend', { p_target: id });
export const listFriends = (id) => rpc('list_friends', { p_target: id });
export const friendRequests = () => rpc('friend_requests');

export const inbox = () => rpc('inbox');
export const unreadCount = () => rpc('unread_count');
export const markRead = (id) => rpc('mark_read', { p_msg_id: id });
export const sendMessage = (toId, subject, body) => rpc('send_message', { p_to_user: toId, p_subject: subject, p_body: body });

// ---- presença, seguidores, comunidades ----
import { GAMES } from './game-data.js';
export const touchPresence = (game = null) => rpc('touch_presence', { p_game: game });
export const friendsPresence = () => rpc('friends_presence');
export const userPresence = async (id) => first(await rpc('user_presence', { p_user: id }));
export const toggleFollow = (id) => rpc('toggle_follow', { p_target: id });
export const socialCounts = async (id) => first(await rpc('social_counts', { p_user: id }));
export const createCommunity = (name, description) => rpc('create_community', { p_name: name, p_description: description });
export const searchCommunities = (q) => rpc('search_communities', { p_q: q || null, p_limit: 40 });
export const myCommunities = (userId = null) => rpc('my_communities', { p_user: userId });
export const getCommunity = async (id) => first(await rpc('get_community', { p_id: id }));
export const communityMembers = (id) => rpc('community_members_list', { p_id: id, p_limit: 100, p_offset: 0 });
export const joinCommunity = (id) => rpc('join_community', { p_id: id });
export const leaveCommunity = (id) => rpc('leave_community', { p_id: id });
export const updateCommunity = (id, d) => rpc('update_community', { p_id: id, p_description: d });
export const deleteCommunity = (id) => rpc('delete_community', { p_id: id });

export function presenceText(p) {
  if (!p || p.status === 'offline') return 'Offline';
  return p.status === 'ingame' ? `Playing ${GAMES[p.game]?.title || 'a game'}` : 'Online';
}
// põe a bolinha verde (online) / azul (em jogo) nos cartões de amigos que estão dentro de `root`
export async function paintPresence(root = document) {
  try {
    const list = await friendsPresence();
    const by = new Map(list.map((p) => [p.id, p]));
    root.querySelectorAll('.friend').forEach((tile) => {
      const id = tile.querySelector('img[data-head]')?.dataset.head;
      const p = by.get(id);
      if (!p || p.status === 'offline' || tile.querySelector('.dot')) return;
      const dot = document.createElement('i');
      dot.className = `dot ${p.status}`; dot.title = presenceText(p);
      tile.querySelector('.friend-pic')?.append(dot);
      const sub = document.createElement('span');
      sub.className = 'friend-sub'; sub.textContent = presenceText(p);
      tile.append(sub);
    });
  } catch { /* migração 009 ainda não rodou */ }
}
