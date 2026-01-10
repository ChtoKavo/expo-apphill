import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import io from 'socket.io-client';
import { groupAPI, mediaAPI } from '../services/api';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { PinnedMessagesBar } from '../components/PinnedMessagesBar';
import { PinVisibilityModal } from '../components/PinVisibilityModal';
import VoiceRecordButton from '../components/VoiceRecordButton';
import VoiceMessagePlayer from '../components/VoiceMessagePlayer';
import audioRecorder from '../services/audioRecorder';
import TypingIndicator from '../components/TypingIndicator';
import MessageCheckmark from '../components/MessageCheckmark';

const GroupChatScreen = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { success } = useModalAlert();
  // Безопасно получаем параметр группы: либо полный объект group, либо groupId/group_id
  const routeParams = route?.params || {};
  const initialGroupParam = routeParams.group || null;
  const routeGroupId = routeParams.groupId || routeParams.group_id || null;

  const [groupState, setGroupState] = useState(initialGroupParam);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const socketConnectionRef = useRef(null);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [editingGroup, setEditingGroup] = useState({ name: '', description: '', avatar: '' });
  const [chatBackground, setChatBackground] = useState('default');
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [pinVisibilityModalVisible, setPinVisibilityModalVisible] = useState(false);
  const [pendingPinMessageId, setPendingPinMessageId] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimeoutRef = useRef({});
  const flatListRef = useRef(null);
  
  // 🔧 ИСПРАВЛЕНИЕ: Храним текущие значения в ref для избежания stale closure
  const groupStateRef = useRef(groupState);
  const currentUserRef = useRef(currentUser);
  const messagesRef = useRef(messages);
  
  // Обновляем ref при изменении значений
  useEffect(() => {
    groupStateRef.current = groupState;
  }, [groupState]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  // Состояние для отслеживания загрузки медиа
  const [mediaUploadProgress, setMediaUploadProgress] = useState(null); // { uri, progress: 0-100, speed: 'XXX KB/s', timeRemaining: 'XX s', type: 'image'|'video' }
  const [uploadingMediaUri, setUploadingMediaUri] = useState(null);

  // Загружаем фон чата
  useEffect(() => {
    loadChatBackground();
  }, []);

  const loadChatBackground = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch('http://151.247.196.66:3001/api/user/preferences', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setChatBackground(data.chat_background || 'default');
    } catch (err) {
      console.log('Ошибка загрузки фона:', err);
      setChatBackground('default');
    }
  };

  // Если пришёл только id группы — подгружаем её
  useEffect(() => {
    let mounted = true;
    const fetchGroup = async () => {
      if (!groupState && routeGroupId) {
        try {
          const resp = await groupAPI.getGroup(routeGroupId);
          if (mounted) setGroupState(resp.data);
        } catch (e) {
          console.error('Не удалось получить данные группы по id:', routeGroupId, e);
        }
      }
    };
    fetchGroup();
    return () => { mounted = false; };
  }, [routeGroupId]);

  // Когда groupState доступна — инициализируем editingGroup
  useEffect(() => {
    if (groupState) {
      setEditingGroup({ name: groupState.name || '', description: groupState.description || '', avatar: groupState.avatar || '' });
    }
  }, [groupState]);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (currentUser && groupState?.id) {
      loadMessages();
      loadGroupMembers();
      
      // 🔴 ИСПРАВЛЕНИЕ: НЕ отмечаем как прочитанные при открытии!
      // Сообщения будут отмечены когда пользователь их реально увидит
      // setTimeout(() => {
      //   markAllAsRead();
      // }, 500);
      
      console.log(`🎯 GroupChatScreen mounted: groupId=${groupState.id}, userId=${currentUser.id}`);
      
      // Сохраняем время открытия этой группы
      AsyncStorage.setItem(`group_visit_${groupState.id}`, new Date().toISOString()).catch(err => {
        console.log(`Ошибка сохранения времени визита для группы ${groupState.id}:`, err);
      });

      // 🆕 ИСПОЛЬЗОВАЕМ ГЛОБАЛЬНЫЙ SOCKET вместо создания нового!
      const initSocket = async () => {
        try {
          const { getOrCreateSocket } = require('../services/globalSocket');
          const socketConnection = await getOrCreateSocket();
          socketConnectionRef.current = socketConnection;

          console.log(`\n🟢 GroupChatScreen: initSocket начал, Socket ID: ${socketConnection.id}`);
          console.log(`   groupState.id: ${groupState?.id}`);
          console.log(`   currentUser.id: ${currentUser?.id}`);

          // 🔑 КРИТИЧНО: Первый шаг - аутентификация
          if (currentUser?.id) {
            socketConnection.emit('authenticate_socket', { user_id: currentUser.id });
            console.log(`🔐 Socket authenticated with user_id: ${currentUser.id}`);
          }

          // 🔑 КРИТИЧНО: Второй шаг - присоединяемся к комнате группы с задержкой
          setTimeout(() => {
            if (currentUser?.id && groupState?.id) {
              console.log(`\n${'='.repeat(60)}`);
              console.log(`🔴 GroupChatScreen: ПРИСОЕДИНЯЮСЬ К ГРУППОВОЙ КОМНАТЕ`);
              console.log(`   group_id: ${groupState.id}`);
              console.log(`   current_user_id: ${currentUser.id}`);
              console.log(`${'='.repeat(60)}`);
              
              console.log(`\n📤 Отправляю: socket.emit('join_group_room', ${groupState.id})`);
              socketConnection.emit('join_group_room', groupState.id);
              console.log(`✅ Эмит 'join_group_room' отправлен на сервер\n`);

              // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: РЕГИСТРИРУЕМ СЛУШАТЕЛИ СРАЗУ ПОСЛЕ JOIN!
              // ✅ ДИАГНОСТИКА (СЛУШАЕМ ВСЕ СОБЫТИЯ, НО НЕ ОБРАБАТЫВАЕМ)
              socketConnection.onAny((eventName, ...args) => {
                if (eventName === 'new_group_message') {
                  console.log(`\n${'='.repeat(70)}`);
                  console.log(`📡 [onAny] GroupChatScreen: new_group_message получено`);
                  console.log(`   Message ID: ${args[0]?.id}`);
                  console.log(`   Group ID: ${args[0]?.group_id}`);
                  console.log(`   Sender: ${args[0]?.sender_id}`);
                  console.log(`   Current group: ${groupState?.id}`);
                  console.log(`   Match: ${args[0]?.group_id === groupState?.id}`);
                  console.log(`${'='.repeat(70)}\n`);
                }
                if (eventName === 'message_read_status_updated') {
                  console.log(`\n📡 [onAny] GroupChatScreen: message_read_status_updated получено:`, args[0]);
                  console.log(`   Message ID: ${args[0]?.message_id}`);
                  console.log(`   Group ID: ${args[0]?.group_id}`);
                  console.log(`   Reader count: ${args[0]?.reader_count}\n`);
                }
              });

              // 🔔 СЛУШАЕМ: печатание в группе
              socketConnection.on('group_user_typing', (data) => {
                console.log(`\n${'='.repeat(70)}`);
                console.log(`🎯 GroupChatScreen: ПОЛУЧЕНО group_user_typing`);
                console.log(`   Socket ID: ${socketConnection.id}`);
                console.log(`   Event data:`, JSON.stringify(data));
                console.log(`   groupStateRef.current?.id: ${groupStateRef.current?.id}`);
                console.log(`   currentUserRef.current?.id: ${currentUserRef.current?.id}`);
                console.log(`${'='.repeat(70)}\n`);
                
                if (data.group_id === groupStateRef.current?.id && data.user_id !== currentUserRef.current?.id) {
                  console.log(`✅ MATCH! Обновляю typingUsers для пользователя ${data.user_id}`);
                  
                  if (data.is_typing) {
                    setTypingUsers(prev => {
                      const updated = {
                        ...prev,
                        [data.user_id]: data.username
                      };
                      console.log(`📝 typingUsers SET:`, updated);
                      return updated;
                    });
                    
                    if (typingTimeoutRef.current[data.user_id]) {
                      clearTimeout(typingTimeoutRef.current[data.user_id]);
                    }
                    
                    typingTimeoutRef.current[data.user_id] = setTimeout(() => {
                      console.log(`⏰ Timeout для ${data.user_id}`);
                      setTypingUsers(prev => {
                        const updated = { ...prev };
                        delete updated[data.user_id];
                        return updated;
                      });
                      delete typingTimeoutRef.current[data.user_id];
                    }, 1500);
                  } else {
                    console.log(`🛑 Пользователь ${data.user_id} перестал печатать`);
                    setTypingUsers(prev => {
                      const updated = { ...prev };
                      delete updated[data.user_id];
                      return updated;
                    });
                    
                    if (typingTimeoutRef.current[data.user_id]) {
                      clearTimeout(typingTimeoutRef.current[data.user_id]);
                      delete typingTimeoutRef.current[data.user_id];
                    }
                  }
                } else {
                  console.log(`❌ НЕ MATCH - игнорирую`);
                }
              });

              // 🔔 СЛУШАЕМ: новое сообщение в группе
              socketConnection.on('new_group_message', (message) => {
                console.log('\n🔔🔔🔔 СЛУШАТЕЛЬ СРАБОТАЛ! Получено событие new_group_message:');
                console.log('   Данные:', JSON.stringify(message).substring(0, 200));
                console.log(`   groupStateRef.current?.id=${groupStateRef.current?.id} (${typeof groupStateRef.current?.id})`);
                console.log(`   message.group_id=${message?.group_id} (${typeof message?.group_id})`);
                
                // ⚠️ КРИТИЧНО: Преобразуем в числа для сравнения и используем REF!
                const groupStateId = Number(groupStateRef.current?.id);
                const messageGroupId = Number(message?.group_id);
                const isForThisGroup = groupStateId === messageGroupId;
                console.log(`   🔍 Сравнение: ${groupStateId} === ${messageGroupId}? ${isForThisGroup}`);
                
                if (isForThisGroup) {
                  console.log('✅ MATCH! Это сообщение для нашей группы');
                  console.log('📨 NEW MESSAGE FULL:', JSON.stringify(message, null, 2));
                  console.log('📨 Message keys:', Object.keys(message));
                  console.log('📨 sender_avatar:', message.sender_avatar);
                  
                  let messageToAdd = { ...message };
                  
                  if (messageToAdd.is_read === undefined) {
                    messageToAdd.is_read = false;
                  }
                  
                  if (!message.sender_avatar) {
                    const similarMessages = messagesRef.current.filter(m => m.sender_id === message.sender_id && m.sender_avatar);
                    if (similarMessages.length > 0) {
                      messageToAdd = { ...messageToAdd, sender_avatar: similarMessages[0].sender_avatar };
                      console.log('🔍 Нашли аватарку в истории для пользователя', message.sender_id);
                    }
                  }
                  
                  setMessages(prev => {
                    const exists = prev.some(msg => msg.id === message.id);
                    if (exists) {
                      console.log('⚠️ Сообщение уже есть в списке, пропускаем');
                      return prev;
                    }
                    console.log(`✅ ДОБАВЛЯЮ! Сообщение в список. Было ${prev.length}, будет ${prev.length + 1}`);
                    return [...prev, messageToAdd];
                  });
                  
                  setTypingUsers(prev => {
                    const updated = { ...prev };
                    delete updated[message.sender_id];
                    return updated;
                  });
                  
                  setTimeout(() => scrollToBottom(), 100);
                } else {
                  console.log(`❌ Сообщение НЕ для нашей группы (${messageGroupId} !== ${groupStateId}), игнорирую`);
                }
              });
              
              // 🔔 СЛУШАЕМ: статус прочитания сообщения
              socketConnection.on('message_read_status_updated', (data) => {
                const { message_id, read_by, reader_id } = data;
                console.log(`✅ GroupChatScreen: Событие read status: message ${message_id}, read_by=[${read_by?.join(',')}], reader_id=${reader_id}`);
                
                setMessages(prev => {
                  const updated = prev.map(msg => {
                    if (msg.id === message_id) {
                      let updatedMsg = { ...msg };
                      
                      if (read_by) {
                        updatedMsg.read_by = read_by;
                        updatedMsg.is_read = read_by.length > 0;
                      } else if (reader_id) {
                        updatedMsg.read_by = updatedMsg.read_by || [];
                        if (!updatedMsg.read_by.includes(reader_id)) {
                          updatedMsg.read_by.push(reader_id);
                        }
                        updatedMsg.is_read = true;
                      }
                      
                      console.log(`   📝 Обновлено сообщение ${message_id}: read_by=${updatedMsg.read_by?.length || 0} читателей, is_read=${updatedMsg.is_read}`);
                      return updatedMsg;
                    }
                    return msg;
                  });
                  console.log(`   📊 Всего сообщений после обновления: ${updated.length}`);
                  return updated;
                });
              });
            } else {
              console.log(`⚠️ ПРОПУСКАЮ join_group_room: currentUser=${!!currentUser?.id}, groupState=${!!groupState?.id}`);
            }
          }, 100); // Задержка 100ms для гарантии обработки аутентификации
        } catch (err) {
          console.error('❌ Ошибка инициализации socket в GroupChatScreen:', err);
        }
      };

      initSocket();

      return () => {
        // ВАЖНО: НЕ отключаем глобальный socket, только удаляем слушатели
        const socketConnection = socketConnectionRef.current;
        if (socketConnection) {
          socketConnection.off('new_group_message');
          socketConnection.off('group_user_typing');
          socketConnection.off('message_read_status_updated');
          console.log('🧹 Очищены слушатели Socket в GroupChatScreen');
        }
      };
    }
  }, [currentUser?.id, groupState?.id]);

  const loadCurrentUser = async () => {
    const userData = await AsyncStorage.getItem('user');
    setCurrentUser(JSON.parse(userData));
  };

  // ✅ ИСПРАВЛЕНИЕ: Устанавливаем/очищаем активный чат при переходе на экран
  useEffect(() => {
    if (!groupState?.id) return;
    
    const { setActiveChatContext, clearActiveChatContext } = require('../services/notifications');
    
    const unsubscribe = navigation.addListener('focus', () => {
      // 📍 Устанавливаем эту группу как активный чат для подавления уведомлений
      setActiveChatContext(groupState.id, 'group');
      console.log(`✅ Активная группа установлена: ${groupState.id}`);
      
      // 🆕 ОТПРАВЛЯЕМ НА СЕРВЕР информацию об активном чате группы
      (async () => {
        try {
          const { getOrCreateSocket } = require('../services/globalSocket');
          const socketInstance = await getOrCreateSocket();
          if (socketInstance && socketInstance.connected) {
            socketInstance.emit('set_active_chat', {
              chat_id: groupState.id,
              chat_type: 'group',
              timestamp: new Date().toISOString()
            });
            console.log(`📤 Информация об активной группе отправлена на сервер (группа ${groupState.id})`);
          } else {
            console.warn('⚠️ Socket не подключен, не можем отправить информацию об активной группе');
          }
        } catch (err) {
          console.error('❌ Ошибка отправки активной группы на сервер:', err);
        }
      })();
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      // ❌ Очищаем активный чат при выходе
      clearActiveChatContext();
      console.log('❌ Активный чат очищен (вышли из группы)');
      
      // 🆕 ОТПРАВЛЯЕМ НА СЕРВЕР что вышли из чата
      (async () => {
        try {
          const { getOrCreateSocket } = require('../services/globalSocket');
          const socketInstance = await getOrCreateSocket();
          if (socketInstance && socketInstance.connected) {
            socketInstance.emit('clear_active_chat', {
              timestamp: new Date().toISOString()
            });
            console.log('📤 Очищен активный чат на сервере');
          }
        } catch (err) {
          console.error('❌ Ошибка очистки активного чата на сервере:', err);
        }
      })();
    });

    return () => {
      unsubscribe?.();
      unsubscribeBlur?.();
      clearActiveChatContext(); // Очищаем при размонтировании
    };
  }, [navigation, groupState?.id]);

  const getBackgroundColor = () => {
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
    return backgrounds[chatBackground] || theme.background;
  };

  const getAdaptiveColors = () => {
    const isDarkBackground = ['dark-blue', 'dark-green'].includes(chatBackground);
    const isLightBackground = ['light-blue', 'light-green', 'light-pink', 'light-purple', 'light-orange'].includes(chatBackground);
    
    if (isDarkBackground) {
      return {
        headerBg: '#000000',
        headerText: '#FFFFFF',
        inputBg: '#1A1A1A',
        inputText: '#FFFFFF',
        textColor: '#FFFFFF',
        border: '#333333',
        lightText: '#CCCCCC',
      };
    }
    
    if (isLightBackground) {
      return {
        headerBg: '#FFFFFF',
        headerText: '#1A1A1A',
        inputBg: '#F5F5F5',
        inputText: '#1A1A1A',
        textColor: '#1A1A1A',
        border: '#E0E0E0',
        lightText: '#666666',
      };
    }
    
    // Default
    return {
      headerBg: theme.background,
      headerText: theme.text,
      inputBg: theme.surface,
      inputText: theme.text,
      textColor: theme.text,
      border: theme.border,
      lightText: theme.textLight,
    };
  };

  const scrollToBottom = () => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  const loadMessages = async () => {
    try {
      if (!groupState?.id) return;
      const response = await groupAPI.getGroupMessages(groupState.id);
      if (response.data && response.data.length > 0) {
        console.log('📨 FULL FIRST MESSAGE:', JSON.stringify(response.data[0], null, 2));
        console.log('📨 Message keys:', Object.keys(response.data[0]));
        console.log('📨 sender_avatar value:', response.data[0].sender_avatar);
        
        // 🔧 ИСПРАВЛЕНИЕ: Восстанавливаем статус is_read из локального кеша
        let readMessageIds = [];
        try {
          const cacheKey = `read_messages_group_${groupState.id}`;
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            readMessageIds = JSON.parse(cached);
            console.log(`📦 Восстановлены ${readMessageIds.length} прочитанных сообщений из кеша`);
          }
        } catch (cacheErr) {
          console.log('⚠️ Ошибка при чтении кеша:', cacheErr);
        }
        
        // Убедимся, что все сообщения имеют is_read (по умолчанию false, кроме своих)
        const messagesWithReadStatus = response.data.map(msg => {
          let isRead = msg.is_read !== undefined ? msg.is_read : (msg.sender_id === currentUser?.id ? true : false);
          // Применяем сохраненный статус из кеша
          if (readMessageIds.includes(msg.id)) {
            console.log(`   ↩️ Восстановлено is_read=true для сообщения ${msg.id}`);
            isRead = true;
          }
          return { ...msg, is_read: isRead };
        });
        setMessages(messagesWithReadStatus);
      } else {
        setMessages(response.data || []);
      }
      setTimeout(() => scrollToBottom(), 300);
    } catch (error) {
      console.error('Ошибка загрузки сообщений группы:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить сообщения');
    }
  };

  const markMessageAsRead = async (messageId) => {
    try {
      // Отправляем событие через Socket.io на сервер
      if (socketConnectionRef.current) {
        socketConnectionRef.current.emit('mark_message_read', { message_id: messageId });
        console.log(`📤 Отправлено событие mark_message_read для message_id=${messageId}`);
      }
      
      // 🔧 ИСПРАВЛЕНИЕ: Правильно обновляем сообщение
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, is_read: true } : msg
      ));
      
      // 💾 Сохраняем в кеш
      try {
        const cacheKey = `read_messages_group_${groupState.id}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        let readMessageIds = cached ? JSON.parse(cached) : [];
        if (!readMessageIds.includes(messageId)) {
          readMessageIds.push(messageId);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(readMessageIds));
          console.log(`💾 Сохранено в кеш: ${readMessageIds.length} прочитанных сообщений`);
        }
      } catch (cacheErr) {
        console.log('⚠️ Ошибка при сохранении в кеш:', cacheErr);
      }
    } catch (err) {
      console.log('Ошибка отметки сообщения как прочитанного:', err);
    }
  };

  // 🆕 НОВАЯ ФУНКЦИЯ: Отмечать сообщение как прочитанное только когда оно видно на экране
  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (!socketConnectionRef.current || !currentUser?.id) return;

    const messagesToMark = [];

    viewableItems.forEach(viewable => {
      const message = viewable.item;
      
      // Пропускаем служебные сообщения (даты)
      if (message.type === 'date') return;
      
      // Пропускаем уже прочитанные сообщения
      if (message.is_read) return;
      
      // Отмечаем только входящие сообщения (не от текущего пользователя)
      if (message.sender_id === currentUser?.id) return;
      
      messagesToMark.push(message);
    });

    if (messagesToMark.length === 0) return;

    // Отмечаем все видимые сообщения
    messagesToMark.forEach(message => {
      console.log(`👁️ Сообщение видно на экране, отмечаем как прочитанное: ${message.id}`);
      
      // Отправляем события на сервер
      socketConnectionRef.current.emit('mark_message_read', { message_id: message.id });
      
      // Обновляем локально
      setMessages(prev => prev.map(msg => 
        msg.id === message.id ? { ...msg, is_read: true } : msg
      ));
    });

    // 💾 Сохраняем все отмеченные сообщения в кеш
    (async () => {
      try {
        const cacheKey = `read_messages_group_${groupState.id}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        let readMessageIds = cached ? JSON.parse(cached) : [];
        
        messagesToMark.forEach(msg => {
          if (!readMessageIds.includes(msg.id)) {
            readMessageIds.push(msg.id);
          }
        });
        
        await AsyncStorage.setItem(cacheKey, JSON.stringify(readMessageIds));
        console.log(`💾 Сохранено в кеш: ${readMessageIds.length} прочитанных сообщений`);
      } catch (cacheErr) {
        console.log('⚠️ Ошибка при сохранении в кеш:', cacheErr);
      }
    })();
  }, [currentUser?.id, groupState?.id]);

  const markAllAsRead = async () => {
    try {
      // 🔴 ИСПРАВЛЕНИЕ: Собираем НЕПРОЧИТАННЫЕ сообщения ПЕРЕД вызовом API
      const unreadMessageIds = messages
        .filter(msg => {
          // Пропускаем служебные сообщения (даты и т.п.)
          if (msg.type === 'date') return false;
          // Пропускаем сообщения которые уже прочитаны
          if (msg.is_read) return false;
          // Отмечаем только сообщения от других пользователей (не от себя)
          return msg.sender_id !== currentUser?.id;
        })
        .map(msg => msg.id);
      
      console.log(`📤 GroupChatScreen: Отправляю mark_message_read для ${unreadMessageIds.length} непрочитанных сообщений`);
      
      // Обновляем ТОЛЬКО непрочитанные сообщения локально
      setMessages(prev => prev.map(msg => {
        if (msg.type === 'date') return msg;
        // Отмечаем как прочитанные только если это было непрочитанное входящее сообщение
        if (!msg.is_read && msg.sender_id !== currentUser?.id) {
          console.log(`   ✅ Локально отмечено как прочитанное: ${msg.id}`);
          return { ...msg, is_read: true };
        }
        return msg;
      }));
      
      // Отправляем события на сервер для непрочитанных сообщений
      if (socketConnectionRef.current && unreadMessageIds.length > 0) {
        unreadMessageIds.forEach(msgId => {
          console.log(`   📨 Отправляю на сервер: mark_message_read для ${msgId}`);
          socketConnectionRef.current.emit('mark_message_read', { message_id: msgId });
        });
        
        // Также отправляем API запрос
        await groupAPI.markGroupAsRead(groupState.id);
      }
    } catch (err) {
      console.log('Ошибка при отметке как прочитанное:', err);
    }
  };

  const togglePinnedMessage = async (messageId, isVisibleToAll = true) => {
    try {
      if (!currentUser) return;
      
      const current = [...pinnedMessages];
      const idx = current.findIndex(id => id === messageId);
      
      if (idx > -1) {
        // Открепить
        current.splice(idx, 1);
        await fetch(`http://151.247.196.66:3001/api/pinned-messages/${messageId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${await AsyncStorage.getItem('token')}` }
        });
        success('Сообщение откреплено', '');
      } else {
        // Закрепить
        current.push(messageId);
        await fetch('http://151.247.196.66:3001/api/pinned-messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await AsyncStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message_id: messageId,
            chat_type: 'group',
            chat_id: groupState.id,
            is_visible_to_all: isVisibleToAll
          })
        });
        const message = isVisibleToAll 
          ? 'Сообщение закреплено для группы' 
          : 'Сообщение закреплено только для вас';
        success(message, '');
      }
      
      setPinnedMessages(current);
    } catch (err) {
      console.log('Ошибка при закреплении сообщения:', err);
    }
  };

  const sendMessage = async (mediaData = null, captionText = null) => {
    let messageText = newMessage.trim() || (mediaData ? '📎 Медиа' : '');
    if (mediaData?.type === 'voice') {
      // Для голосовых сообщений используем специальный текст
      messageText = '🎙️ Голосовое сообщение';
    }
    
    if (!messageText.trim() && !mediaData) return;
    
    setNewMessage('');
    
    try {
      console.log('📤 Отправляю сообщение:', { group_id: groupState.id, messageText });
      const response = await groupAPI.sendGroupMessage({
        group_id: groupState.id,
        message: messageText,
        reply_to: replyToMessage?.id || null,
        media_type: mediaData?.type || 'text',
        media_url: mediaData?.url || null,
        duration: mediaData?.duration || null,
        caption: captionText || null,
      });
      
      console.log('✅ Сообщение отправлено, ответ:', response.data);
      
      // ✅ ИСПРАВЛЕНИЕ: Добавляем сообщение локально СРАЗУ
      // Отправитель НИКОГДА не получает event 'new_group_message' от сервера
      // Поэтому просто добавляем локально и не ждем socket события
      setMessages(prev => {
        const exists = prev.some(msg => msg.id === response.data.id);
        if (exists) {
          console.log('⚠️ Сообщение уже в списке, не дублируем');
          return prev;
        }
        console.log(`✅ Добавляю отправленное сообщение локально. Всего: ${prev.length + 1}`);
        return [...prev, response.data];
      });
      
      setReplyToMessage(null);
      setTimeout(() => scrollToBottom(), 100);
    } catch (error) {
      console.error('❌ Ошибка отправки:', error);
      Alert.alert('Ошибка', 'Не удалось отправить сообщение');
      setNewMessage(messageText);
    }
  };

  const handleVoiceMessage = async (recordingData) => {
    if (!recordingData || !recordingData.uri) {
      Alert.alert('Ошибка', 'Не удалось получить аудиофайл');
      return;
    }

    try {
      console.log('Загружаем голосовое сообщение на сервер...');
      
      const uploadResponse = await mediaAPI.uploadMedia(recordingData.uri, 'audio');
      console.log('Голосовое сообщение загружено:', uploadResponse.data.url);
      
      await sendMessage({
        type: 'voice',
        url: uploadResponse.data.url,
        duration: recordingData.duration,
      });
    } catch (error) {
      console.error('Ошибка загрузки голосового сообщения:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить голосовое сообщение');
    }
  };

  const pickMedia = () => {
    Alert.alert(
      'Выберите медиа',
      'Что вы хотите отправить?',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Фото', onPress: () => pickImage() },
        { text: 'Видео', onPress: () => pickVideo() },
        { text: 'Голос', onPress: () => setShowVoiceRecorder(true) },
      ]
    );
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      sendMessage({ type: 'image', url: base64Image });
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.5,
      base64: false,
      videoMaxDuration: 30,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      try {
        console.log('Загружаем видео в группу на сервер...');
        setUploadingMediaUri(asset.uri);
        setMediaUploadProgress({ 
          uri: asset.uri, 
          progress: 0, 
          speed: '0 KB/s', 
          timeRemaining: 'Калькуляция...', 
          type: 'video' 
        });
        
        const uploadResponse = await mediaAPI.uploadMedia(asset.uri, 'video', (progressEvent) => {
          if (progressEvent.total > 0) {
            const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            const speed = ((progressEvent.loaded / (progressEvent.timeStamp / 1000)) / 1024).toFixed(1);
            const timeRemaining = progressEvent.total > progressEvent.loaded 
              ? Math.ceil((progressEvent.total - progressEvent.loaded) / (progressEvent.loaded / (progressEvent.timeStamp / 1000)))
              : 0;
            
            setMediaUploadProgress({
              uri: asset.uri,
              progress,
              speed: `${speed} KB/s`,
              timeRemaining: `${timeRemaining}s`,
              type: 'video'
            });
          }
        });
        
        console.log('Видео загружено:', uploadResponse.data.url);
        sendMessage({ type: 'video', url: uploadResponse.data.url });
        setUploadingMediaUri(null);
        setMediaUploadProgress(null);
      } catch (error) {
        console.error('Ошибка загрузки видео:', error);
        setUploadingMediaUri(null);
        setMediaUploadProgress(null);
        Alert.alert('Ошибка', 'Не удалось загрузить видео');
      }
    }
  };

  const loadGroupMembers = async () => {
    try {
      if (!groupState?.id) return;
      const response = await groupAPI.getGroupMembers(groupState.id);
      setGroupMembers(response.data);
    } catch (error) {
      console.error('Ошибка загрузки участников:', error);
    }
  };

  const pickGroupAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });

    if (!result.canceled) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setEditingGroup({...editingGroup, avatar: base64Image});
    }
  };

  const saveGroupChanges = async () => {
    try {
      if (!groupState?.id) return;
      await groupAPI.updateGroup(groupState.id, editingGroup);
      Alert.alert('Успех', 'Группа обновлена');
      setShowGroupModal(false);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить группу');
    }
  };

  const removeMember = async (userId) => {
    Alert.alert(
      'Удалить участника',
      'Вы уверены?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!groupState?.id) return;
              await groupAPI.removeGroupMember(groupState.id, userId);
              loadGroupMembers();
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить участника');
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Выход из группы',
      'Вы уверены что хотите покинуть эту группу?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!groupState?.id) return;
              await groupAPI.leaveGroup(groupState.id);
              
              // Закрываем модальное окно если оно открыто
              if (showGroupModal) {
                setShowGroupModal(false);
              }
              
              // Отправляем события на фронт о том что нужно обновить список групп
              socket?.emit('left_group', groupState.id);
              
              // Очищаем локальный кэш групп в AsyncStorage
              try {
                const cachedGroups = await AsyncStorage.getItem('userGroups');
                if (cachedGroups) {
                  const groups = JSON.parse(cachedGroups);
                  const filteredGroups = groups.filter(g => g.id !== groupState.id);
                  await AsyncStorage.setItem('userGroups', JSON.stringify(filteredGroups));
                }
              } catch (e) {
                console.log('Ошибка очистки кэша:', e);
              }
              
              Alert.alert('Успех', 'Вы покинули группу');
              
              // Возвращаемся в список групп с флагом обновления
              setTimeout(() => {
                navigation.goBack();
                // Отправляем сигнал что нужно обновить список
                navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                });
              }, 500);
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось покинуть группу: ' + (error.response?.data?.error || error.message));
            }
          },
        },
      ]
    );
  };

  const handleGroupMenu = () => {
    Alert.alert(
      'Меню группы',
      '',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти из группы',
          style: 'destructive',
          onPress: handleLeaveGroup,
        },
      ]
    );
  };

  const openUserProfile = (member) => {
    setShowGroupModal(false);
    navigation.navigate('Chat', { user: member });
  };

  const renderMember = ({ item }) => (
    <View style={styles.memberItem}>
      <TouchableOpacity 
        style={styles.memberInfo}
        onPress={() => openUserProfile(item)}
        activeOpacity={0.7}
      >
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.memberAvatar} />
        ) : (
          <View style={styles.memberAvatarPlaceholder}>
            <Text style={styles.memberAvatarText}>{item.username[0].toUpperCase()}</Text>
          </View>
        )}
        <View>
          <Text style={[styles.memberName, { color: theme.text }]}>{item.username}</Text>
          <Text style={[styles.memberRole, { color: theme.textSecondary }]}>{item.role === 'admin' ? 'Админ' : 'Участник'}</Text>
        </View>
      </TouchableOpacity>
      {item.role !== 'admin' && (
        <TouchableOpacity
          style={styles.removeMemberButton}
          onPress={() => removeMember(item.id)}
        >
          <Ionicons name="close" size={20} color="#FF3B30" />
        </TouchableOpacity>
      )}
    </View>
  );

  const deleteMessage = async (messageId) => {
    Alert.alert(
      'Удалить сообщение',
      'Вы уверены что хотите удалить это сообщение?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupAPI.deleteGroupMessage(messageId);
              setMessages(prev => prev.filter(msg => msg.id !== messageId));
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить сообщение');
            }
          }
        }
      ]
    );
  };

  // Функция для получения аватарки отправителя
  const getSenderAvatar = (message) => {
    // Если у сообщения есть аватарка отправителя, используем её
    if (message.sender_avatar) {
      console.log(`🎭 getSenderAvatar: есть аватарка для ${message.sender_username}, тип=${typeof message.sender_avatar}, длина=${String(message.sender_avatar).length}`);
      return { type: 'image', uri: message.sender_avatar };
    }
    
    // Иначе создаём аватарку с инициалами
    if (message.sender_username) {
      const initials = message.sender_username.substring(0, 2).toUpperCase();
      console.log(`🎭 getSenderAvatar: используем инициалы ${initials} для ${message.sender_username}`);
      return { type: 'initials', initials };
    }
    
    console.log(`🎭 getSenderAvatar: fallback к U`);
    return { type: 'initials', initials: 'U' };
  };

  // Функция для проверки, нужно ли показывать аватарку и имя для текущего сообщения
  // ПРИНУДИТЕЛЬНО ПОКАЗЫВАЕМ ВСЕ АВАТАРКИ И ИМЕНА
  const shouldShowAvatarAndName = (currentMessage, previousMessage, nextMessage) => {
    const isCurrentUser = currentMessage.sender_id === currentUser?.id;
    
    // Для своих сообщений не показываем аватарку и имя
    if (isCurrentUser) {
      return false;
    }
    
    // ПРИНУДИТЕЛЬНО ПОКАЗЫВАЕМ ВСЕ АВАТАРКИ И ИМЕНА ДЛЯ ЧУЖИХ СООБЩЕНИЙ
    return true;
  };

  const SwipeableMessage = ({ item, onReply, previousMessage, nextMessage }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const isSent = item.sender_id === currentUser?.id;
    const [contextMenu, setContextMenu] = useState(false);
    
    // ПРИНУДИТЕЛЬНО ПОКАЗЫВАЕМ ВСЕ АВАТАРКИ И ИМЕНА
    const showAvatarAndName = !isSent; // Всегда показывать для чужих сообщений
    const senderAvatar = getSenderAvatar(item);
    
    console.log(`📍 SwipeableMessage: msg_id=${item.id}, isSent=${isSent}, showAvatarAndName=${showAvatarAndName}, sender=${item.sender_username}`);
    
    const onGestureEvent = Animated.event(
      [{ nativeEvent: { translationX: translateX } }],
      { useNativeDriver: true }
    );
    
    const onHandlerStateChange = (event) => {
      if (event.nativeEvent.state === 5) { // END
        if (event.nativeEvent.translationX > 50) {
          onReply(item);
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    };

    const handleLongPress = () => {
      setContextMenu(true);
    };
    
    return (
      <>
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          activeOffsetX={[-10, 10]}
          failOffsetY={[-5, 5]}
        >
          <Animated.View
            style={[
              styles.messageRow,
              isSent ? styles.sentRow : styles.receivedRow,
              { transform: [{ translateX }] }
            ]}
          >
            {/* Аватарка отправителя (только для чужих сообщений) */}
            {!isSent && (
              <View style={styles.senderAvatarContainer}>
                {senderAvatar.type === 'image' && senderAvatar.uri ? (
                  <Image 
                    source={{ uri: senderAvatar.uri }} 
                    style={styles.senderAvatarImage}
                    onLoad={() => console.log('✅ Аватарка загружена для сообщения', item.id)}
                    onError={(error) => console.log('❌ Ошибка загрузки аватарки для сообщения', item.id, error)}
                  />
                ) : (
                  <View style={styles.senderAvatarPlaceholder}>
                    <Text style={styles.senderAvatarText}>{senderAvatar.initials || 'U'}</Text>
                  </View>
                )}
              </View>
            )}
            
            <TouchableOpacity
              onLongPress={handleLongPress}
              delayLongPress={500}
              activeOpacity={1}
            >
              <View style={[
                styles.messageContainer,
                isSent ? { ...styles.sentMessage, backgroundColor: theme.sentMessage } : { ...styles.receivedMessage, backgroundColor: theme.surface },
              ]}>
                {item.reply_to && (
                  <View style={[styles.replyContainer, { backgroundColor: isSent ? 'rgba(255,255,255,0.1)' : theme.background }]}>
                    <View style={styles.replyHeader}>
                      <Ionicons name="return-up-forward" size={12} color={isSent ? 'rgba(255,255,255,0.8)' : '#667eea'} />
                      <Text style={[styles.replyAuthor, isSent ? styles.replyAuthorSent : { ...styles.replyAuthorReceived, color: '#667eea' }]}>
                        {item.reply_to_sender_id === currentUser?.id ? 'Вы' : (item.reply_to_sender || 'Пользователь')}
                      </Text>
                    </View>
                    <Text style={[styles.replyText, isSent ? styles.replyTextSent : { ...styles.replyTextReceived, color: theme.textSecondary }]}>
                      {item.reply_to_message}
                    </Text>
                  </View>
                )}
                
                {/* Имя отправителя показываем ВСЕГДА для чужих сообщений */}
                {!isSent && (
                  <Text style={[styles.senderName, { color: theme.primary }]}>
                    {item.sender_username || 'Неизвестный пользователь'}
                  </Text>
                )}
                
                {item.media_type === 'image' && item.media_url ? (
                  <View>
                    <Image 
                      source={{ uri: item.media_url }} 
                      style={styles.messageImage}
                      resizeMode="cover"
                    />
                    {item.caption && (
                      <Text style={[
                        styles.captionText,
                        isSent ? { ...styles.sentText, color: '#ffffff' } : { ...styles.receivedText, color: theme.text }
                      ]}>
                        {item.caption}
                      </Text>
                    )}
                  </View>
                ) : item.media_type === 'video' && item.media_url ? (
                  <View>
                    <Video
                      source={{ uri: item.media_url }}
                      style={styles.messageVideo}
                      useNativeControls={true}
                      resizeMode="contain"
                      shouldPlay={false}
                      onError={(error) => console.log('Ошибка видео:', error)}
                      onLoad={() => console.log('Видео загружено')}
                    />
                    {item.caption && (
                      <Text style={[
                        styles.captionText,
                        isSent ? { ...styles.sentText, color: '#ffffff' } : { ...styles.receivedText, color: theme.text }
                      ]}>
                        {item.caption}
                      </Text>
                    )}
                  </View>
                ) : item.media_type === 'voice' && item.media_url ? (
                  <VoiceMessagePlayer
                    uri={item.media_url}
                    duration={item.duration || 0}
                    theme={theme}
                    isCurrentUser={isSent}
                    style={{ marginVertical: 4 }}
                  />
                ) : null}
                {item.message !== '📎 Медиа' && item.media_type !== 'voice' && (
                  <Text style={[
                    styles.messageText,
                    isSent ? { ...styles.sentText, color: '#ffffff' } : { ...styles.receivedText, color: theme.text }
                  ]}>
                    {item.message}
                  </Text>
                )}
                <View style={styles.messageTimeContainer}>
                  <Text style={[
                    styles.messageTime,
                    isSent ? styles.sentTime : styles.receivedTime
                  ]}>
                    {new Date(item.created_at).toLocaleTimeString('ru-RU', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </Text>
                  {isSent && (
                    <View style={styles.checkmarkContainer}>
                      {/* 📌 ДЛЯ ГРУППОВОГО ЧАТА: проверяем количество читателей в массиве read_by */}
                      {(item.read_by && Array.isArray(item.read_by) && item.read_by.length > 0) || item.is_read ? (
                        <>
                          <MessageCheckmark 
                            isRead={true}
                            isDouble={true}
                          />
                          {/* Показываем количество читателей если есть */}
                          {item.read_by && Array.isArray(item.read_by) && item.read_by.length > 0 && (
                            <Text style={[styles.messageCheckmark, styles.sentCheckmark, { fontSize: 9, marginLeft: 2 }]}>
                              {item.read_by.length}
                            </Text>
                          )}
                        </>
                      ) : (
                        <MessageCheckmark 
                          isRead={false}
                          isDouble={false}
                        />
                      )}
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </PanGestureHandler>

        {/* Контекстное меню при долгом нажатии */}
        <Modal
          visible={contextMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setContextMenu(false)}
        >
          <TouchableOpacity 
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setContextMenu(false)}
          >
            <View style={styles.contextMenuBackdrop}>
              <View style={[styles.contextMenu, { backgroundColor: theme.surface }]}>
                <TouchableOpacity 
                  style={styles.contextMenuItem}
                  onPress={() => {
                    setReplyToMessage(item);
                    setContextMenu(false);
                  }}
                >
                  <Ionicons name="return-up-forward" size={18} color={theme.primary} />
                  <Text style={[styles.contextMenuItemText, { color: theme.text }]}>Ответить</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.contextMenuItem}
                  onPress={() => {
                    const isPinned = pinnedMessages.includes(item.id);
                    if (isPinned) {
                      // Если уже закреплено, откреплять без вопроса
                      togglePinnedMessage(item.id);
                    } else {
                      // Если не закреплено, показать модальное окно выбора
                      setPendingPinMessageId(item.id);
                      setPinVisibilityModalVisible(true);
                    }
                    setContextMenu(false);
                  }}
                >
                  <Ionicons 
                    name={pinnedMessages.includes(item.id) ? 'pin-off' : 'pin'} 
                    size={18} 
                    color={theme.primary} 
                  />
                  <Text style={[styles.contextMenuItemText, { color: theme.text }]}>
                    {pinnedMessages.includes(item.id) ? 'Открепить' : 'Закрепить'}
                  </Text>
                </TouchableOpacity>

                {isSent && (
                  <TouchableOpacity 
                    style={[styles.contextMenuItem, styles.contextMenuItemDanger]}
                    onPress={() => {
                      deleteMessage(item.id);
                      setContextMenu(false);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={[styles.contextMenuItemText, { color: '#EF4444' }]}>Удалить</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </>
    );
  };
  
  const renderMessage = ({ item, index }) => {
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
    
    const isCurrentUser = item.sender_id === currentUser?.id;
    
    console.log(`🎬 renderMessage index=${index}, msg_id=${item.id}, sender=${item.sender_username}, isCurrentUser=${isCurrentUser}`);
    
    return (
      <SwipeableMessage 
        item={item} 
        onReply={setReplyToMessage}
        previousMessage={previousMessage}
        nextMessage={nextMessage}
      />
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { backgroundColor: getAdaptiveColors().headerBg }]}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={getAdaptiveColors().headerText} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.groupInfo} onPress={() => setShowGroupModal(true)}>
              {groupState?.avatar ? (
                <Image source={{ uri: groupState.avatar }} style={styles.groupAvatarImage} />
              ) : (
                <View style={styles.groupAvatar}>
                  <Ionicons name="people" size={20} color={getAdaptiveColors().headerText} />
                </View>
              )}
              <View>
                <Text style={[styles.headerTitle, { color: getAdaptiveColors().headerText }]}>{groupState?.name}</Text>
                {Object.keys(typingUsers).length > 0 ? (
                  <Text style={[styles.memberCount, { color: getAdaptiveColors().lightText }]}>
                    {Object.values(typingUsers).length === 1 
                      ? `${Object.values(typingUsers)[0]} печатает...`
                      : Object.values(typingUsers).length === 2
                      ? `${Object.values(typingUsers)[0]} и ${Object.values(typingUsers)[1]} печатают...`
                      : `${Object.values(typingUsers).length} пользователей печатают...`
                    }
                  </Text>
                ) : (
                  <Text style={[styles.memberCount, { color: getAdaptiveColors().lightText }]}>
                    {groupState?.description || `${groupState?.member_count || 0} участников`}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGroupMenu}>
              <Ionicons name="ellipsis-vertical" size={20} color={getAdaptiveColors().headerText} />
            </TouchableOpacity>
          </View>
        </View>
        
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'height' : 'height'}
          keyboardVerticalOffset={0}
          style={[styles.chatContainer, { backgroundColor: getBackgroundColor() }]}
        >
          {/* Панель закреплённых сообщений */}
          <PinnedMessagesBar 
            pinnedMessages={messages.filter(m => pinnedMessages.includes(m.id))}
            onPinnedMessagePress={(message) => {
              const index = messages.findIndex(m => m.id === message.id);
              if (index > -1 && flatListRef.current) {
                flatListRef.current.scrollToIndex({ index, animated: true });
              }
            }}
            onUnpin={(messageId) => {
              togglePinnedMessage(messageId);
            }}
          />

          {/* Индикатор загрузки медиа */}
          {mediaUploadProgress && (
            <View style={[styles.mediaUploadContainer, { backgroundColor: theme.primary + '10', borderBottomColor: theme.primary + '30' }]}>
              <View style={styles.mediaUploadContent}>
                <View style={[styles.mediaUploadIcon, { backgroundColor: theme.primary + '20' }]}>
                  {mediaUploadProgress.type === 'video' ? (
                    <Ionicons name="videocam" size={20} color={theme.primary} />
                  ) : (
                    <Ionicons name="image" size={20} color={theme.primary} />
                  )}
                </View>
                <View style={styles.mediaUploadInfo}>
                  <Text style={[styles.mediaUploadTitle, { color: theme.text }]}>
                    {mediaUploadProgress.type === 'video' ? '🎥 Загрузка видео' : '📸 Загрузка фото'}
                  </Text>
                  <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBar, { backgroundColor: theme.primary + '30' }]}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { backgroundColor: theme.primary, width: `${mediaUploadProgress.progress}%` }
                        ]} 
                      />
                    </View>
                    <Text style={[styles.progressPercent, { color: theme.primary }]}>
                      {mediaUploadProgress.progress}%
                    </Text>
                  </View>
                  <View style={styles.mediaUploadStats}>
                    <Text style={[styles.mediaUploadStat, { color: theme.textSecondary }]}>
                      {mediaUploadProgress.speed}
                    </Text>
                    <Text style={[styles.mediaUploadStat, { color: theme.textSecondary }]}>
                      осталось {mediaUploadProgress.timeRemaining}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {messages && messages.length > 0 ? (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => `group-msg-${item.id}`}
              style={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollToBottom()}
              onLayout={() => scrollToBottom()}
              onViewableItemsChanged={handleViewableItemsChanged}
              viewabilityConfig={{
                itemVisiblePercentThreshold: 50, // Считаем видимым если 50% элемента на экране
                waitForInteraction: false
              }}
              scrollEnabled={true}
              removeClippedSubviews={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            />
          ) : (
            <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
              <Text style={{color: theme.text, fontSize: 16}}>Нет сообщений</Text>
            </View>
          )}
          
          <View style={[styles.inputContainer, { backgroundColor: getAdaptiveColors().inputBg, borderTopColor: getAdaptiveColors().border }]}>
            {/* Статус печатания */}
            {Object.keys(typingUsers).length > 0 && (
              <View style={[styles.typingIndicatorContainer, { backgroundColor: theme.surface }]}>
                <TypingIndicator theme={theme} users={typingUsers} />
              </View>
            )}
            
            {replyToMessage && (
              <View style={[styles.replyPreview, { backgroundColor: theme.surface }]}>
                <Text style={[styles.replyLabel, { color: '#667eea' }]}>Ответ на:</Text>
                <Text style={[styles.replyPreviewText, { color: theme.text }]}>{replyToMessage.message}</Text>
                <TouchableOpacity onPress={() => setReplyToMessage(null)}>
                  <Ionicons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <View style={[styles.inputWrapper, { backgroundColor: getAdaptiveColors().inputBg }]}>
              <TextInput
                style={[styles.textInput, { color: getAdaptiveColors().textColor }]}
                value={newMessage}
                onChangeText={(text) => {
                  setNewMessage(text);
                  
                  // Отправляем событие печатания в группу
                  if (socketConnectionRef.current && groupState?.id) {
                    const isTyping = text.length > 0;
                    console.log(`📤 Отправляю group_user_typing:`, {
                      group_id: groupState.id,
                      user_id: currentUser?.id,
                      username: currentUser?.username,
                      is_typing: isTyping,
                      text_length: text.length
                    });
                    
                    socketConnectionRef.current.emit('group_user_typing', { 
                      group_id: groupState.id,
                      user_id: currentUser?.id,
                      username: currentUser?.username,
                      is_typing: isTyping
                    });
                  } else {
                    console.log(`⚠️ Не могу отправить typing: socket=${!!socketConnectionRef.current}, groupState.id=${groupState?.id}`);
                  }
                  
                  // Таймер для отправки события "перестал печатать"
                  if (typingTimeoutRef.current.sendTimeout) {
                    clearTimeout(typingTimeoutRef.current.sendTimeout);
                  }
                  
                  if (text.length > 0) {
                    typingTimeoutRef.current.sendTimeout = setTimeout(() => {
                      console.log(`⏰ Таймер истек (3сек), отправляю is_typing=false`);
                      if (socketConnectionRef.current && groupState?.id) {
                        socketConnectionRef.current.emit('group_user_typing', { 
                          group_id: groupState.id,
                          user_id: currentUser?.id,
                          is_typing: false
                        });
                      }
                    }, 3000);
                  }
                }}
                placeholder="Сообщение..."
                placeholderTextColor={getAdaptiveColors().lightText}
                multiline
              />
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity style={styles.mediaButton} onPress={pickMedia}>
                  <Ionicons name="attach" size={18} color="#667eea" />
                </TouchableOpacity>
                <VoiceRecordButton
                  theme={theme}
                  onSend={handleVoiceMessage}
                />
                <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()}>
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={showGroupModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowGroupModal(false)}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={() => setShowGroupModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Управление группой</Text>
              <TouchableOpacity onPress={saveGroupChanges}>
                <Text style={[styles.saveButton, { color: theme.primary }]}>Сохранить</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalContent}>
              <View style={styles.groupEditSection}>
                <TouchableOpacity style={styles.avatarEditSection} onPress={pickGroupAvatar}>
                  {editingGroup.avatar ? (
                    <Image source={{ uri: editingGroup.avatar }} style={styles.groupAvatarLarge} />
                  ) : (
                    <View style={[styles.groupAvatarPlaceholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Ionicons name="camera" size={30} color={theme.textSecondary} />
                      <Text style={[styles.avatarHint, { color: theme.textSecondary }]}>Изменить фото</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                <TextInput
                  style={[styles.groupNameEdit, { backgroundColor: theme.surface, color: theme.text }]}
                  value={editingGroup.name}
                  onChangeText={(text) => setEditingGroup({...editingGroup, name: text})}
                  placeholder="Название группы"
                  placeholderTextColor={theme.textSecondary}
                />
                
                <TextInput
                  style={[styles.groupDescriptionEdit, { backgroundColor: theme.surface, color: theme.text }]}
                  value={editingGroup.description}
                  onChangeText={(text) => setEditingGroup({...editingGroup, description: text})}
                  placeholder="Описание группы"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                />
              </View>
              
              <Text style={[styles.membersTitle, { color: theme.text }]}>Участники ({groupMembers.length})</Text>
              
              <FlatList
                data={groupMembers}
                renderItem={renderMember}
                keyExtractor={(item) => `member-${item.id}`}
                scrollEnabled={false}
              />
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>

      <PinVisibilityModal
        visible={pinVisibilityModalVisible}
        onClose={() => {
          setPinVisibilityModalVisible(false);
          setPendingPinMessageId(null);
        }}
        onSelect={(isVisibleToAll) => {
          if (pendingPinMessageId) {
            togglePinnedMessage(pendingPinMessageId, isVisibleToAll);
            setPendingPinMessageId(null);
          }
        }}
        theme={theme}
      />
    </GestureHandlerRootView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingTop: 10,
    paddingBottom: 15,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  groupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 15,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  memberCount: {
    fontSize: 12,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 15,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 3,
    alignItems: 'flex-end',
  },
  sentRow: {
    justifyContent: 'flex-end',
  },
  receivedRow: {
    justifyContent: 'flex-start',
  },
  // Стили для аватарки отправителя
  senderAvatarContainer: {
    width: 36,
    height: 36,
    marginRight: 8,
    marginBottom: 2,
    justifyContent: 'flex-end',
  },
  senderAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  senderAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  senderAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  senderAvatarSpacer: {
    width: 36,
    height: 36,
    marginRight: 8,
    marginBottom: 2,
  },
  messageContainer: {
    maxWidth: width * 0.75,
    padding: 12,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sentMessage: {
    backgroundColor: '#667eea',
    borderBottomRightRadius: 4,
  },
  receivedMessage: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#667eea',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  sentText: {
    color: '#fff',
  },
  receivedText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  sentTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  receivedTime: {
    color: '#999',
  },
  messageTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-end',
    gap: 4,
  },
  messageCheckmark: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: '#FFFFFF', // Белый цвет
  },
  sentCheckmark: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  checkmarkContainer: {
    marginLeft: 3,
  },
  checkmarkDouble: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  inputContainer: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderTopColor: 'transparent',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f1f3f4',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 10,
    gap: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    maxHeight: 100,
    minHeight: 40,
    paddingVertical: 8,
    lineHeight: 20,
  },
  sendButton: {
    backgroundColor: '#667eea',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingIndicatorContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  replyContainer: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#667eea',
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  replyAuthor: {
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  replyAuthorSent: {
    color: 'rgba(255,255,255,0.9)',
  },
  replyAuthorReceived: {
  },
  replyText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  replyTextSent: {
    color: 'rgba(255,255,255,0.8)',
  },
  replyTextReceived: {
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginHorizontal: 15,
    borderRadius: 8,
    marginBottom: 5,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 8,
  },
  replyPreviewText: {
    flex: 1,
    fontSize: 14,
  },
  messageImage: {
    width: 180,
    height: 120,
    borderRadius: 10,
    marginBottom: 8,
  },
  captionText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 4,
    fontWeight: '400',
  },
  messageVideo: {
    width: 180,
    height: 120,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#000',
  },
  videoContainer: {
    width: 200,
    height: 150,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  videoText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 8,
  },
  mediaButton: {
    padding: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  groupEditSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarEditSection: {
    marginBottom: 20,
  },
  groupAvatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  groupAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f1f3f4',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e1e5e9',
    borderStyle: 'dashed',
  },
  avatarHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
  groupNameEdit: {
    backgroundColor: '#f1f3f4',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    width: '100%',
    marginBottom: 15,
  },
  groupDescriptionEdit: {
    backgroundColor: '#f1f3f4',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    width: '100%',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  membersTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
  },
  memberRole: {
    fontSize: 14,
  },
  removeMemberButton: {
    padding: 8,
  },
  contextMenuBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  contextMenu: {
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  contextMenuItemDanger: {
    borderBottomWidth: 0,
  },
  contextMenuItemText: {
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
  },
  mediaUploadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    marginBottom: 8,
    borderRadius: 12,
    marginHorizontal: 10,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  mediaUploadContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  mediaUploadIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
  },
  mediaUploadInfo: {
    flex: 1,
    marginRight: 8,
  },
  mediaUploadTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#1a202c',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(102, 126, 234, 0.15)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#667eea',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 35,
    textAlign: 'right',
    color: '#667eea',
  },
  mediaUploadStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mediaUploadStat: {
    fontSize: 11,
    color: '#718096',
    fontWeight: '500',
  },
});

export default GroupChatScreen;