import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  SafeAreaView,
  RefreshControl,
  Dimensions,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { messageAPI, groupAPI, friendAPI, pinnedChatsAPI, profileAPI } from '../services/api';
import { subscribeToNewMessages } from '../services/globalNotifications';
import { getOrCreateSocket } from '../services/globalSocket';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

const ChatsListScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [pinnedMap, setPinnedMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [friends, setFriends] = useState([]);
  const [activeTab, setActiveTab] = useState('chats');
  const [longPressModalVisible, setLongPressModalVisible] = useState(false);
  const [longPressItem, setLongPressItem] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isConnected, setIsConnected] = useState(false); // ✅ Статус подключения к приложению
  const [isAppWorking, setIsAppWorking] = useState(true); // ✅ Статус работы приложения (загрузки данных)
  const [typingUsers, setTypingUsers] = useState({}); // { chatId: { userId, username, timestamp } }
  const [groupTypingUsers, setGroupTypingUsers] = useState({}); // { groupId: [{ userId, username }, ...] }
  const [activeChatId, setActiveChatId] = useState(null); // ✅ Отслеживаем открытый чат
  const [searchActive, setSearchActive] = useState(false); // ✅ Состояние активного поиска
  const [fabOpen, setFabOpen] = useState(false); // ✅ Состояние FAB меню
  const [fabVisible, setFabVisible] = useState(true); // ✅ Видимость FAB при скролле
  const fabAnim = useRef(new Animated.Value(0)).current; // ✅ Анимация FAB
  const fabOpacityAnim = useRef(new Animated.Value(1)).current; // ✅ Анимация прозрачности FAB
  const lastScrollY = useRef(0); // ✅ Отслеживаем позицию скролла
  const socketConnectionRef = useRef(null); // ✅ Сохраняем socket в ref для использования в других местах

  // 🟢 Подключаем hook для обновления статусов онлайн
  useOnlineStatus((statusUpdate) => {
    console.log('🟢 ChatsListScreen: Получено обновление статуса:', statusUpdate);
    const { userId, is_online } = statusUpdate;
    
    // Обновляем статус в личных чатах
    setChats(prev => {
      const idx = prev.findIndex(c => String(c.id) === String(userId));
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], is_online };
        console.log(`   ✅ Обновлен чат с userId=${userId}, is_online=${is_online}`);
        return updated;
      }
      return prev;
    });
  });

  const loadPinnedFromStorage = async () => {
    try {
      const raw = await AsyncStorage.getItem('pinnedChats');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.log('Ошибка чтения pinnedChats из AsyncStorage', err);
      return {};
    }
  };

  const syncPinnedChatsFromServer = async (fallbackMap = {}) => {
    try {
      const response = await pinnedChatsAPI.getPinnedChats();
      const pinnedList = Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : [];
      const serverMap = pinnedList.reduce((acc, item) => {
        const chatType = item.chat_type || item.chatType || item.type;
        const chatId = item.chat_id || item.chatId || item.id;
        if (!chatType || !chatId) {
          return acc;
        }
        const pinnedAtValue = item.pinned_at || item.pinnedAt || Date.now();
        const timestamp = typeof pinnedAtValue === 'number' ? pinnedAtValue : new Date(pinnedAtValue).getTime() || Date.now();
        acc[`${chatType}-${chatId}`] = timestamp;
        return acc;
      }, {});

      setPinnedMap(serverMap);
      await AsyncStorage.setItem('pinnedChats', JSON.stringify(serverMap));
      await loadChats(serverMap);
      await loadGroups(serverMap);
      return serverMap;
    } catch (err) {
      console.log('Не удалось синхронизировать закрепленные чаты с сервером:', err?.response?.data || err?.message || err);
      if (fallbackMap) {
        setPinnedMap(fallbackMap);
      }
      return fallbackMap;
    }
  };

  useEffect(() => {
    let unsub;
    let socketConnection = null;

    (async () => {
      // Загружаем текущего пользователя
      const storedUser = await AsyncStorage.getItem('user');
      const user = storedUser ? JSON.parse(storedUser) : null;
      setCurrentUser(user);
      
      const localMap = await loadPinnedFromStorage();
      setPinnedMap(localMap);
      await loadChats(localMap);
      await loadGroups(localMap);
      await loadFriends();
      await syncPinnedChatsFromServer(localMap);

      // Подпишемся на входящие сообщения, чтобы поднимать чат вверх при приходе
      unsub = subscribeToNewMessages(async (message, isGroup) => {
        try {
          const storedUser = await AsyncStorage.getItem('user');
          const currentUser = storedUser ? JSON.parse(storedUser) : null;
          if (isGroup) {
            // group message: найдем группу и переместим вверх (но не выше закреплённых)
            const groupId = message.group_id || message.groupId || message.groupID;
            console.log(`✅ ChatsListScreen: Обработка группового сообщения groupId=${groupId}, message=`, message);
            if (!groupId) {
              console.warn('⚠️ ChatsListScreen: Групповое сообщение без groupId');
              return;
            }
            setGroups(prev => {
              const idx = prev.findIndex(g => String(g.id) === String(groupId));
              console.log(`🔍 ChatsListScreen: Ищем группу ${groupId}, найдена на индексе=${idx}, всего групп=${prev.length}`);
              if (idx === -1) return prev;
              const item = { ...prev[idx] };
              item.lastMessage = message.message || item.lastMessage;
              item.lastMessageTime = message.created_at || message.createdAt || new Date().toISOString();
              item.lastMessageReadStatus = message.is_read || false;
              // Увеличиваем счётчик непрочитанных, если сообщение не от текущего пользователя
              if (!currentUser || message.sender_id !== currentUser.id) {
                item.unreadCount = (item.unreadCount || 0) + 1;
              }
              const copy = [...prev];
              copy.splice(idx, 1);
              
              // Если чат закреплён, оставляем его на месте
              if (item.pinned) {
                copy.splice(idx, 0, item);
              } else {
                // Иначе поднимаем вверх, но ниже всех закреплённых
                const pinnedCount = copy.filter(c => c.pinned).length;
                copy.splice(pinnedCount, 0, item);
              }
              return copy;
            });
          } else {
            // personal message: поднять чат пользователя-отправителя (но не выше закреплённых)
            const senderId = message.sender_id || message.senderId || message.sender;
            if (!senderId) return;
            setChats(prev => {
              const idx = prev.findIndex(c => String(c.id) === String(senderId));
              if (idx === -1) return prev;
              const item = { ...prev[idx] };
              item.lastMessage = message.message || item.lastMessage;
              item.lastMessageTime = message.created_at || message.createdAt || new Date().toISOString();
              item.lastMessageReadStatus = message.is_read || false;
              // Увеличиваем счётчик непрочитанных, если сообщение не от текущего пользователя
              if (!currentUser || message.sender_id !== currentUser.id) {
                item.unreadCount = (item.unreadCount || 0) + 1;
              }
              const copy = [...prev];
              copy.splice(idx, 1);
              
              // Если чат закреплён, оставляем его на месте
              if (item.pinned) {
                copy.splice(idx, 0, item);
              } else {
                // Иначе поднимаем вверх, но ниже всех закреплённых
                const pinnedCount = copy.filter(c => c.pinned).length;
                copy.splice(pinnedCount, 0, item);
              }
              return copy;
            });
          }
        } catch (e) {
          console.warn('Error handling incoming message in ChatsListScreen', e);
        }
      });

      // 🔔 НОВОЕ: Используем ГЛОБАЛЬНЫЙ socket вместо создания нового!
      try {
        const socketConnection = await getOrCreateSocket();

        // ✅ Сохраняем socket в ref для использования в других useEffect'ах
        socketConnectionRef.current = socketConnection;

        socketConnection.on('connect', () => {
          console.log('ChatsListScreen: Socket подключен');
          setIsConnected(true); // ✅ Устанавливаем статус подключения
          socketConnection.emit('authenticate_socket', { user_id: currentUser.id });
          
          // ✅ КРИТИЧНО: Присоединяемся к личной комнате текущего пользователя
          socketConnection.emit('join_personal_room', currentUser.id);
          console.log(`✅ ChatsListScreen: Присоединились к личной комнате user_${currentUser.id}`);
          
          // ✅ ДИАГНОСТИКА: Слушаем все события для отладки
          socketConnection.onAny((eventName, ...args) => {
            if (eventName.includes('message') || eventName.includes('group') || eventName.includes('typing')) {
              console.log(`📨 ChatsListScreen: Получено событие ${eventName}`, args[0]);
            }
          });
        });

          // Слушаем новые личные сообщения
          socketConnection.on('new_message', (message) => {
            console.log('ChatsListScreen: Получено новое сообщение', message);
            setChats(prev => {
              // Определяем ID чата: если отправитель - это мы, то ищем по receiver_id, иначе по sender_id
              const chatId = message.sender_id === currentUser?.id ? message.receiver_id : message.sender_id;
              const idx = prev.findIndex(c => String(c.id) === String(chatId));
              
              if (idx === -1) return prev;
              
              const item = { ...prev[idx] };
              item.lastMessage = message.message;
              item.lastMessageTime = new Date().toISOString();
              item.lastMessageReadStatus = message.is_read || false;
              item.lastMessageId = message.id;
              item.lastMessageSenderId = message.sender_id;
              
              // Увеличиваем непрочитанные, если это не от нас
              if (message.sender_id !== currentUser?.id) {
                item.unreadCount = (item.unreadCount || 0) + 1;
              }
              
              const copy = [...prev];
              copy.splice(idx, 1);
              
              // Сортируем: закреплённые остаются на месте, остальные идут вверх
              if (item.pinned) {
                copy.splice(idx, 0, item);
              } else {
                const pinnedCount = copy.filter(c => c.pinned).length;
                copy.splice(pinnedCount, 0, item);
              }
              
              return copy;
            });
          });

          // Слушаем новые групповые сообщения
          socketConnection.on('new_group_message', (message) => {
            console.log('ChatsListScreen: Получено новое групповое сообщение', message);
            setGroups(prev => {
              const groupId = message.group_id;
              const idx = prev.findIndex(g => String(g.id) === String(groupId));
              
              if (idx === -1) return prev;
              
              const item = { ...prev[idx] };
              item.lastMessage = message.message;
              item.lastMessageTime = new Date().toISOString();
              // Для групп: если это наше сообщение - оно сразу считается прочитанным, иначе нет
              item.lastMessageReadStatus = message.sender_id === currentUser?.id ? true : false;
              item.lastMessageId = message.id;
              item.lastMessageSenderId = message.sender_id;
              
              // Увеличиваем непрочитанные, если это не от нас
              if (message.sender_id !== currentUser?.id) {
                item.unreadCount = (item.unreadCount || 0) + 1;
              }
              
              const copy = [...prev];
              copy.splice(idx, 1);
              
              // Сортируем: закреплённые остаются на месте, остальные идут вверх
              if (item.pinned) {
                copy.splice(idx, 0, item);
              } else {
                const pinnedCount = copy.filter(c => c.pinned).length;
                copy.splice(pinnedCount, 0, item);
              }
              
              return copy;
            });
          });

          // ✅ Слушаем событие от ChatScreen когда ВЫ отправили сообщение
          socketConnection.on('message_sent', (message) => {
            console.log('ChatsListScreen: Получено событие message_sent (мы отправили сообщение)', message);
            console.log(`   message_id: ${message.id}`);
            console.log(`   sender_id: ${message.sender_id}`);
            console.log(`   receiver_id: ${message.receiver_id}`);
            console.log(`   group_id: ${message.group_id}`);
            console.log(`   is_read: ${message.is_read}`);
            
            if (message.group_id) {
              // Это групповое сообщение
              setGroups(prev => {
                const groupId = message.group_id;
                const idx = prev.findIndex(g => String(g.id) === String(groupId));
                
                if (idx === -1) return prev;
                
                const item = { ...prev[idx] };
                item.lastMessage = message.message;
                item.lastMessageTime = message.created_at || new Date().toISOString();
                item.lastMessageReadStatus = true; // Наше сообщение сразу прочитано
                item.lastMessageSenderId = message.sender_id;
                
                const copy = [...prev];
                copy.splice(idx, 1);
                
                // Сортируем: закреплённые остаются на месте, остальные идут вверх
                if (item.pinned) {
                  copy.splice(idx, 0, item);
                } else {
                  const pinnedCount = copy.filter(c => c.pinned).length;
                  copy.splice(pinnedCount, 0, item);
                }
                
                return copy;
              });
            } else {
              // Это личное сообщение
              setChats(prev => {
                const chatId = message.receiver_id;
                const idx = prev.findIndex(c => String(c.id) === String(chatId));
                
                if (idx === -1) return prev;
                
                const item = { ...prev[idx] };
                item.lastMessage = message.message;
                item.lastMessageTime = message.created_at || new Date().toISOString();
                item.lastMessageReadStatus = true; // Наше сообщение сразу прочитано
                item.lastMessageSenderId = message.sender_id;
                
                const copy = [...prev];
                copy.splice(idx, 1);
                
                // Сортируем: закреплённые остаются на месте, остальные идут вверх
                if (item.pinned) {
                  copy.splice(idx, 0, item);
                } else {
                  const pinnedCount = copy.filter(c => c.pinned).length;
                  copy.splice(pinnedCount, 0, item);
                }
                
                return copy;
              });
            }
          });

          // 🔴 ОБНОВЛЕНИЕ СТАТУСА ПОЛЬЗОВАТЕЛЯ (по логике ChatScreen)
          socketConnection.on('user_status_changed', (data) => {
            console.log('🟢 ChatsListScreen: user_status_changed получен', data);
            
            // 1️⃣ Извлекаем userId (как в ChatScreen)
            const extractUserId = (payload) => {
              if (payload === undefined || payload === null) return undefined;
              if (typeof payload === 'object') {
                return payload.userId ?? payload.user_id ?? payload.id;
              }
              return payload;
            };
            
            // 2️⃣ Извлекаем is_online значение (как в ChatScreen)
            const resolveStatus = (payload) => {
              if (payload && typeof payload === 'object') {
                if (typeof payload.is_online === 'boolean') return payload.is_online;
                if (typeof payload.online === 'boolean') return payload.online;
                if (typeof payload.status === 'string') {
                  const normalized = payload.status.trim().toLowerCase();
                  if (['online', 'в сети', 'on', '1'].includes(normalized)) return true;
                  if (['offline', 'оффлайн', 'off', '0', 'не в сети'].includes(normalized)) return false;
                }
              }
              return undefined;
            };
            
            const userId = extractUserId(data);
            const is_online = resolveStatus(data);
            
            console.log(`   Извлечено: userId=${userId}, is_online=${is_online}`);
            
            if (userId === undefined || is_online === undefined) {
              console.log(`   ⚠️ Не удалось извлечь данные из события`);
              return;
            }
            
            // 3️⃣ Обновляем статус в личных чатах
            setChats(prev => {
              const idx = prev.findIndex(c => String(c.id) === String(userId));
              if (idx === -1) {
                console.log(`   ⚠️ Чат с id=${userId} не найден в массиве чатов`);
                return prev;
              }
              
              console.log(`   ✅ Чат найден! Обновляю is_online=${is_online}`);
              
              const updatedChats = [...prev];
              updatedChats[idx] = {
                ...updatedChats[idx],
                is_online: is_online
              };
              
              console.log(`   📊 Новое состояние чата: is_online=${updatedChats[idx].is_online}`);
              return updatedChats;
            });
          });

          // 🔴 ОБНОВЛЕНИЕ АВАТАРА ГРУППЫ
          socketConnection.on('group_avatar_updated', (data) => {
            console.log('ChatsListScreen: Аватар группы обновлен', data);
            const { group_id, avatar } = data;
            
            setGroups(prev => {
              const idx = prev.findIndex(g => String(g.id) === String(group_id));
              if (idx === -1) return prev;
              
              const updatedGroups = [...prev];
              updatedGroups[idx] = {
                ...updatedGroups[idx],
                avatar: avatar
              };
              return updatedGroups;
            });
          });

          // 🔴 КОГДА ПОЛЬЗОВАТЕЛЬ УХОДИТ ИЗ ГРУППЫ
          socketConnection.on('user_left_group', (data) => {
            console.log('ChatsListScreen: Пользователь покинул группу', data);
            const { group_id, user_id } = data;
            
            // Если это текущий пользователь - удаляем группу из списка
            if (user_id === currentUser?.id) {
              setGroups(prev => prev.filter(g => String(g.id) !== String(group_id)));
            }
          });

          // 🔴 ОЧИСТКА/УДАЛЕНИЕ ЧАТА
          socketConnection.on('message_deleted', (data) => {
            console.log('ChatsListScreen: Сообщение удалено', data);
            // Это событие для отдельного сообщения, можно игнорировать на уровне списка
          });

          // 🔴 ОБНОВЛЕНИЕ КОГДА ЧТЕНИЕ ОТМЕТИЛИ
          socketConnection.on('message_read_status_updated', (data) => {
            console.log('ChatsListScreen: Статус прочтения обновлен', data);
            const { message_id, is_read, read_by, sender_id, receiver_id, group_id } = data;
            
            console.log(`\n📨 Read status update:`);
            console.log(`   message_id: ${message_id}`);
            console.log(`   is_read: ${is_read}`);
            console.log(`   sender_id: ${sender_id}`);
            console.log(`   receiver_id: ${receiver_id}`);
            console.log(`   group_id: ${group_id}`);
            
            // Если это групповое сообщение - обновляем группу
            if (group_id) {
              console.log(`   ➡️ Это групповое сообщение`);
              setGroups(prev => {
                const updated = prev.map(group => {
                  const isSameGroup = String(group.id) === String(group_id);
                  const isSameMessage = message_id && String(group.lastMessageId) === String(message_id);
                  
                  console.log(`   Проверяю группу ${group.id}: isSameGroup=${isSameGroup}, isSameMessage=${isSameMessage}`);
                  
                  if (isSameGroup && isSameMessage) {
                    console.log(`   ✅ Обновляю группу ${group_id}: lastMessageReadStatus → ${is_read}`);
                    return { ...group, lastMessageReadStatus: is_read };
                  }
                  return group;
                });
                return updated;
              });
            } else if (message_id) {
              // Для личных чатов: проверяем что это сообщение от текущего пользователя (sender_id)
              // и оно предназначено для конкретного chat_id (receiver_id)
              console.log(`   ➡️ Это личное сообщение`);
              setChats(prev => {
                const updated = prev.map(chat => {
                  const isSameChat = String(chat.id) === String(receiver_id);
                  const isSameMessage = String(chat.lastMessageId) === String(message_id);
                  
                  console.log(`   Проверяю чат ${chat.id}: isSameChat=${isSameChat}, isSameMessage=${isSameMessage}, receiver_id=${receiver_id}`);
                  
                  if (isSameChat && isSameMessage) {
                    console.log(`   ✅ Обновляю чат ${chat.id}: lastMessageReadStatus → ${is_read}`);
                    return { ...chat, lastMessageReadStatus: is_read };
                  }
                  return chat;
                });
                return updated;
              });
            } else {
              console.log(`   ❌ Ни группа ни message_id, игнорируем`);
            }
          });

          // 🔴 УДАЛЕНИЕ ЛИЧНОГО ЧАТА (если удалили с другого устройства)
          socketConnection.on('chat_cleared', (data) => {
            console.log('ChatsListScreen: Чат очищен/удален', data);
            const { user_id } = data;
            setChats(prev => prev.filter(c => String(c.id) !== String(user_id)));
          });

          // ✅ ОБНОВЛЕНИЕ ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ
          socketConnection.on('profile_updated', (data) => {
            console.log('ChatsListScreen: Профиль обновлен', data);
            if (data && currentUser && String(data.id) === String(currentUser.id)) {
              const updatedUser = { ...currentUser, ...data };
              setCurrentUser(updatedUser);
              AsyncStorage.setItem('user', JSON.stringify(updatedUser)).catch(err => 
                console.log('Ошибка сохранения обновленного пользователя в AsyncStorage:', err)
              );
            }
          });

          // ✅ СБРОС СЧЁТЧИКА НЕПРОЧИТАННЫХ СООБЩЕНИЙ
          socketConnection.on('chat_unread_count_updated', (data) => {
            console.log('ChatsListScreen: Обновление счётчика непрочитанных', data);
            const { group_id, friend_id, unread_count } = data;
            
            if (group_id) {
              // Обновляем группу
              setGroups(prev => 
                prev.map(group => {
                  if (String(group.id) === String(group_id)) {
                    console.log(`✅ Сброс счётчика группы ${group_id} на ${unread_count}`);
                    return { ...group, unreadCount: unread_count, unread_count: unread_count };
                  }
                  return group;
                })
              );
            } else if (friend_id) {
              // Обновляем личный чат
              setChats(prev => 
                prev.map(chat => {
                  if (String(chat.id) === String(friend_id)) {
                    console.log(`✅ Сброс счётчика чата ${friend_id} на ${unread_count}`);
                    return { ...chat, unreadCount: unread_count, unread_count: unread_count };
                  }
                  return chat;
                })
              );
            }
          });

          socketConnection.on('disconnect', () => {
            console.log('ChatsListScreen: Socket отключен');
            setIsConnected(false); // ✅ Устанавливаем статус отключения
          });

          // 🆕 СОБЫТИЕ КОГДА СОЗДАНА НОВАЯ ГРУППА
          socketConnection.on('group_created', (groupData) => {
            console.log('🆕 ChatsListScreen: Получено событие group_created', groupData);
            
            // Проверяем что текущий пользователь в списке участников
            const isMember = groupData.members && (
              groupData.members.includes(currentUser?.id) ||
              groupData.members.some(m => String(m.id) === String(currentUser?.id) || String(m) === String(currentUser?.id))
            );
            
            console.log(`   Member check: isMember=${isMember}, members=${groupData.members}, currentUserId=${currentUser?.id}`);
            
            if (isMember) {
              console.log(`   ✅ Добавляю группу ${groupData.id} в список`);
              const newGroup = {
                id: groupData.id,
                name: groupData.name,
                description: groupData.description || '',
                avatar: groupData.avatar || null,
                lastMessage: '',
                lastMessageId: null,
                lastMessageTime: new Date().toISOString(),
                lastMessageSenderId: currentUser?.id,
                lastMessageReadStatus: false,
                unreadCount: 0,
                isGroup: true,
                members: groupData.members || []
              };
              setGroups(prev => [newGroup, ...prev]);
            }
          });
      } catch (error) {
        console.error('Ошибка подключения Socket.io в ChatsListScreen:', error);
      }

      // ✅ СЛУШАТЕЛИ ДЛЯ СТАТУСА ПЕЧАТАНИЯ - Присоединяем к существующему socket
      const socketConnection = socketConnectionRef.current;
      if (socketConnection) {
        // Для личных чатов
        socketConnection.on('user_typing', (data) => {
          console.log('📝 ChatsListScreen: user_typing получено', data);
          const { from_user_id, from_user_username, to_user_id, is_typing } = data;
          
          // ✅ КРИТИЧНО: Используем from_user_id как ключ чата
          // from_user_id = ID того кто печатает = ID чата для рендеринга
          if (is_typing) {
            setTypingUsers(prev => ({
              ...prev,
              [from_user_id]: {
                userId: from_user_id,
                username: from_user_username,
                timestamp: Date.now()
              }
            }));
            console.log(`✅ ${from_user_username}(${from_user_id}) печатает - сохранено в typingUsers[${from_user_id}]`);
          } else {
            // Удаляем из списка если is_typing = false
            setTypingUsers(prev => {
              const updated = { ...prev };
              delete updated[from_user_id];
              return updated;
            });
            console.log(`⏹️ ${from_user_username}(${from_user_id}) перестал печатать`);
          }
        });
        
        // Для групповых чатов
        socketConnection.on('group_user_typing', (data) => {
          console.log('ChatsListScreen: Пользователь печатает в группе', data);
          const { group_id, user_id, username, is_typing } = data;
          
          setGroupTypingUsers(prev => {
            const updated = { ...prev };
            
            if (!updated[group_id]) {
              updated[group_id] = [];
            }
            
            const existingIndex = updated[group_id].findIndex(u => u.userId === user_id);
            
            if (is_typing) {
              if (existingIndex !== -1) {
                // Обновляем timestamp
                updated[group_id][existingIndex].timestamp = Date.now();
              } else {
                // Добавляем нового пользователя
                updated[group_id].push({
                  userId: user_id,
                  username: username,
                  timestamp: Date.now()
                });
                console.log(`✅ ${username} начал печатать в группе ${group_id}`);
              }
            } else {
              // Удаляем пользователя из печатающих
              if (existingIndex !== -1) {
                updated[group_id].splice(existingIndex, 1);
                console.log(`⏹️ ${username} перестал печатать в группе ${group_id}`);
              }
              // Если в группе больше никто не печатает, удаляем группу из словаря
              if (updated[group_id].length === 0) {
                delete updated[group_id];
              }
            }
            
            return updated;
          });
        });
      }
    })();

    return () => {
      unsub && unsub();
      if (socketConnection) {
        socketConnection.disconnect();
      }
    };
  }, []);

  // ✅ Периодически очищаем устаревшие статусы печатания
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const TIMEOUT = 2000; // 2 секунды
      
      // Очищаем личные чаты
      setTypingUsers(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(userId => {
          if (now - updated[userId].timestamp > TIMEOUT) {
            delete updated[userId];
          }
        });
        return updated;
      });
      
      // Очищаем групповые чаты
      setGroupTypingUsers(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(groupId => {
          updated[groupId] = updated[groupId].filter(
            user => now - user.timestamp <= TIMEOUT
          );
          if (updated[groupId].length === 0) {
            delete updated[groupId];
          }
        });
        return updated;
      });
    }, 1000); // Проверяем каждую секунду
    
    return () => clearInterval(cleanupInterval);
  }, []);

  // ✅ Очищаем активный чат при фокусе на этот экран
  useFocusEffect(
    React.useCallback(() => {
      console.log('📱 ChatsListScreen: Вернулись на экран - перезагружаем чаты и статусы');
      setActiveChatId(null);
      
      // ✅ Перезагружаем чаты и группы при возврате на экран
      // Это нужно, чтобы обновились галочки (is_read) после прочтения сообщений
      if (pinnedMap) {
        loadChats(pinnedMap);
        loadGroups(pinnedMap);
      } else {
        loadChats();
        loadGroups();
      }
    }, [pinnedMap])
  );

  // ✅ Присоединяемся к комнатам групп когда они загружены
  useEffect(() => {
    if (groups && groups.length > 0 && socketConnectionRef.current) {
      const socket = socketConnectionRef.current;
      
      // Проверяем подключен ли socket
      if (socket.connected) {
        groups.forEach(group => {
          socket.emit('join_group_room', group.id);
          console.log(`📡 Присоединились к комнате группы: ${group.id}`);
        });
      } else {
        // Если socket еще не подключен, слушаем событие подключения
        const handleConnect = () => {
          groups.forEach(group => {
            socket.emit('join_group_room', group.id);
            console.log(`📡 Присоединились к комнате группы (после подключения): ${group.id}`);
          });
          socket.off('connect', handleConnect);
        };
        socket.on('connect', handleConnect);
      }
    }
  }, [groups]);

  // 🔍 ЛОГИРОВАНИЕ: Отслеживаем изменения в состоянии chats
  useEffect(() => {
    console.log('📊 STATE UPDATE: chats изменился, текущее количество:', chats.length);
    chats.forEach(chat => {
      console.log(`   Чат ${chat.id}: is_online=${chat.is_online}, тип=${chat.type}`);
    });
  }, [chats]);

  const loadChats = async (mapArg) => {
    try {
      setIsAppWorking(true); // ✅ Начало загрузки
      const response = await friendAPI.getFriends();
      const allFriends = response.data.filter(f => f.status === 'accepted');
      
      // 🔍 DEBUG: Логируем статусы онлайна
      console.log('🔍 Загруженные друзья (статусы онлайна):');
      allFriends.forEach(f => {
        const statusOnline = f.is_online || f.isOnline || f.online || false;
        console.log(`  ${f.id} (${f.username}): is_online=${statusOnline} [is_online=${f.is_online}, isOnline=${f.isOnline}, online=${f.online}]`);
      });
      
      const map = mapArg || pinnedMap || {};
      
      const mapped = await Promise.all(allFriends.map(async (friend) => {
        const key = `personal-${friend.id}`;
        const pinnedAt = map[key] || null;
        
        // Загружаем последнее сообщение для этого друга
        let lastMessage = friend.last_message || friend.lastMessage || null;
        let lastMessageTime = friend.last_message_time || friend.lastMessageTime || null;
        let unreadCount = 0;
        let lastMessageReadStatus = false;
        let lastMessageId = null;
        let lastMessageSenderId = null;
        
        try {
          const messagesResp = await messageAPI.getMessages(friend.id);
          if (messagesResp.data && messagesResp.data.length > 0) {
            // Берём последнее сообщение из массива
            const lastMsg = messagesResp.data[messagesResp.data.length - 1];
            
            // 🔍 DEBUG: Логируем что пришло с API
            console.log(`🔄 API /messages/${friend.id}: Получено ${messagesResp.data.length} сообщений`);
            console.log(`   Последнее сообщение:`, {
              id: lastMsg.id,
              sender_id: lastMsg.sender_id,
              receiver_id: lastMsg.receiver_id,
              message: lastMsg.message?.substring(0, 20) + '...',
              is_read: lastMsg.is_read,
              created_at: lastMsg.created_at
            });
            
            lastMessage = lastMsg.message || lastMsg.msg || '📎 Медиа';
            lastMessageTime = lastMsg.created_at || lastMsg.createdAt;
            lastMessageId = lastMsg.id;
            lastMessageSenderId = lastMsg.sender_id;
            
            // Получаем время последнего открытия этого чата
            let lastVisitTimeStr = await AsyncStorage.getItem(`chat_visit_${friend.id}`);
            let lastVisitTime = 0;
            
            if (lastVisitTimeStr) {
              lastVisitTime = new Date(lastVisitTimeStr).getTime();
            } else {
              // Если это первый визит - устанавливаем текущее время
              // Это означает, что все старые сообщения будут считаться прочитанными
              const now = new Date().toISOString();
              await AsyncStorage.setItem(`chat_visit_${friend.id}`, now);
              lastVisitTime = new Date(now).getTime();
            }
            
            // Подсчитываем непрочитанные сообщения:
            // - сообщения от друга (не от текущего пользователя)
            // - полученные ПОСЛЕ последнего открытия чата
            const currentUser = await AsyncStorage.getItem('user');
            const currentUserId = currentUser ? JSON.parse(currentUser).id : null;
            
            if (currentUserId) {
              unreadCount = messagesResp.data.filter(msg => {
                const msgTime = new Date(msg.created_at || msg.createdAt).getTime();
                return msg.sender_id === friend.id && 
                       msg.receiver_id === currentUserId &&
                       msgTime > lastVisitTime &&
                       !msg.is_read; // ✅ Считаем только непрочитанные
              }).length;
              
              console.log(`📊 Чат ${friend.id}: всего сообщений=${messagesResp.data.length}, непрочитанных=${unreadCount}`);
              
              // Проверяем, прочитано ли последнее сообщение (для галочек)
              // ✅ ВАЖНО: Для СВОИХ отправленных сообщений is_read всегда=1 с API, но это неправильно
              // Исправляем на false, socket события обновят на true
              if (lastMsg.sender_id === currentUserId) {
                // Это наше сообщение - ИСПРАВЛЯЕМ на false (как в ChatScreen)
                lastMessageReadStatus = false;
                console.log(`✅ Чат ${friend.id}: Это наше сообщение (id=${lastMessageId}), is_read ИСПРАВЛЕН на false`);
              } else {
                // Это сообщение от друга - берём как есть с сервера
                lastMessageReadStatus = lastMsg.is_read || false;
                console.log(`⊘ Чат ${friend.id}: Сообщение от друга, is_read=${lastMessageReadStatus}`);
              }
            }
          }
        } catch (err) {
          console.log(`Ошибка загрузки сообщений для ${friend.id}:`, err);
          unreadCount = friend.unread_count || friend.unreadCount || 0;
        }
        
        return {
          ...friend,
          type: 'personal',
          lastMessage,
          lastMessageTime,
          lastMessageReadStatus,
          lastMessageId,
          lastMessageSenderId,
          unreadCount: unreadCount || friend.unread_count || friend.unreadCount || 0,
          pinned: !!pinnedAt,
          pinnedAt,
          is_online: friend.is_online || friend.isOnline || friend.online || false
        };
      }));

      setChats(mapped);
      setIsAppWorking(false); // ✅ Загрузка завершена
      
      // 🔍 Debug: Логируем все чаты с информацией о галочках
      console.log('🔄 ChatsListScreen: Загруженные чаты с is_read статусом:');
      mapped.forEach(chat => {
        const showCheckmark = chat.lastMessageReadStatus !== undefined && chat.lastMessageSenderId === currentUser?.id;
        console.log(`  Чат ${chat.id} (${chat.username}): ` +
          `lastMsg=${chat.lastMessageId}, ` +
          `senderId=${chat.lastMessageSenderId}, ` +
          `currentUserId=${currentUser?.id}, ` +
          `is_read=${chat.lastMessageReadStatus}, ` +
          `showCheckmark=${showCheckmark ? '✓✓' : '✗'}`);
      });

      // Попробуем получить непрочитанные сообщения с сервера и заполнить бейджи
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const resp = await fetch('http://151.247.196.66:3001/api/messages/unread', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data && Array.isArray(data.messages)) {
              const counts = {};
              for (const m of data.messages) {
                const sender = m.sender_id || m.senderId || m.sender;
                if (!sender) continue;
                counts[String(sender)] = (counts[String(sender)] || 0) + 1;
              }

              setChats(prev => prev.map(c => ({
                ...c,
                unreadCount: counts[String(c.id)] || c.unreadCount || 0
              })));
            }
          }
        }
      } catch (err) {
        console.log('Не удалось получить unread из /api/messages/unread', err);
      }
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
      setIsAppWorking(false); // ✅ Завершить загрузку даже при ошибке
    }
  };

  const loadGroups = async (mapArg) => {
    try {
      setIsAppWorking(true); // ✅ Начало загрузки
      const response = await groupAPI.getGroups();
      const map = mapArg || pinnedMap || {};
      
      const mapped = await Promise.all(response.data.map(async (group) => {
        const key = `group-${group.id}`;
        const pinnedAt = map[key] || null;
        
        // Загружаем последнее сообщение для этой группы
        let lastMessage = group.last_message || group.lastMessage || null;
        let lastMessageTime = group.last_message_time || group.lastMessageTime || null;
        let unreadCount = 0;
        let lastMessageReadStatus = false;
        let lastMessageId = null;
        let lastMessageSenderId = null;
        
        try {
          const messagesResp = await groupAPI.getGroupMessages(group.id);
          if (messagesResp.data && messagesResp.data.length > 0) {
            // Берём последнее сообщение из массива
            const lastMsg = messagesResp.data[messagesResp.data.length - 1];
            lastMessage = lastMsg.message || lastMsg.msg || '📎 Медиа';
            lastMessageTime = lastMsg.created_at || lastMsg.createdAt;
            lastMessageId = lastMsg.id;
            lastMessageSenderId = lastMsg.sender_id;
            
            // Получаем время последнего открытия этой группы
            let lastVisitTimeStr = await AsyncStorage.getItem(`group_visit_${group.id}`);
            let lastVisitTime = 0;
            
            if (lastVisitTimeStr) {
              lastVisitTime = new Date(lastVisitTimeStr).getTime();
            } else {
              // Если это первый визит - устанавливаем текущее время
              // Это означает, что все старые сообщения будут считаться прочитанными
              const now = new Date().toISOString();
              await AsyncStorage.setItem(`group_visit_${group.id}`, now);
              lastVisitTime = new Date(now).getTime();
            }
            
            // Подсчитываем непрочитанные сообщения:
            // - все сообщения кроме собственных
            // - полученные ПОСЛЕ последнего открытия группы
            const currentUser = await AsyncStorage.getItem('user');
            const currentUserId = currentUser ? JSON.parse(currentUser).id : null;
            
            if (currentUserId) {
              unreadCount = messagesResp.data.filter(msg => {
                const msgTime = new Date(msg.created_at || msg.createdAt).getTime();
                return msg.sender_id !== currentUserId &&
                       msgTime > lastVisitTime &&
                       !msg.is_read; // ✅ Считаем только непрочитанные
              }).length;
              
              console.log(`📊 Группа ${group.id}: всего сообщений=${messagesResp.data.length}, непрочитанных=${unreadCount}`);
              
              // Проверяем, прочитано ли последнее сообщение (для галочек)
              // ✅ ВАЖНО: Для СВОИХ отправленных сообщений is_read всегда=1 с API, но это неправильно
              // Исправляем на false, socket события обновят на true
              const lastMsg = messagesResp.data[messagesResp.data.length - 1];
              if (lastMsg.sender_id === currentUserId) {
                // Это наше сообщение - ИСПРАВЛЯЕМ на false (как в ChatScreen)
                lastMessageReadStatus = false;
                console.log(`✅ Группа ${group.id}: Это наше сообщение (id=${lastMessageId}), is_read ИСПРАВЛЕН на false`);
              } else {
                // Это сообщение от другого пользователя - берём как есть
                lastMessageReadStatus = lastMsg.is_read || false;
                console.log(`⊘ Группа ${group.id}: Сообщение от другого пользователя, is_read=${lastMessageReadStatus}`);
              }
            }
          }
        } catch (err) {
          console.log(`Ошибка загрузки сообщений группы ${group.id}:`, err);
          unreadCount = group.unread_count || group.unreadCount || 0;
        }
        
        return {
          ...group,
          type: 'group',
          lastMessage,
          lastMessageTime,
          lastMessageReadStatus,
          lastMessageId,
          lastMessageSenderId,
          unreadCount: unreadCount || group.unread_count || group.unreadCount || 0,
          pinned: !!pinnedAt,
          pinnedAt
        };
      }));
      
      setGroups(mapped);
      setIsAppWorking(false); // ✅ Загрузка завершена
    } catch (error) {
      console.error('Ошибка загрузки групп:', error);
      setIsAppWorking(false); // ✅ Завершить загрузку даже при ошибке
    }
  };

  const loadFriends = async () => {
    try {
      const response = await friendAPI.getFriends();
      setFriends(response.data.filter(f => f.status === 'accepted'));
    } catch (error) {
      console.error('Ошибка загрузки друзей:', error);
    }
  };

  const filterItems = (items) => {
    return items.filter(item => 
      item.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getAllChats = () => {
    const personalChats = filterItems(chats);
    const groupChats = filterItems(groups);
    const combined = [...personalChats, ...groupChats];

    // Сначала закреплённые (по pinnedAt desc), затем остальные по времени lastMessageTime desc
    const pinned = combined.filter(i => i.pinned).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
    const others = combined.filter(i => !i.pinned).sort((a, b) => {
      const timeA = new Date(a.lastMessageTime || a.created_at);
      const timeB = new Date(b.lastMessageTime || b.created_at);
      return timeB - timeA;
    });

    // Добавляем разделитель между закреплёнными и остальными
    const result = [];
    if (pinned.length > 0) {
      result.push(...pinned);
    }
    if (others.length > 0) {
      if (pinned.length > 0) {
        result.push({ type: 'divider', id: 'divider' });
      }
      result.push(...others);
    }
    return result;
  };

  const createGroup = () => {
    setFabOpen(false);
    navigation.navigate('CreateGroup');
  };

  const openChat = async (item) => {
    // Устанавливаем активный чат для скрытия индикатора печатания
    setActiveChatId(item.id);
    
    // 📌 Загружаем cardColor пользователя перед открытием чата
    let enrichedItem = { ...item };
    if (!item.type || item.type === 'personal') {
      try {
        const response = await profileAPI.getUserProfile(item.id);
        enrichedItem.cardColor = response.data?.cardColor || item.cardColor || '#FF6B6B';
        console.log('✅ cardColor загружен в ChatsListScreen:', enrichedItem.cardColor);
      } catch (err) {
        console.warn('⚠️ Не удалось загрузить cardColor:', err.message);
        enrichedItem.cardColor = item.cardColor || '#FF6B6B';
      }
    }
    
    // Сбрасываем счётчик непрочитанных перед навигацией
    if (item.type === 'group') {
      setGroups(prev => prev.map(g => g.id === item.id ? { ...g, unreadCount: 0 } : g));
      // ✅ Очищаем статус печатания при открытии группы
      setGroupTypingUsers(prev => {
        const updated = { ...prev };
        delete updated[item.id];
        return updated;
      });
    } else {
      setChats(prev => prev.map(c => c.id === item.id ? { ...c, unreadCount: 0 } : c));
      // ✅ Очищаем статус печатания при открытии личного чата
      setTypingUsers(prev => {
        const updated = { ...prev };
        delete updated[item.id];
        return updated;
      });
    }
    navigation.navigate('Chat', { user: enrichedItem, isGroup: item.type === 'group' });
  };

  const handleLongPress = (item) => {
    setLongPressItem(item);
    setLongPressModalVisible(true);
  };

  const closeLongPressModal = () => {
    setLongPressModalVisible(false);
    setLongPressItem(null);
  };

  const togglePin = async (item) => {
    try {
      const key = `${item.type}-${item.id}`;
      const isCurrentlyPinned = !!(pinnedMap || {})[key];

      let pinnedTimestamp = Date.now();
      if (isCurrentlyPinned) {
        await pinnedChatsAPI.unpinChat(item.type, item.id);
      } else {
        const response = await pinnedChatsAPI.pinChat(item.type, item.id);
        const pinnedPayload = response?.data?.data || response?.data;
        const pinnedAt = pinnedPayload?.pinned_at || pinnedPayload?.pinnedAt;
        if (pinnedAt) {
          const parsed = new Date(pinnedAt).getTime();
          if (!Number.isNaN(parsed)) {
            pinnedTimestamp = parsed;
          }
        }
      }

      const newMap = { ...(pinnedMap || {}) };
      if (isCurrentlyPinned) {
        delete newMap[key];
      } else {
        newMap[key] = pinnedTimestamp;
      }
      await AsyncStorage.setItem('pinnedChats', JSON.stringify(newMap));
      setPinnedMap(newMap);

      // Обновляем состояние списков
      if (item.type === 'group') {
        setGroups(prev => prev.map(g => g.id === item.id ? { ...g, pinned: !!newMap[key], pinnedAt: newMap[key] || null } : g));
      } else {
        setChats(prev => prev.map(c => c.id === item.id ? { ...c, pinned: !!newMap[key], pinnedAt: newMap[key] || null } : c));
      }

      closeLongPressModal();
    } catch (err) {
      console.log('Ошибка togglePin', err?.response?.data || err?.message || err);
      Alert.alert('Ошибка', 'Не удалось обновить закрепление чата. Попробуйте позже.');
      closeLongPressModal();
    }
  };

  const deleteChat = async (item) => {
    // Красивая кастомная модалка вместо Alert.alert
    Alert.alert(
      '⚠️ Удалить чат?',
      `${item.type === 'personal' ? 'Вся история сообщений с ' : 'Вы покинете группу '}"${item.username || item.name}" будет удалена.\n\nЭто действие нельзя отменить.`,
      [
        {
          text: '❌ Отмена',
          onPress: () => {},
          style: 'cancel'
        },
        {
          text: '🗑️ Удалить',
          onPress: async () => {
            try {
              setLoading(true);
              if (item.type === 'personal') {
                // Удаляем личный чат
                await messageAPI.deleteChat(item.id);
                setChats(prev => prev.filter(c => String(c.id) !== String(item.id)));
                
                // Удаляем из закреплённых если там есть
                const key = `personal-${item.id}`;
                const newMap = { ...pinnedMap };
                delete newMap[key];
                setPinnedMap(newMap);
                await AsyncStorage.setItem('pinnedChats', JSON.stringify(newMap));
                
                Alert.alert('✅ Готово', `Чат с ${item.username} удален`);
              } else if (item.type === 'group') {
                // Выходим из группы
                await groupAPI.leaveGroup(item.id);
                setGroups(prev => prev.filter(g => String(g.id) !== String(item.id)));
                
                // Удаляем из закреплённых если там есть
                const key = `group-${item.id}`;
                const newMap = { ...pinnedMap };
                delete newMap[key];
                setPinnedMap(newMap);
                await AsyncStorage.setItem('pinnedChats', JSON.stringify(newMap));
                
                Alert.alert('✅ Готово', `Вы вышли из группы "${item.name}"`);
              }
            } catch (err) {
              console.error('Ошибка удаления чата:', err);
              Alert.alert('❌ Ошибка', err?.response?.data?.error || 'Не удалось удалить чат');
            } finally {
              setLoading(false);
            }
          },
          style: 'destructive'
        }
      ],
      { cancelable: false }
    );
  };

  const toggleFab = () => {
    setFabOpen(!fabOpen);
    Animated.spring(fabAnim, {
      toValue: fabOpen ? 0 : 1,
      useNativeDriver: true,
      tension: 50,
    }).start();
  };

  const handleFabAction = (action) => {
    setFabOpen(false);
    Animated.spring(fabAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
    }).start();

    if (action === 'search') {
      setSearchActive(true);
    } else if (action === 'newChat') {
      setShowNewChatModal(true);
    } else if (action === 'group') {
      createGroup();
    }
  };

  const handleScroll = (event) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDelta = currentScrollY - lastScrollY.current;

    if (scrollDelta > 10 && fabVisible) {
      // Скролл вниз - скрываем FAB
      setFabVisible(false);
      Animated.timing(fabOpacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
      setFabOpen(false);
    } else if (scrollDelta < -10 && !fabVisible) {
      // Скролл вверх - показываем FAB
      setFabVisible(true);
      Animated.timing(fabOpacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }

    lastScrollY.current = currentScrollY;
  };

  const renderChat = ({ item }) => {
    // Рендер специальных элементов
    if (item.type === 'divider') {
      return (
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
      );
    }

    // Рендер обычной карточки чата
    return (
    <TouchableOpacity
      style={[
        styles.chatCard,
        { backgroundColor: theme.surface },
        item.pinned && { borderLeftWidth: 4, borderLeftColor: theme.primary }
      ]}
      onPress={() => openChat(item)}
      onLongPress={() => handleLongPress(item)}
      delayLongPress={400}
    >
      <View style={styles.avatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={[
            styles.avatarPlaceholder,
            item.type === 'group' && { backgroundColor: '#667eea' }
          ]}>
            <Text style={styles.avatarText}>
              {(item.username || item.name)[0].toUpperCase()}
            </Text>
          </View>
        )}
        {item.type === 'personal' && (
          <>
            {item.is_online && (
              <View style={styles.onlineIndicator} />
            )}
          </>
        )}
      </View>

      <View style={styles.chatInfo}>
        <Text style={[styles.chatName, { color: theme.text }]}>
          {item.username || item.name}
        </Text>

        {/* Показываем статус печатания, если есть и чат не открыт */}
        {item.type === 'personal' && typingUsers[item.id] && activeChatId !== item.id ? (
          <Text style={[styles.lastMessage, { color: theme.primary, fontStyle: 'italic' }]} numberOfLines={1}>
            печатает...
          </Text>
        ) : item.type === 'group' && groupTypingUsers[item.id]?.length > 0 && activeChatId !== item.id ? (
          <Text style={[styles.lastMessage, { color: theme.primary, fontStyle: 'italic' }]} numberOfLines={1}>
            {groupTypingUsers[item.id].map(u => u.username).join(', ')} печатает...
          </Text>
        ) : item.lastMessage ? (
          <Text style={[styles.lastMessage, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        ) : (
          <Text style={[styles.memberCount, { color: theme.textSecondary }]}>
            {item.type === 'group' ? `${item.member_count} участников` : 'Нет сообщений'}
          </Text>
        )}
      </View>

      <View style={styles.chatMeta}>
        <View style={styles.timeAndCheckContainer}>
          {item.lastMessageTime && (
            <Text style={[styles.messageTime, { color: theme.textSecondary }]}>
              {new Date(item.lastMessageTime).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          )}
          {/* Галочка статуса прочитания последнего сообщения */}
          {item.lastMessageReadStatus !== undefined && item.lastMessageSenderId === currentUser?.id && (
            <>
              <Text style={[styles.readStatusIcon, { 
                color: item.lastMessageReadStatus ? theme.primary : theme.textLight,
                marginLeft: 4
              }]}>
                {item.lastMessageReadStatus ? '✓✓' : '✓'}
              </Text>

            </>
          )}
        </View>
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
    );
  };

  const renderFriendForNewChat = ({ item }) => (
    <TouchableOpacity
      style={[styles.friendCard, { backgroundColor: theme.surface }]}
      onPress={() => {
          setShowNewChatModal(false);
          // Сбросим непрочитанные для этого пользователя, если он есть в списке
          setChats(prev => prev.map(c => c.id === item.id ? { ...c, unreadCount: 0 } : c));
          navigation.navigate('Chat', { user: item });
      }}
    >
      <View style={styles.avatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.friendInfo}>
        <Text style={[styles.friendName, { color: theme.text }]}>{item.username}</Text>
        {item.status && (
          <Text style={[styles.friendStatus, { color: theme.textSecondary }]}>{item.status}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.contentWrapper}>
        {searchActive && (
          <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={20} color={theme.textLight} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Поиск чатов..."
              placeholderTextColor={theme.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={theme.textLight} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={[styles.tabs, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'chats' && styles.activeTab]}
            onPress={() => setActiveTab('chats')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'chats' ? theme.primary : theme.textSecondary }
            ]}>
              Все чаты
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'personal' && styles.activeTab]}
            onPress={() => setActiveTab('personal')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'personal' ? theme.primary : theme.textSecondary }
            ]}>
              Личные
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'groups' && styles.activeTab]}
            onPress={() => setActiveTab('groups')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'groups' ? theme.primary : theme.textSecondary }
            ]}>
              Группы
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={
            activeTab === 'chats' ? getAllChats() :
            activeTab === 'personal' ? filterItems(chats) :
            filterItems(groups)
          }
          renderItem={renderChat}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={async () => {
                setLoading(true);
                try {
                  await loadChats(pinnedMap);
                  await loadGroups(pinnedMap);
                } finally {
                  setLoading(false);
                }
              }}
            />
          }
          contentContainerStyle={styles.chatsList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchQuery ? 'Ничего не найдено' : 'Нет чатов'}
              </Text>
            </View>
          }
        />
      </View>

      <Modal
        visible={showNewChatModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewChatModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Новый чат</Text>
            <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={20} color={theme.textLight} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Поиск друзей..."
              placeholderTextColor={theme.textLight}
            />
          </View>

          <FlatList
            data={friends}
            renderItem={renderFriendForNewChat}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.friendsList}
          />
        </View>
      </Modal>

      {/* Long-press modal for chat actions (pin/unpin, mute, etc.) */}
      <Modal
        visible={longPressModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeLongPressModal}
      >
        <View style={styles.longPressBackdrop}>
          <View style={[styles.longPressModal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.longPressTitle, { color: theme.text }]}>{longPressItem ? (longPressItem.username || longPressItem.name) : 'Чат'}</Text>
            <Text style={[styles.longPressSubtitle, { color: theme.textSecondary }]}>Действия с чатом</Text>

            <TouchableOpacity
              style={[styles.longPressButton, { backgroundColor: longPressItem?.pinned ? '#eee' : theme.primary }]}
              onPress={() => {
                if (longPressItem) togglePin(longPressItem);
                closeLongPressModal();
              }}
            >
              <Text style={[styles.longPressButtonText, { color: longPressItem?.pinned ? theme.text : '#fff' }]}>
                {longPressItem?.pinned ? 'Открепить' : 'Закрепить'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.longPressButton, { backgroundColor: '#f3f4f6' }]}
              onPress={closeLongPressModal}
            >
              <Text style={[styles.longPressButtonText, { color: theme.text }]}>Отмена</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.longPressButton, { backgroundColor: '#fee2e2' }]}
              onPress={() => {
                if (longPressItem) deleteChat(longPressItem);
                closeLongPressModal();
              }}
            >
              <Text style={[styles.longPressButtonText, { color: '#dc2626' }]}>🗑️ Удалить чат</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FAB Menu */}
      {fabOpen && (
        <Animated.View style={[
          styles.fabMenu,
          {
            opacity: fabAnim,
            transform: [
              { scale: fabAnim },
              {
                translateY: fabOpacityAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [100, 0]
                })
              },
              { translateX: -5 }
            ]
          }
        ]}>
          <TouchableOpacity 
            style={[styles.fabMenuItem, { backgroundColor: theme.primary }]}
            onPress={() => handleFabAction('search')}
          >
            <Ionicons name="search" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.fabMenuItem, { backgroundColor: theme.primary }]}
            onPress={() => handleFabAction('group')}
          >
            <Ionicons name="people" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.fabMenuItem, { backgroundColor: theme.primary }]}
            onPress={() => handleFabAction('newChat')}
          >
            <Ionicons name="create" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* FAB Button */}
      <Animated.View style={[
        styles.fab,
        {
          opacity: fabOpacityAnim,
          transform: [
            {
              rotate: fabAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '45deg']
              })
            },
            {
              translateY: fabOpacityAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [100, 0]
              })
            }
          ]
        }
      ]}>
        <TouchableOpacity 
          style={[styles.fabButton, { backgroundColor: theme.primary }]}
          onPress={toggleFab}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#f0f0f2',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '500',
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 8,
    marginTop: 12,
    backgroundColor: '#f0f0f2',
    borderRadius: 14,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 11,
  },
  activeTab: {
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  chatsList: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 6,
  },
  pinButton: {
    position: 'absolute',
    left: 8,
    top: 8,
    zIndex: 20,
    padding: 6,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10b981',
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  chatInfo: {
    flex: 1,
    marginRight: 6,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  memberCount: {
    fontSize: 13,
    marginBottom: 1,
    fontWeight: '500',
  },
  lastMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  chatMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  messageTime: {
    fontSize: 12,
    marginBottom: 3,
    fontWeight: '500',
  },
  timeAndCheckContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  readStatusIcon: {
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 3,
  },
  divider: {
    height: 0.8,
    marginVertical: 6,
    marginHorizontal: 12,
  },
  unreadBadge: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  longPressBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  longPressModal: {
    width: '75%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  longPressTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  longPressSubtitle: {
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '500',
  },
  longPressButton: {
    width: '100%',
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: 'center',
    marginBottom: 8,
  },
  longPressButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  friendsList: {
    padding: 12,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 6,
  },
  friendInfo: {
    flex: 1,
    marginLeft: 10,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '700',
  },
  friendStatus: {
    fontSize: 13,
    marginTop: 1,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 100,
  },
  fabButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabMenu: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    alignItems: 'center',
    zIndex: 99,
  },
  fabMenuItem: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});

export default ChatsListScreen;