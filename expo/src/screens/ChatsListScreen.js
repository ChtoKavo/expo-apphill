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
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { messageAPI, groupAPI, friendAPI, pinnedChatsAPI, profileAPI } from '../services/api';
import { subscribeToNewMessages } from '../services/globalNotifications';
import { getOrCreateSocket } from '../services/globalSocket';
import { onMessageSent, onGroupMessageSent, onMessageRead } from '../services/appEvents';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useBackgroundImage } from '../contexts/BackgroundImageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

const ChatsListScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const { setBackgroundImage } = useBackgroundImage();
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
  
  // 🎨 ФОН СТРАНИЦЫ
  const [chatsListBackground, setChatsListBackground] = useState('default');
  const [chatsListBackgroundImage, setChatsListBackgroundImage] = useState(null);
  const [backgroundModalVisible, setBackgroundModalVisible] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  
  const fabAnim = useRef(new Animated.Value(0)).current; // ✅ Анимация FAB
  const fabOpacityAnim = useRef(new Animated.Value(1)).current; // ✅ Анимация прозрачности FAB
  const lastScrollY = useRef(0); // ✅ Отслеживаем позицию скролла
  const socketConnectionRef = useRef(null); // ✅ Сохраняем socket в ref для использования в других местах
  const currentUserRef = useRef(null); // ✅ Ref для актуального currentUser в socket обработчиках

  // ⭐ Очищаем чаты и группы когда currentUser меняется
  useEffect(() => {
    if (!currentUser) return;
    
    console.log(`\n♻️ СМЕНА ПОЛЬЗОВАТЕЛЯ! Новый user_id: ${currentUser.id}`);
    
    // Очищаем все чаты и группы чтобы избежать отображения старых статусов
    setChats([]);
    setGroups([]);
    setTypingUsers({});
    setGroupTypingUsers({});
    
    console.log('🧹 Все чаты и группы очищены\n');
  }, [currentUser?.id]);

  // ✅ Обновляем ref когда currentUser меняется
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

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
    console.log('\n' + '🏠'.repeat(30));
    console.log('🏠 ChatsListScreen: МОНТИРОВАНИЕ компонента');
    console.log('🏠'.repeat(30) + '\n');
    
    let unsub;
    let socketConnection = null;

    (async () => {
      // Загружаем текущего пользователя
      const storedUser = await AsyncStorage.getItem('user');
      const user = storedUser ? JSON.parse(storedUser) : null;
      setCurrentUser(user);
      console.log('🏠 ChatsListScreen: Загружен пользователь:', user?.id, user?.username);
      
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

        console.log('\n' + '🔌'.repeat(30));
        console.log('🔌 ChatsListScreen: Socket получен');
        console.log('   socket.id:', socketConnection.id);
        console.log('   socket.connected:', socketConnection.connected);
        console.log('   user.id:', user?.id);
        console.log('   currentUserRef.current:', currentUserRef.current);
        console.log('🔌'.repeat(30) + '\n');

        // 🔍 ДИАГНОСТИКА: Логируем ВСЕ socket события
        socketConnection.onAny((eventName, ...args) => {
          if (['ping', 'pong'].includes(eventName)) return;
          const dataStr = args[0] ? JSON.stringify(args[0]).substring(0, 200) : 'no data';
          console.log(`📨 [SOCKET EVENT] ${eventName}: ${dataStr}`);
        });

        // ⭐ КРИТИЧНО: Присоединяемся к личной комнате СРАЗУ после получения socket
        if (user && user.id) {
          socketConnection.emit('join_personal_room', user.id);
          socketConnection.emit('authenticate_socket', { user_id: user.id }, (response) => {
            console.log('🔐 authenticate_socket ОТВЕТ:', response);
          });
          // ⭐ НОВОЕ: Подписываемся на события чтения наших сообщений
          socketConnection.emit('subscribe_read_notifications', { user_id: user.id });
          console.log(`✅ ChatsListScreen: Присоединились к личной комнате user_${user.id} (СРАЗУ)`);
          console.log(`✅ ChatsListScreen: Подписались на события чтения`);
        } else {
          console.log('⚠️ ChatsListScreen: user отсутствует, не можем присоединиться к комнате!');
        }

        socketConnection.on('connect', () => {
          console.log('\n🟢 ChatsListScreen: Socket CONNECT event');
          console.log('   socket.id:', socketConnection.id);
          setIsConnected(true);
          
          // При переподключении снова присоединяемся к комнате
          const userId = currentUserRef.current?.id || user?.id;
          if (userId) {
            socketConnection.emit('authenticate_socket', { user_id: userId });
            socketConnection.emit('join_personal_room', userId);
            socketConnection.emit('subscribe_read_notifications', { user_id: userId });
            console.log(`✅ ChatsListScreen: Переподключились к личной комнате user_${userId}`);
          }
        });

          // Слушаем новые личные сообщения
          socketConnection.on('new_message', (message) => {
            console.log('\n' + '📩'.repeat(30));
            console.log('📩 ChatsListScreen: new_message ПОЛУЧЕНО!');
            console.log('   message.id:', message.id);
            console.log('   message.sender_id:', message.sender_id);
            console.log('   message.receiver_id:', message.receiver_id);
            console.log('   message.message:', message.message?.substring(0, 50));
            console.log('   currentUserRef.current?.id:', currentUserRef.current?.id);
            console.log('📩'.repeat(30) + '\n');
            
            // ⭐ КРИТИЧНО: Используем ref для актуального user id
            const myId = currentUserRef.current?.id;
            
            if (!myId) {
              console.log('⚠️ myId отсутствует! currentUserRef.current:', currentUserRef.current);
              return;
            }
            
            setChats(prev => {
              console.log('   📋 Текущие чаты:', prev.map(c => ({ id: c.id, lastMessage: c.lastMessage?.substring(0, 20) })));
              
              // Определяем ID чата
              const isMyMessage = String(message.sender_id) === String(myId);
              const chatId = isMyMessage ? message.receiver_id : message.sender_id;
              
              console.log(`   🔍 isMyMessage: ${isMyMessage}, chatId: ${chatId}`);
              
              const idx = prev.findIndex(c => String(c.id) === String(chatId));
              
              if (idx === -1) {
                console.log('   ⚠️ Чат НЕ НАЙДЕН! chatId:', chatId, 'Доступные ID:', prev.map(c => c.id));
                return prev;
              }
              
              console.log('   ✅ Чат НАЙДЕН на индексе:', idx);
              
              const item = { ...prev[idx] };
              
              // Обновляем последнее сообщение
              item.lastMessage = message.message || '📎 Медиа';
              item.lastMessageTime = message.created_at || new Date().toISOString();
              item.lastMessageId = message.id;
              item.lastMessageSenderId = message.sender_id;
              
              if (isMyMessage) {
                // Моё сообщение - одна галочка
                item.lastMessageReadStatus = false;
                console.log('   ✅ Моё сообщение - одна галочка ✓');
              } else {
                // Входящее - увеличиваем счётчик
                item.unreadCount = (item.unreadCount || 0) + 1;
                item.lastMessageReadStatus = false;
                console.log('   ✅ Входящее сообщение - счётчик:', item.unreadCount);
              }
              
              console.log('   📝 Обновленный lastMessage:', item.lastMessage);
              
              const copy = [...prev];
              copy.splice(idx, 1);
              
              // Сортировка
              if (item.pinned) {
                copy.splice(idx, 0, item);
              } else {
                const pinnedCount = copy.filter(c => c.pinned).length;
                copy.splice(pinnedCount, 0, item);
              }
              
              console.log('   ✅ Чат обновлён и отсортирован');
              return copy;
            });
          });

          // Слушаем новые групповые сообщения
          socketConnection.on('new_group_message', (message) => {
            console.log('\n' + '='.repeat(50));
            console.log('📨 ChatsListScreen: new_group_message получено');
            console.log('   Данные:', JSON.stringify(message, null, 2));
            console.log('='.repeat(50));
            
            // ⭐ КРИТИЧНО: Используем ref для актуального user id
            const myId = currentUserRef.current?.id;
            
            setGroups(prev => {
              const groupId = message.group_id;
              const idx = prev.findIndex(g => String(g.id) === String(groupId));
              
              if (idx === -1) {
                console.log('   ⚠️ Группа не найдена:', groupId);
                return prev;
              }
              
              const item = { ...prev[idx] };
              
              // Обновляем последнее сообщение
              item.lastMessage = message.message || '📎 Медиа';
              item.lastMessageTime = message.created_at || new Date().toISOString();
              item.lastMessageId = message.id;
              item.lastMessageSenderId = message.sender_id;
              
              const isMyMessage = String(message.sender_id) === String(myId);
              
              if (isMyMessage) {
                // Моё сообщение - одна галочка
                item.lastMessageReadStatus = false;
                console.log('   ✅ Моё сообщение в группе - одна галочка ✓');
              } else {
                // Входящее - увеличиваем счётчик
                item.unreadCount = (item.unreadCount || 0) + 1;
                item.lastMessageReadStatus = false;
                console.log('   ✅ Входящее сообщение в группе - счётчик:', item.unreadCount);
              }
              
              const copy = [...prev];
              copy.splice(idx, 1);
              
              // Сортировка
              if (item.pinned) {
                copy.splice(idx, 0, item);
              } else {
                const pinnedCount = copy.filter(c => c.pinned).length;
                copy.splice(pinnedCount, 0, item);
              }
              
              return copy;
            });
          });

          // ⭐ НОВЫЙ ОБРАБОТЧИК: Локальное событие от ChatScreen для мгновенного обновления
          socketConnection.on('new_message_local', (message) => {
            console.log('\n' + '🚀'.repeat(30));
            console.log('🚀 ChatsListScreen: new_message_local получено (ЛОКАЛЬНО от ChatScreen)');
            console.log('   message:', message);
            console.log('🚀'.repeat(30) + '\n');
            
            // Обрабатываем как обычное new_message
            const myId = currentUserRef.current?.id;
            
            if (!message.group_id) {
              // Личное сообщение
              setChats(prev => {
                const chatId = message.receiver_id;
                const idx = prev.findIndex(c => String(c.id) === String(chatId));
                
                if (idx === -1) {
                  console.log('   ⚠️ Чат не найден:', chatId);
                  return prev;
                }
                
                const item = { ...prev[idx] };
                item.lastMessage = message.message || '📎 Медиа';
                item.lastMessageTime = message.created_at || new Date().toISOString();
                item.lastMessageId = message.id;
                item.lastMessageSenderId = message.sender_id;
                item.lastMessageReadStatus = false; // Одна галочка
                
                console.log('   ✅ Чат обновлён локально, lastMessage:', item.lastMessage);
                
                const copy = [...prev];
                copy.splice(idx, 1);
                
                if (item.pinned) {
                  copy.splice(idx, 0, item);
                } else {
                  const pinnedCount = copy.filter(c => c.pinned).length;
                  copy.splice(pinnedCount, 0, item);
                }
                
                return copy;
              });
            } else {
              // Групповое сообщение
              setGroups(prev => {
                const groupId = message.group_id;
                const idx = prev.findIndex(g => String(g.id) === String(groupId));
                
                if (idx === -1) return prev;
                
                const item = { ...prev[idx] };
                item.lastMessage = message.message || '📎 Медиа';
                item.lastMessageTime = message.created_at || new Date().toISOString();
                item.lastMessageId = message.id;
                item.lastMessageSenderId = message.sender_id;
                item.lastMessageReadStatus = false;
                
                console.log('   ✅ Группа обновлена локально, lastMessage:', item.lastMessage);
                
                const copy = [...prev];
                copy.splice(idx, 1);
                
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

          // ✅ Слушаем событие от ChatScreen когда ВЫ отправили сообщение
          socketConnection.on('message_sent', (message) => {
            console.log('\n' + '📤'.repeat(30));
            console.log('📤 ChatsListScreen: message_sent получено');
            console.log(`   message_id: ${message.id}`);
            console.log(`   sender_id: ${message.sender_id}`);
            console.log(`   receiver_id: ${message.receiver_id}`);
            console.log(`   group_id: ${message.group_id}`);
            console.log(`   message: ${message.message}`);
            console.log('📤'.repeat(30) + '\n');
            
            if (message.group_id) {
              // Это групповое сообщение
              setGroups(prev => {
                const groupId = message.group_id;
                const idx = prev.findIndex(g => String(g.id) === String(groupId));
                
                if (idx === -1) {
                  console.log('   ⚠️ Группа не найдена, groupId:', groupId);
                  return prev;
                }
                
                const item = { ...prev[idx] };
                item.lastMessage = message.message || '📎 Медиа';
                item.lastMessageTime = message.created_at || new Date().toISOString();
                item.lastMessageReadStatus = false; // ⭐ Одна галочка для отправленного
                item.lastMessageSenderId = message.sender_id;
                item.lastMessageId = message.id; // ⭐ ДОБАВЛЕНО!
                
                console.log('   ✅ Группа обновлена, lastMessage:', item.lastMessage);
                
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
                
                if (idx === -1) {
                  console.log('   ⚠️ Чат не найден, chatId:', chatId);
                  return prev;
                }
                
                const item = { ...prev[idx] };
                item.lastMessage = message.message || '📎 Медиа';
                item.lastMessageTime = message.created_at || new Date().toISOString();
                item.lastMessageReadStatus = false; // ⭐ Одна галочка для отправленного
                item.lastMessageSenderId = message.sender_id;
                item.lastMessageId = message.id; // ⭐ ДОБАВЛЕНО!
                
                console.log('   ✅ Чат обновлён, lastMessage:', item.lastMessage);
                
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

          // 🔴 ОБНОВЛЕНИЕ СТАТУСА ПОЛЬЗОВАТЕЛЯ
          socketConnection.on('user_status_changed', (data) => {
            console.log('\n' + '🟢'.repeat(30));
            console.log('🟢 ChatsListScreen: user_status_changed получен');
            console.log('   Данные:', JSON.stringify(data));
            console.log('🟢'.repeat(30) + '\n');
            
            // Извлекаем данные из разных форматов
            let targetUserId = data?.userId ?? data?.user_id ?? data?.id;
            let isOnline = undefined;
            
            // Определяем статус
            if (typeof data?.is_online === 'boolean') {
              isOnline = data.is_online;
            } else if (typeof data?.online === 'boolean') {
              isOnline = data.online;
            } else if (typeof data?.status === 'string') {
              const s = data.status.toLowerCase();
              isOnline = ['online', 'в сети', 'on', '1'].includes(s);
            }
            
            console.log(`   Извлечено: targetUserId=${targetUserId}, isOnline=${isOnline}`);
            
            if (targetUserId === undefined || isOnline === undefined) {
              console.log(`   ⚠️ Не удалось извлечь данные из события`);
              return;
            }
            
            // ⭐ КРИТИЧНО: Проверяем что это НЕ мы сами
            const myId = currentUserRef.current?.id;
            if (String(targetUserId) === String(myId)) {
              console.log(`   ⏭️ Это наш собственный статус, пропускаем`);
              return;
            }
            
            // ✅ Обновляем статус в чатах
            setChats(prev => {
              const idx = prev.findIndex(c => String(c.id) === String(targetUserId));
              if (idx === -1) {
                console.log(`   ⚠️ Чат с id=${targetUserId} не найден`);
                return prev;
              }
              
              // Проверяем что статус реально изменился
              const currentStatus = prev[idx].is_online;
              if (currentStatus === isOnline) {
                console.log(`   ⏭️ Статус не изменился (${currentStatus}), пропускаем`);
                return prev;
              }
              
              console.log(`   ✅ Обновляю статус чата ${targetUserId}: ${currentStatus} → ${isOnline}`);
              const updated = [...prev];
              updated[idx] = { ...updated[idx], is_online: isOnline };
              return updated;
            });
          });

          // ✅ user_online
          socketConnection.on('user_online', (data) => {
            const targetUserId = data?.userId ?? data?.user_id ?? data?.id;
            if (!targetUserId) return;
            
            const myId = currentUserRef.current?.id;
            if (String(targetUserId) === String(myId)) return;
            
            console.log('🟢 user_online:', targetUserId);
            
            setChats(prev => {
              const idx = prev.findIndex(c => String(c.id) === String(targetUserId));
              if (idx === -1) return prev;
              if (prev[idx].is_online === true) return prev;
              
              console.log(`   ✅ Чат ${targetUserId}: онлайн`);
              const updated = [...prev];
              updated[idx] = { ...updated[idx], is_online: true };
              return updated;
            });
          });

          // ✅ user_offline
          socketConnection.on('user_offline', (data) => {
            const targetUserId = data?.userId ?? data?.user_id ?? data?.id;
            if (!targetUserId) return;
            
            const myId = currentUserRef.current?.id;
            if (String(targetUserId) === String(myId)) return;
            
            console.log('🔴 user_offline:', targetUserId);
            
            setChats(prev => {
              const idx = prev.findIndex(c => String(c.id) === String(targetUserId));
              if (idx === -1) return prev;
              if (prev[idx].is_online === false) return prev;
              
              console.log(`   ✅ Чат ${targetUserId}: офлайн`);
              const updated = [...prev];
              updated[idx] = { ...updated[idx], is_online: false };
              return updated;
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
            // ⭐ Используем ref
            const myId = currentUserRef.current?.id;
            if (user_id === myId) {
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
            console.log('\n' + '✓✓'.repeat(30));
            console.log('📨 ChatsListScreen: message_read_status_updated');
            console.log('   Данные:', JSON.stringify(data));
            console.log('✓✓'.repeat(30) + '\n');
            
            const { message_id, is_read, sender_id, receiver_id, group_id, reader_id, chat_id, read_by } = data;
            
            // ⭐ КРИТИЧНО: Используем ref для актуального user id
            const myId = currentUserRef.current?.id;
            
            // Преобразуем is_read в boolean
            const isReadBool = is_read === true || is_read === 1 || is_read === '1';
            
            console.log(`   🔍 АНАЛИЗ:`);
            console.log(`      myId: ${myId}`);
            console.log(`      sender_id: ${sender_id}`);
            console.log(`      receiver_id: ${receiver_id}`);
            console.log(`      reader_id: ${reader_id}`);
            console.log(`      read_by: ${read_by}`);
            console.log(`      chat_id: ${chat_id}`);
            console.log(`      message_id: ${message_id}`);
            console.log(`      is_read: ${is_read} (bool: ${isReadBool})`);
            console.log(`      group_id: ${group_id}`);
            
            if (!isReadBool) {
              console.log('   ⏭️ is_read не true, пропускаем');
              return;
            }
            
            // ⭐ КРИТИЧНО: Обновляем галочку если:
            // Это НАШЕ сообщение (sender_id === myId) и его ПРОЧИТАЛИ
            
            if (group_id) {
              // Групповой чат
              setGroups(prev => {
                console.log(`   📋 Текущие группы:`, prev.map(g => ({ id: g.id, name: g.name, lastMessageReadStatus: g.lastMessageReadStatus })));
                
                return prev.map(group => {
                  if (String(group.id) !== String(group_id)) return group;
                  
                  // Проверяем что это наше сообщение
                  if (String(sender_id) !== String(myId)) {
                    console.log(`   ⏭️ Не наше сообщение в группе ${group_id} (sender=${sender_id}, myId=${myId})`);
                    return group;
                  }
                  
                  // ⭐ ИСПРАВЛЕНО: НЕ проверяем lastMessageId - обновляем статус последнего сообщения в любом случае
                  // Потому что если прочитали любое наше сообщение - значит прочитали и последнее
                  
                  console.log(`   ✅ Группа ${group_id}: две галочки ✓✓`);
                  return { ...group, lastMessageReadStatus: true };
                });
              });
            } else {
              // Личный чат
              setChats(prev => {
                console.log(`   📋 Текущие чаты:`, prev.map(c => ({ id: c.id, username: c.username, lastMessageReadStatus: c.lastMessageReadStatus, lastMessageSenderId: c.lastMessageSenderId })));
                
                // ⭐ ИСПРАВЛЕНО: Определяем chatId - с кем чат, в котором прочитали сообщение
                // Если я отправитель - чат с receiver_id (или reader_id)
                // Если читатель не я - значит это наше сообщение и его прочитали
                
                const actualReaderId = reader_id || read_by;
                const isMyMessage = String(sender_id) === String(myId);
                
                console.log(`   🔍 isMyMessage: ${isMyMessage}, actualReaderId: ${actualReaderId}`);
                
                if (!isMyMessage) {
                  console.log(`   ⏭️ Это НЕ наше сообщение (sender_id=${sender_id}, myId=${myId}), пропускаем`);
                  return prev;
                }
                
                // Это наше сообщение - его кто-то прочитал
                // Чат находится с получателем (receiver_id) или с тем кто прочитал
                const targetChatId = receiver_id || actualReaderId || chat_id;
                
                console.log(`   🎯 Ищем чат с ID: ${targetChatId}`);
                
                return prev.map(chat => {
                  // Пробуем найти чат по разным ID
                  const chatMatches = 
                    String(chat.id) === String(targetChatId) ||
                    String(chat.id) === String(receiver_id) ||
                    String(chat.id) === String(actualReaderId) ||
                    String(chat.id) === String(chat_id);
                  
                  if (!chatMatches) {
                    return chat;
                  }
                  
                  // ⭐ ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: убедимся что lastMessageSenderId === myId
                  // Чтобы не обновлять галочку если последнее сообщение не наше
                  if (chat.lastMessageSenderId && String(chat.lastMessageSenderId) !== String(myId)) {
                    console.log(`   ⏭️ Последнее сообщение в чате ${chat.id} не наше (lastMessageSenderId=${chat.lastMessageSenderId})`);
                    return chat;
                  }
                  
                  console.log(`   ✅ Чат ${chat.id} (${chat.username}): две галочки ✓✓`);
                  return { ...chat, lastMessageReadStatus: true };
                });
              });
            }
          });

          // 🔴 ДОПОЛНИТЕЛЬНЫЙ ОБРАБОТЧИК: messages_read (пакетное прочтение)
          socketConnection.on('messages_read', (data) => {
            console.log('\n' + '✓✓'.repeat(30));
            console.log('📨 ChatsListScreen: messages_read (пакетное)');
            console.log('   Данные:', JSON.stringify(data));
            console.log('✓✓'.repeat(30) + '\n');
            
            const { reader_id, chat_id, chat_type, sender_id } = data;
            const myId = currentUserRef.current?.id;
            
            // Если читатель - это мы сами, пропускаем (нам не нужно обновлять галочки для своих сообщений)
            if (String(reader_id) === String(myId)) {
              console.log('   ⏭️ Читатель - мы сами, пропускаем');
              return;
            }
            
            // Если sender_id указан и это мы - обновляем галочки
            if (sender_id && String(sender_id) === String(myId)) {
              if (chat_type === 'group') {
                setGroups(prev => prev.map(group => {
                  if (String(group.id) !== String(chat_id)) return group;
                  console.log(`   ✅ Группа ${chat_id}: две галочки ✓✓ (messages_read)`);
                  return { ...group, lastMessageReadStatus: true };
                }));
              } else {
                // Для личного чата - chat_id это ID собеседника
                setChats(prev => prev.map(chat => {
                  if (String(chat.id) !== String(chat_id)) return chat;
                  console.log(`   ✅ Чат ${chat_id}: две галочки ✓✓ (messages_read)`);
                  return { ...chat, lastMessageReadStatus: true };
                }));
              }
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
            // ⭐ Используем ref
            const myId = currentUserRef.current?.id;
            if (data && myId && String(data.id) === String(myId)) {
              const updatedUser = { ...currentUserRef.current, ...data };
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
            // ⭐ КРИТИЧНО: Используем ref
            const myId = currentUserRef.current?.id;
            const isMember = groupData.members && (
              groupData.members.includes(myId) ||
              groupData.members.some(m => String(m.id) === String(myId) || String(m) === String(myId))
            );
            
            console.log(`   Member check: isMember=${isMember}, members=${groupData.members}, myId=${myId}`);
            
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
                lastMessageSenderId: myId,
                lastMessageReadStatus: false,
                unreadCount: 0,
                isGroup: true,
                members: groupData.members || []
              };
              setGroups(prev => [newGroup, ...prev]);
            }
          });

          // ✅ СЛУШАТЕЛИ ДЛЯ СТАТУСА ПЕЧАТАНИЯ - ВНУТРИ try-catch
          // Для личных чатов
          socketConnection.on('user_typing', (data) => {
            console.log('📝 ChatsListScreen: user_typing получено', data);
            const { from_user_id, from_user_username, to_user_id, is_typing } = data;
            
            if (is_typing) {
              setTypingUsers(prev => ({
                ...prev,
                [from_user_id]: {
                  userId: from_user_id,
                  username: from_user_username,
                  timestamp: Date.now()
                }
              }));
              console.log(`✅ ${from_user_username}(${from_user_id}) печатает`);
            } else {
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
            console.log('📝 ChatsListScreen: group_user_typing получено', data);
            const { group_id, user_id, username, is_typing } = data;
            
            setGroupTypingUsers(prev => {
              const updated = { ...prev };
              
              if (!updated[group_id]) {
                updated[group_id] = [];
              }
              
              const existingIndex = updated[group_id].findIndex(u => u.userId === user_id);
              
              if (is_typing) {
                if (existingIndex !== -1) {
                  updated[group_id][existingIndex].timestamp = Date.now();
                } else {
                  updated[group_id].push({
                    userId: user_id,
                    username: username,
                    timestamp: Date.now()
                  });
                  console.log(`✅ ${username} начал печатать в группе ${group_id}`);
                }
              } else {
                if (existingIndex !== -1) {
                  updated[group_id].splice(existingIndex, 1);
                  console.log(`⏹️ ${username} перестал печатать в группе ${group_id}`);
                }
                if (updated[group_id].length === 0) {
                  delete updated[group_id];
                }
              }
              
              return updated;
            });
          });

          // ✅ НОВОЕ: Обработка reconnect событий
          socketConnection.on('reconnect', (attemptNumber) => {
            console.log('🔄 Socket переподключился после', attemptNumber, 'попыток');
            setIsConnected(true);
            
            // Переподключаемся к комнатам
            if (user && user.id) {
              socketConnection.emit('authenticate_socket', { user_id: user.id });
              socketConnection.emit('join_personal_room', user.id);
              console.log('✅ Переподключились к личной комнате user_' + user.id);
            }
          });

          socketConnection.on('reconnect_attempt', (attemptNumber) => {
            console.log('🔄 Попытка переподключения #' + attemptNumber);
          });

          socketConnection.on('reconnect_error', (error) => {
            console.error('❌ Ошибка переподключения:', error.message);
          });

      } catch (error) {
        console.error('Ошибка подключения Socket.io в ChatsListScreen:', error);
      }
    })();

    return () => {
      unsub && unsub();
      
      // ✅ ИСПРАВЛЕНО: Используем ref вместо локальной переменной
      const socket = socketConnectionRef.current;
      if (socket) {
        // Отписываемся от всех событий
        socket.off('connect');
        socket.off('disconnect');
        socket.off('new_message');
        socket.off('new_message_local'); // ⭐ ДОБАВЛЕНО
        socket.off('new_group_message');
        socket.off('message_sent');
        socket.off('user_status_changed');
        socket.off('user_online');
        socket.off('user_offline');
        socket.off('group_avatar_updated');
        socket.off('user_left_group');
        socket.off('message_read_status_updated');
        socket.off('chat_cleared');
        socket.off('profile_updated');
        socket.off('chat_unread_count_updated');
        socket.off('group_created');
        socket.off('user_typing');
        socket.off('group_user_typing');
        socket.off('reconnect');
        socket.off('reconnect_attempt');
        socket.off('reconnect_error');
        
        console.log('✅ ChatsListScreen: Отписались от всех socket событий');
        // НЕ делаем disconnect() - это глобальный socket!
      }
      socketConnectionRef.current = null;
    };
  }, []);

  // ⭐ ПОДПИСКА НА ЛОКАЛЬНЫЕ СОБЫТИЯ ПРИЛОЖЕНИЯ (AppEvents)
  // Это критично для обновления lastMessage когда пользователь сам отправляет сообщение
  useEffect(() => {
    console.log('🔔 ChatsListScreen: Подписываемся на AppEvents');
    
    // Обработчик отправленного личного сообщения
    const handleMessageSent = (message) => {
      console.log('\n' + '🚀'.repeat(30));
      console.log('🚀 ChatsListScreen: AppEvents MESSAGE_SENT получено!');
      console.log('   message.id:', message.id);
      console.log('   message.sender_id:', message.sender_id);
      console.log('   message.receiver_id:', message.receiver_id);
      console.log('   message.message:', message.message?.substring(0, 50));
      console.log('   currentUserRef.current?.id:', currentUserRef.current?.id);
      console.log('🚀'.repeat(30) + '\n');
      
      const myId = currentUserRef.current?.id;
      if (!myId) {
        console.log('⚠️ AppEvents: myId отсутствует!');
        return;
      }
      
      setChats(prev => {
        console.log('   📋 Текущие чаты (AppEvents):', prev.map(c => ({ id: c.id, lastMessage: c.lastMessage?.substring(0, 20) })));
        
        // Определяем ID чата - для отправленного сообщения это receiver_id
        const chatId = message.receiver_id;
        
        console.log(`   🔍 Ищем чат с ID: ${chatId}`);
        
        const idx = prev.findIndex(c => String(c.id) === String(chatId));
        
        if (idx === -1) {
          console.log('   ⚠️ Чат НЕ НАЙДЕН! chatId:', chatId, 'Доступные ID:', prev.map(c => c.id));
          return prev;
        }
        
        console.log('   ✅ Чат НАЙДЕН на индексе:', idx);
        
        const item = { ...prev[idx] };
        
        // Обновляем последнее сообщение
        item.lastMessage = message.message || '📎 Медиа';
        item.lastMessageTime = message.created_at || new Date().toISOString();
        item.lastMessageId = message.id;
        item.lastMessageSenderId = message.sender_id;
        item.lastMessageReadStatus = false; // Моё сообщение - одна галочка
        
        console.log('   📝 Обновленный lastMessage:', item.lastMessage);
        
        const copy = [...prev];
        copy.splice(idx, 1);
        
        // Сортировка - поднимаем чат вверх (но не выше закреплённых)
        if (item.pinned) {
          copy.splice(idx, 0, item);
        } else {
          const pinnedCount = copy.filter(c => c.pinned).length;
          copy.splice(pinnedCount, 0, item);
        }
        
        console.log('   ✅ Чат обновлён через AppEvents!');
        return copy;
      });
    };
    
    // Обработчик отправленного группового сообщения
    const handleGroupMessageSent = (message) => {
      console.log('\n' + '🚀'.repeat(30));
      console.log('🚀 ChatsListScreen: AppEvents GROUP_MESSAGE_SENT получено!');
      console.log('   message.group_id:', message.group_id);
      console.log('🚀'.repeat(30) + '\n');
      
      setGroups(prev => {
        const groupId = message.group_id;
        const idx = prev.findIndex(g => String(g.id) === String(groupId));
        
        if (idx === -1) {
          console.log('   ⚠️ Группа не найдена:', groupId);
          return prev;
        }
        
        const item = { ...prev[idx] };
        item.lastMessage = message.message || '📎 Медиа';
        item.lastMessageTime = message.created_at || new Date().toISOString();
        item.lastMessageId = message.id;
        item.lastMessageSenderId = message.sender_id;
        item.lastMessageReadStatus = false;
        
        const copy = [...prev];
        copy.splice(idx, 1);
        
        if (item.pinned) {
          copy.splice(idx, 0, item);
        } else {
          const pinnedCount = copy.filter(c => c.pinned).length;
          copy.splice(pinnedCount, 0, item);
        }
        
        console.log('   ✅ Группа обновлена через AppEvents!');
        return copy;
      });
    };
    
    // Обработчик события прочтения сообщения (для галочек ✓✓)
    const handleMessageRead = (data) => {
      console.log('\n' + '✓✓'.repeat(30));
      console.log('✓✓ ChatsListScreen: AppEvents MESSAGE_READ получено!');
      console.log('   Данные:', JSON.stringify(data));
      console.log('✓✓'.repeat(30) + '\n');
      
      const { message_id, sender_id, receiver_id, group_id, is_read } = data;
      
      const myId = currentUserRef.current?.id;
      if (!myId) {
        console.log('   ⚠️ myId отсутствует!');
        return;
      }
      
      // ⭐ Обновляем галочку только если это НАШЕ сообщение (sender_id === myId)
      // и его прочитали
      if (String(sender_id) !== String(myId)) {
        console.log('   ⏭️ Это не наше сообщение, пропускаем');
        return;
      }
      
      if (group_id) {
        // Групповой чат
        setGroups(prev => prev.map(group => {
          if (String(group.id) !== String(group_id)) return group;
          
          console.log(`   ✅ Группа ${group_id}: две галочки ✓✓`);
          return { ...group, lastMessageReadStatus: true };
        }));
      } else {
        // Личный чат - ищем чат с receiver_id
        setChats(prev => prev.map(chat => {
          if (String(chat.id) !== String(receiver_id)) return chat;
          
          console.log(`   ✅ Чат ${chat.id}: две галочки ✓✓`);
          return { ...chat, lastMessageReadStatus: true };
        }));
      }
    };
    
    // Подписываемся
    const unsubMessageSent = onMessageSent(handleMessageSent);
    const unsubGroupMessageSent = onGroupMessageSent(handleGroupMessageSent);
    const unsubMessageRead = onMessageRead(handleMessageRead);
    
    return () => {
      console.log('🔕 ChatsListScreen: Отписываемся от AppEvents');
      unsubMessageSent();
      unsubGroupMessageSent();
      unsubMessageRead();
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
      console.log('📱 ChatsListScreen: Вернулись на экран');
      setActiveChatId(null);
      
      // Восстанавливаем фоновое изображение если оно было установлено
      if (chatsListBackground === 'custom' && chatsListBackgroundImage) {
        setBackgroundImage(chatsListBackgroundImage);
      }
      
      // Перезагружаем друзей при возврате на экран
      loadFriends();
      
      // ⚡ НЕ перезагружаем полностью!
      // Socket события уже обновляют данные в реальном времени:
      // - new_message
      // - message_read_status_updated
      // - user_status_changed
      // Полная загрузка происходит только:
      // 1. При первом монтировании компонента (useEffect)
      // 2. При pull-to-refresh (RefreshControl)
    }, [chatsListBackground, chatsListBackgroundImage, setBackgroundImage])  // ← Зависимости для отслеживания изображения
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

  // 🎨 ФОН СТРАНИЦЫ: Загрузка настроек
  useEffect(() => {
    loadChatsListBackground();
  }, []);

  const loadChatsListBackground = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch('http://151.247.196.66:3001/api/user/preferences', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const bg = data.chats_list_background || 'default';
      setChatsListBackground(bg);
      
      if (bg === 'custom') {
        await loadCustomChatsListBackground();
      }
    } catch (err) {
      setChatsListBackground('default');
    }
  };

  const loadCustomChatsListBackground = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch('http://151.247.196.66:3001/api/user/chats-list-background/image', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success && data.image) {
        if (data.image.startsWith('data:')) {
          setChatsListBackgroundImage(data.image);
          setBackgroundImage(data.image);
        } else {
          const imageUrl = `data:image/jpeg;base64,${data.image}`;
          setChatsListBackgroundImage(imageUrl);
          setBackgroundImage(imageUrl);
        }
      }
    } catch (err) {
      console.log('Кастомный фон не найден');
    }
  };

  const selectChatsListBackground = async (backgroundType) => {
    setBackgroundLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch('http://151.247.196.66:3001/api/user/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ chats_list_background: backgroundType })
      });
      
      setChatsListBackground(backgroundType);
      setChatsListBackgroundImage(null);
      setBackgroundImage(null);
      setBackgroundModalVisible(false);
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось сменить фон');
    } finally {
      setBackgroundLoading(false);
    }
  };

  const pickCustomChatsListBackground = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      setBackgroundLoading(true);
      try {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const token = await AsyncStorage.getItem('token');
        
        const response = await fetch('http://151.247.196.66:3001/api/user/chats-list-background/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ image: base64Image })
        });
        
        const data = await response.json();
        
        if (data.success) {
          setChatsListBackground('custom');
          setChatsListBackgroundImage(base64Image);
          setBackgroundImage(base64Image);
          setBackgroundModalVisible(false);
        } else {
          Alert.alert('Ошибка', data.error || 'Не удалось загрузить изображение');
        }
      } catch (err) {
        Alert.alert('Ошибка', 'Не удалось загрузить изображение');
      } finally {
        setBackgroundLoading(false);
      }
    }
  };

  const resetChatsListBackground = async () => {
    setBackgroundLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch('http://151.247.196.66:3001/api/user/chats-list-background', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setChatsListBackground('default');
      setChatsListBackgroundImage(null);
      setBackgroundImage(null);
      setBackgroundModalVisible(false);
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось сбросить фон');
    } finally {
      setBackgroundLoading(false);
    }
  };

  const getChatsListBackgroundColor = () => {
    if (chatsListBackground === 'custom' && chatsListBackgroundImage) {
      return 'transparent';
    }
    
    const backgrounds = {
      'default': theme.background,
      'light-blue': '#E3F2FD',
      'light-green': '#E8F5E9',
      'light-pink': '#FCE4EC',
      'light-purple': '#F3E5F5',
      'light-orange': '#FFF3E0',
      'dark-blue': '#1E3A8A',
      'dark-green': '#1B4332',
    };
    return backgrounds[chatsListBackground] || theme.background;
  };

  // ⭐ НОВАЯ ФУНКЦИЯ: Загружает детали чатов в фоне с ограничением параллельных запросов
  const loadChatsDetailsAsync = async (allFriends, mapArg) => {
    try {
      const CONCURRENT_LIMIT = 3; // Максимум 3 одновременных запроса
      
      for (let i = 0; i < allFriends.length; i += CONCURRENT_LIMIT) {
        const batch = allFriends.slice(i, i + CONCURRENT_LIMIT);
        
        const detailedChats = await Promise.all(batch.map(async (friend) => {
          try {
            const messagesResp = await messageAPI.getMessages(friend.id);
            const currentUser = await AsyncStorage.getItem('user');
            const currentUserId = currentUser ? JSON.parse(currentUser).id : null;
            
            if (messagesResp.data && messagesResp.data.length > 0) {
              const lastMsg = messagesResp.data[messagesResp.data.length - 1];
              
              // Получаем время последнего открытия чата
              let lastVisitTimeStr = await AsyncStorage.getItem(`chat_visit_${friend.id}`);
              let lastVisitTime = 0;
              
              if (lastVisitTimeStr) {
                lastVisitTime = new Date(lastVisitTimeStr).getTime();
              } else {
                const now = new Date().toISOString();
                await AsyncStorage.setItem(`chat_visit_${friend.id}`, now);
                lastVisitTime = new Date(now).getTime();
              }
              
              // Подсчитываем непрочитанные
              let unreadCount = 0;
              if (currentUserId) {
                unreadCount = messagesResp.data.filter(msg => {
                  const msgTime = new Date(msg.created_at || msg.createdAt).getTime();
                  return msg.sender_id === friend.id && 
                         msg.receiver_id === currentUserId &&
                         msgTime > lastVisitTime &&
                         !msg.is_read;
                }).length;
              }
              
              return {
                id: friend.id,
                lastMessage: lastMsg.message || '📎 Медиа',
                lastMessageTime: lastMsg.created_at || lastMsg.createdAt,
                lastMessageId: lastMsg.id,
                lastMessageSenderId: lastMsg.sender_id,
                // ⭐ ИСПРАВЛЕНО: Показываем реальный статус прочтения
                lastMessageReadStatus: lastMsg.is_read === true || lastMsg.is_read === 1,
                unreadCount: unreadCount,
              };
            }
          } catch (err) {
            // Игнорируем ошибки для отдельных чатов
          }
          return null;
        }));
        
        // Обновляем чаты с детальной информацией
        setChats(prev => {
          const updated = [...prev];
          detailedChats.forEach(detailed => {
            if (detailed) {
              const idx = updated.findIndex(c => c.id === detailed.id);
              if (idx > -1) {
                updated[idx] = {
                  ...updated[idx],
                  ...detailed
                };
              }
            }
          });
          return updated;
        });
        
        // Даём браузеру время отдохнуть между батчами
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err) {
      // Ошибка фоновой загрузки не критична
    }
  };

  const loadChats = async (mapArg) => {
    try {
      setIsAppWorking(true);
      const response = await friendAPI.getFriends();
      const allFriends = response.data.filter(f => f.status === 'accepted');
      
      const map = mapArg || pinnedMap || {};
      
      // ⭐ ИСПРАВЛЕНИЕ 1: Сразу показываем чаты БЕЗ полной истории сообщений
      const mapped = allFriends.map((friend) => {
        const lastMessage = friend.last_message || friend.lastMessage || '';
        const lastMessageTime = friend.last_message_time || friend.lastMessageTime || new Date().toISOString();
        const unreadCount = friend.unread_count || friend.unreadCount || 0;
        const key = `personal-${friend.id}`;
        const pinnedAt = map[key] || null;
        
        return {
          ...friend,
          type: 'personal',
          lastMessage: lastMessage || '📎 Медиа',
          lastMessageTime,
          lastMessageReadStatus: false,
          lastMessageId: null,
          lastMessageSenderId: null,
          unreadCount,
          pinned: !!pinnedAt,
          pinnedAt,
          is_online: friend.is_online || friend.isOnline || friend.online || false
        };
      });

      setChats(mapped);
      setIsAppWorking(false);
      
      // ⭐ ИСПРАВЛЕНИЕ 2: Загружаем детали в фоне (не блокируя UI)
      loadChatsDetailsAsync(allFriends, map);
      
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
      setIsAppWorking(false);
    }
  };

  // ⭐ НОВАЯ ФУНКЦИЯ: Загружает детали групп в фоне с ограничением параллельных запросов
  const loadGroupsDetailsAsync = async (allGroups) => {
    try {
      const CONCURRENT_LIMIT = 3;
      
      for (let i = 0; i < allGroups.length; i += CONCURRENT_LIMIT) {
        const batch = allGroups.slice(i, i + CONCURRENT_LIMIT);
        
        const detailedGroups = await Promise.all(batch.map(async (group) => {
          try {
            const messagesResp = await groupAPI.getGroupMessages(group.id);
            const currentUser = await AsyncStorage.getItem('user');
            const currentUserId = currentUser ? JSON.parse(currentUser).id : null;
            
            if (messagesResp.data && messagesResp.data.length > 0) {
              const lastMsg = messagesResp.data[messagesResp.data.length - 1];
              
              // Получаем время последнего открытия группы
              let lastVisitTimeStr = await AsyncStorage.getItem(`group_visit_${group.id}`);
              let lastVisitTime = 0;
              
              if (lastVisitTimeStr) {
                lastVisitTime = new Date(lastVisitTimeStr).getTime();
              } else {
                const now = new Date().toISOString();
                await AsyncStorage.setItem(`group_visit_${group.id}`, now);
                lastVisitTime = new Date(now).getTime();
              }
              
              // Подсчитываем непрочитанные
              let unreadCount = 0;
              if (currentUserId) {
                unreadCount = messagesResp.data.filter(msg => {
                  const msgTime = new Date(msg.created_at || msg.createdAt).getTime();
                  return msg.sender_id !== currentUserId &&
                         msgTime > lastVisitTime &&
                         !msg.is_read;
                }).length;
              }
              
              return {
                id: group.id,
                lastMessage: lastMsg.message || '📎 Медиа',
                lastMessageTime: lastMsg.created_at || lastMsg.createdAt,
                lastMessageId: lastMsg.id,
                lastMessageSenderId: lastMsg.sender_id,
                // ⭐ ИСПРАВЛЕНО: Показываем реальный статус прочтения
                lastMessageReadStatus: lastMsg.is_read === true || lastMsg.is_read === 1,
                unreadCount: unreadCount,
              };
            }
          } catch (err) {
            // Игнорируем ошибки
          }
          return null;
        }));
        
        setGroups(prev => {
          const updated = [...prev];
          detailedGroups.forEach(detailed => {
            if (detailed) {
              const idx = updated.findIndex(g => g.id === detailed.id);
              if (idx > -1) {
                updated[idx] = { ...updated[idx], ...detailed };
              }
            }
          });
          return updated;
        });
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err) {
      // Ошибка фоновой загрузки
    }
  };

  const loadGroups = async (mapArg) => {
    try {
      setIsAppWorking(true);
      const response = await groupAPI.getGroups();
      const map = mapArg || pinnedMap || {};
      
      // ⭐ Сразу отрисовываем группы БЕЗ полной истории
      const mapped = response.data.map((group) => {
        const key = `group-${group.id}`;
        const pinnedAt = map[key] || null;
        
        return {
          ...group,
          type: 'group',
          lastMessage: group.last_message || group.lastMessage || '',
          lastMessageTime: group.last_message_time || group.lastMessageTime || new Date().toISOString(),
          lastMessageReadStatus: false,
          lastMessageId: null,
          lastMessageSenderId: null,
          unreadCount: group.unread_count || group.unreadCount || 0,
          pinned: !!pinnedAt,
          pinnedAt
        };
      });

      setGroups(mapped);
      setIsAppWorking(false);
      
      // Загружаем детали в фоне
      loadGroupsDetailsAsync(response.data);
      
    } catch (error) {
      console.error('Ошибка загрузки групп:', error);
      setIsAppWorking(false);
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
            item.type === 'group' && { backgroundColor: '#60A5FA' }
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
    <SafeAreaView style={[styles.container, { backgroundColor: getChatsListBackgroundColor() }]}>
      {/* Кастомный фон */}
      {chatsListBackground === 'custom' && chatsListBackgroundImage && (
        <Image 
          source={{ uri: chatsListBackgroundImage }}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      )}
      
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
          keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
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

      {/* Кнопка настройки фона (рядом с FAB) */}
      <TouchableOpacity 
        style={[styles.backgroundSettingsBtn, { backgroundColor: theme.surface }]}
        onPress={() => setBackgroundModalVisible(true)}
      >
        <Ionicons name="color-palette-outline" size={20} color={theme.primary} />
      </TouchableOpacity>

      {/* 🎨 МОДАЛЬНОЕ ОКНО ВЫБОРА ФОНА */}
      <Modal
        visible={backgroundModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBackgroundModalVisible(false)}
      >
        <View style={styles.bgModalOverlay}>
          <View style={[styles.bgModalContent, { backgroundColor: theme.surface }]}>
            {/* Заголовок */}
            <View style={[styles.bgModalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.bgModalTitle, { color: theme.text }]}>Выбрать фон</Text>
              <TouchableOpacity onPress={() => setBackgroundModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            
            {/* Индикатор загрузки */}
            {backgroundLoading && (
              <View style={[styles.bgLoadingOverlay, { backgroundColor: theme.surface + 'F0' }]}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.text, marginTop: 12 }}>Загрузка...</Text>
              </View>
            )}
            
            <ScrollView style={styles.bgModalScroll} showsVerticalScrollIndicator={false}>
              {/* Кнопка загрузки своего фото */}
              <TouchableOpacity 
                style={[styles.bgCustomButton, { borderColor: theme.primary }]}
                onPress={pickCustomChatsListBackground}
                disabled={backgroundLoading}
              >
                <View style={[styles.bgCustomIcon, { backgroundColor: theme.primary + '20' }]}>
                  <Ionicons name="camera" size={28} color={theme.primary} />
                </View>
                <View style={styles.bgCustomInfo}>
                  <Text style={[styles.bgCustomTitle, { color: theme.text }]}>Загрузить своё фото</Text>
                  <Text style={[styles.bgCustomSubtitle, { color: theme.textSecondary }]}>
                    Выберите изображение из галереи
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              
              {/* Предустановленные фоны */}
              <Text style={[styles.bgSectionTitle, { color: theme.textSecondary }]}>
                Предустановленные фоны
              </Text>
              
              <View style={styles.bgGrid}>
                {/* Default */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: theme.background, borderColor: chatsListBackground === 'default' ? theme.primary : theme.border }]}
                  onPress={() => selectChatsListBackground('default')}
                >
                  <Text style={[styles.bgOptionLabel, { color: theme.text }]}>По умолчанию</Text>
                  {chatsListBackground === 'default' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Light Blue */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: '#E3F2FD', borderColor: chatsListBackground === 'light-blue' ? theme.primary : '#E3F2FD' }]}
                  onPress={() => selectChatsListBackground('light-blue')}
                >
                  <Text style={styles.bgOptionLabel}>Голубой</Text>
                  {chatsListBackground === 'light-blue' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Light Green */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: '#E8F5E9', borderColor: chatsListBackground === 'light-green' ? theme.primary : '#E8F5E9' }]}
                  onPress={() => selectChatsListBackground('light-green')}
                >
                  <Text style={styles.bgOptionLabel}>Зелёный</Text>
                  {chatsListBackground === 'light-green' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Light Pink */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: '#FCE4EC', borderColor: chatsListBackground === 'light-pink' ? theme.primary : '#FCE4EC' }]}
                  onPress={() => selectChatsListBackground('light-pink')}
                >
                  <Text style={styles.bgOptionLabel}>Розовый</Text>
                  {chatsListBackground === 'light-pink' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Light Purple */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: '#F3E5F5', borderColor: chatsListBackground === 'light-purple' ? theme.primary : '#F3E5F5' }]}
                  onPress={() => selectChatsListBackground('light-purple')}
                >
                  <Text style={styles.bgOptionLabel}>Фиолетовый</Text>
                  {chatsListBackground === 'light-purple' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Light Orange */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: '#FFF3E0', borderColor: chatsListBackground === 'light-orange' ? theme.primary : '#FFF3E0' }]}
                  onPress={() => selectChatsListBackground('light-orange')}
                >
                  <Text style={styles.bgOptionLabel}>Оранжевый</Text>
                  {chatsListBackground === 'light-orange' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Dark Blue */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: '#1E3A8A', borderColor: chatsListBackground === 'dark-blue' ? theme.primary : '#1E3A8A' }]}
                  onPress={() => selectChatsListBackground('dark-blue')}
                >
                  <Text style={[styles.bgOptionLabel, { color: '#fff' }]}>Тёмно-синий</Text>
                  {chatsListBackground === 'dark-blue' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: '#fff' }]}>
                      <Ionicons name="checkmark" size={14} color={theme.primary} />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Dark Green */}
                <TouchableOpacity 
                  style={[styles.bgOption, { backgroundColor: '#1B4332', borderColor: chatsListBackground === 'dark-green' ? theme.primary : '#1B4332' }]}
                  onPress={() => selectChatsListBackground('dark-green')}
                >
                  <Text style={[styles.bgOptionLabel, { color: '#fff' }]}>Тёмно-зелёный</Text>
                  {chatsListBackground === 'dark-green' && (
                    <View style={[styles.bgCheckmark, { backgroundColor: '#fff' }]}>
                      <Ionicons name="checkmark" size={14} color={theme.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              
              {/* Кнопка сброса */}
              {chatsListBackground !== 'default' && (
                <TouchableOpacity 
                  style={[styles.bgResetButton, { borderColor: '#EF4444' }]}
                  onPress={resetChatsListBackground}
                  disabled={backgroundLoading}
                >
                  <Ionicons name="refresh" size={20} color="#EF4444" />
                  <Text style={styles.bgResetText}>Сбросить на стандартный</Text>
                </TouchableOpacity>
              )}
              
              {/* Превью текущего кастомного фона */}
              {chatsListBackground === 'custom' && chatsListBackgroundImage && (
                <View style={styles.bgCurrentPreview}>
                  <Text style={[styles.bgSectionTitle, { color: theme.textSecondary }]}>
                    Текущий кастомный фон
                  </Text>
                  <Image 
                    source={{ uri: chatsListBackgroundImage }}
                    style={styles.bgPreviewImage}
                    resizeMode="cover"
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#60A5FA',
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
    backgroundColor: '#60A5FA',
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
  
  // 🎨 ФОН СТРАНИЦЫ
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  backgroundSettingsBtn: {
    position: 'absolute',
    bottom: 100,
    right: 26,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  
  // Модальное окно выбора фона
  bgModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bgModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  bgModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  bgModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  bgModalScroll: {
    padding: 16,
  },
  bgLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bgCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  bgCustomIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgCustomInfo: {
    flex: 1,
    marginLeft: 14,
  },
  bgCustomTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  bgCustomSubtitle: {
    fontSize: 13,
  },
  bgSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  bgOption: {
    width: '46%',
    aspectRatio: 1.3,
    margin: '2%',
    borderRadius: 16,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bgOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  bgCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgResetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 20,
    gap: 8,
  },
  bgResetText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  bgCurrentPreview: {
    marginTop: 20,
  },
  bgPreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
  },
});

export default ChatsListScreen;