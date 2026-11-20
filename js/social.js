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
