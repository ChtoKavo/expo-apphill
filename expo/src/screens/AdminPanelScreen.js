import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  ScrollView,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform,
  SafeAreaView,
  TextInput,
  Modal,
  Animated,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const AdminPanelScreen = () => {
  const navigation = useNavigation();
  const [token, setToken] = useState(null);
  const [groups, setGroups] = useState([]);
  const [chats, setChats] = useState([]);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('groups'); // 'groups', 'chats', 'users', 'posts', 'reports', 'server'
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [selectedUserForBan, setSelectedUserForBan] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportFilterStatus, setReportFilterStatus] = useState('pending');
  
  // Состояния для поддержки
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportStats, setSupportStats] = useState(null);
  const [supportStatusFilter, setSupportStatusFilter] = useState('open');
  const [selectedSupportTicket, setSelectedSupportTicket] = useState(null);
  const [supportReplyText, setSupportReplyText] = useState('');
  const [supportReplies, setSupportReplies] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportDetailViewMode, setSupportDetailViewMode] = useState(false); // false = list, true = detail
  
  // Анимация для бокового меню
  const slideAnim = useRef(new Animated.Value(-240)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  
  // Состояния для красивых модальных окон
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: '',
    message: '',
    icon: '⚠️',
    onConfirm: null,
    onCancel: null,
    confirmText: 'Подтвердить',
    cancelText: 'Отмена',
    confirmColor: '#ef4444',
    isDestructive: false,
  });
  
  const [successModal, setSuccessModal] = useState({
    visible: false,
    title: '✅ Успешно',
    message: '',
  });
  
  const [errorModal, setErrorModal] = useState({
    visible: false,
    title: '❌ Ошибка',
    message: '',
  });
  
  // Состояние сервера
  const [serverStatus, setServerStatus] = useState('checking');
  const [serverLogs, setServerLogs] = useState([]);
  const [serverStats, setServerStats] = useState({
    uptime: 0,
    activeUsers: 0,
    activeGroups: 0,
    totalMessages: 0,
    memory: 'N/A',
  });
  const [logAutoRefresh, setLogAutoRefresh] = useState(true);

  // Создание axios instance с токеном
  const createApiClient = async (authToken) => {
    return axios.create({
      baseURL: 'http://151.247.196.66:3001/api',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });
  };

  // Проверка статуса сервера
  const checkServerStatus = async (authToken) => {
    try {
      const client = await createApiClient(authToken);
      const response = await client.get('/server/status');
      console.log('📊 Server status updated:', response.data);
      setServerStatus('online');
      setServerStats(response.data || {});
    } catch (error) {
      console.error('Ошибка проверки статуса:', error);
      setServerStatus('offline');
    }
  };

  // Получение логов сервера
  const fetchServerLogs = async (authToken) => {
    try {
      const client = await createApiClient(authToken);
      const response = await client.get('/admin/server/logs');
      console.log('📋 Логи обновлены:', response.data?.logs?.length || 0, 'логов');
      setServerLogs(response.data?.logs || []);
    } catch (error) {
      console.error('Ошибка получения логов:', error);
    }
  };

  // Перезагрузка сервера
  const restartServer = async (authToken) => {
    setConfirmModal({
      visible: true,
      title: '⚠️ Перезагрузка сервера',
      message: 'Это приведет к временному отключению сервиса. Продолжить?',
      icon: '⚠️',
      confirmText: 'Перезагрузить',
      cancelText: 'Отмена',
      confirmColor: '#ef4444',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(authToken);
          await client.post('/admin/server/restart');
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Сервер перезагружается...',
          });
          
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            setTimeout(() => {
              checkServerStatus(authToken);
            }, 3000);
          }, 2000);
        } catch (error) {
          console.error('Ошибка перезагрузки:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Не удалось перезагрузить сервер',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  const clearDatabase = async (authToken) => {
    setConfirmModal({
      visible: true,
      title: '⚠️ Очистка базы данных',
      message: 'Это удалит ВСЕ данные из базы (пользователи, сообщения, группы и т.д.)! Таблицы останутся пустыми. Это действие необратимо!',
      icon: '🗑️',
      confirmText: 'Очистить базу',
      cancelText: 'Отмена',
      confirmColor: '#dc2626',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(authToken);
          await client.post('/admin/database/clear', { confirmation: 'CLEAR_ALL_DATA' });
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'База данных очищена. Все таблицы теперь пусты.',
          });
          
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            setTimeout(() => {
              checkServerStatus(authToken);
              // Перезагружаем все данные
              fetchGroups(authToken);
              fetchChats(authToken);
              fetchUsers(authToken);
              fetchPosts(authToken);
              fetchReports(authToken);
            }, 1000);
          }, 2000);
        } catch (error) {
          console.error('Ошибка очистки БД:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Не удалось очистить базу данных',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Загрузка групп
  const fetchGroups = async (authToken) => {
    try {
      const client = await createApiClient(authToken);
      const response = await client.get('/admin/groups');
      setGroups(response.data || []);
    } catch (error) {
      console.error('Ошибка загрузки групп:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось загрузить группы',
      });
    }
  };

  // Загрузка чатов
  const fetchChats = async (authToken) => {
    try {
      const client = await createApiClient(authToken);
      const response = await client.get('/admin/chats');
      setChats(response.data || []);
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось загрузить чаты',
      });
    }
  };

  const fetchUsers = async (authToken) => {
    try {
      const client = await createApiClient(authToken);
      // Загружаем всех пользователей с информацией о бане
      const response = await client.get('/users');
      const usersData = response.data || [];
      
      // Если нет поля is_banned, загружаем информацию о бане отдельно
      const usersWithBanStatus = await Promise.all(
        usersData.map(async (user) => {
          if (user.is_banned !== undefined) {
            return user;
          }
          try {
            const banInfoResponse = await client.get(`/admin/users/${user.id}/ban-info`);
            return {
              ...user,
              is_banned: banInfoResponse.data.data?.is_banned || false,
              ban_reason: banInfoResponse.data.data?.ban_reason,
              banned_at: banInfoResponse.data.data?.banned_at
            };
          } catch (error) {
            return { ...user, is_banned: false };
          }
        })
      );
      
      setUsers(usersWithBanStatus);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось загрузить пользователей',
      });
    }
  };

  const fetchPosts = async (authToken) => {
    try {
      const client = await createApiClient(authToken);
      const response = await client.get('/posts');
      setPosts(response.data || []);
    } catch (error) {
      console.error('Ошибка загрузки постов:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось загрузить посты',
      });
    }
  };

  const fetchReports = async (authToken) => {
    try {
      const client = await createApiClient(authToken);
      const response = await client.get('/admin/post-reports');
      setReports(response.data || []);
    } catch (error) {
      console.error('Ошибка загрузки жалоб:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось загрузить жалобы',
      });
    }
  };

  // Функции для поддержки
  const fetchSupportTickets = async (authToken) => {
    try {
      setSupportLoading(true);
      const client = await createApiClient(authToken);
      let url = '/admin/support/tickets?limit=50&offset=0';
      if (supportStatusFilter) {
        url += `&status=${supportStatusFilter}`;
      }
      const response = await client.get(url);
      setSupportTickets(response.data?.data || []);
      setSupportStats(response.data?.stats || {});
    } catch (error) {
      console.error('Ошибка загрузки тикетов:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось загрузить обращения',
      });
    } finally {
      setSupportLoading(false);
    }
  };

  const loadSupportTicketDetail = async (ticketId, authToken) => {
    try {
      setSupportLoading(true);
      const client = await createApiClient(authToken);
      const response = await client.get(`/support/tickets/${ticketId}`);
      setSelectedSupportTicket(response.data?.ticket);
      setSupportReplies(response.data?.replies || []);
      setSupportDetailViewMode(true);
    } catch (error) {
      console.error('Ошибка загрузки деталей:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось загрузить обращение',
      });
    } finally {
      setSupportLoading(false);
    }
  };

  const sendSupportReply = async (authToken) => {
    if (!supportReplyText.trim()) {
      Alert.alert('❌ Ошибка', 'Пожалуйста, введите ответ');
      return;
    }
    try {
      setSupportLoading(true);
      const client = await createApiClient(authToken);
      await client.post(`/support/tickets/${selectedSupportTicket.id}/reply`, {
        message: supportReplyText.trim()
      });
      setSupportReplyText('');
      setSuccessModal({
        visible: true,
        title: '✅ Успешно',
        message: 'Ответ отправлен',
      });
      // Перезагружаем детали тикета и закрываем detail view
      setTimeout(() => {
        loadSupportTicketDetail(selectedSupportTicket.id, authToken);
        setSupportDetailViewMode(false);
        fetchSupportTickets(authToken);
      }, 2500);
    } catch (error) {
      console.error('Ошибка отправки ответа:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось отправить ответ',
      });
    } finally {
      setSupportLoading(false);
    }
  };

  const changeSupportStatus = async (newStatus, authToken) => {
    try {
      setSupportLoading(true);
      const client = await createApiClient(authToken);
      await client.patch(`/support/tickets/${selectedSupportTicket.id}/status`, {
        status: newStatus
      });
      setSelectedSupportTicket({ ...selectedSupportTicket, status: newStatus });
      setSuccessModal({
        visible: true,
        title: '✅ Успешно',
        message: 'Статус обновлен',
      });
      // Закрываем detail view и перезагружаем список после успешного обновления
      setTimeout(() => {
        setSupportDetailViewMode(false);
        fetchSupportTickets(authToken);
      }, 2500);
    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Не удалось изменить статус',
      });
    } finally {
      setSupportLoading(false);
    }
  };

  // Анимация открытия/закрытия меню
  useEffect(() => {
    if (menuOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -240,
          duration: 350,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [menuOpen]);

  // Автоматическое закрытие успешного модала
  useEffect(() => {
    if (successModal.visible) {
      const timer = setTimeout(() => {
        setSuccessModal({ ...successModal, visible: false });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [successModal.visible]);

  // Загрузка данных при монтировании
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('authToken');
        if (savedToken) {
          setToken(savedToken);
          await checkServerStatus(savedToken);
          await fetchServerLogs(savedToken);
          await fetchGroups(savedToken);
          await fetchChats(savedToken);
          await fetchUsers(savedToken);
          await fetchPosts(savedToken);
          await fetchReports(savedToken);
          await fetchSupportTickets(savedToken);
        } else {
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Токен не найден. Перейдите на экран входа.',
          });
          setTimeout(() => {
            navigation.navigate('Login');
          }, 2000);
        }
      } catch (error) {
        console.error('Ошибка инициализации:', error);
        setErrorModal({
          visible: true,
          title: '❌ Ошибка',
          message: 'Ошибка при загрузке данных',
        });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Автоматическое обновление статистики сервера каждые 2 секунды
  useEffect(() => {
    if (activeTab !== 'server' || !token) return;
    
    console.log('🔄 Запущен интервал обновления статистики');
    
    // Сразу обновляем при активации вкладки
    checkServerStatus(token);
    
    const interval = setInterval(() => {
      console.log('⏱️ Обновляю статистику сервера...');
      checkServerStatus(token);
    }, 2000);
    
    return () => {
      console.log('❌ Остановлен интервал обновления статистики');
      clearInterval(interval);
    };
  }, [activeTab, token]);

  // Автоматическое обновление логов каждые 3 секунды
  useEffect(() => {
    if (!logAutoRefresh || activeTab !== 'server' || !token) return;
    
    console.log('🔄 Запущен интервал обновления логов');
    
    // Сразу обновляем при активации вкладки
    fetchServerLogs(token);
    
    const interval = setInterval(() => {
      console.log('⏱️ Обновляю логи сервера...');
      fetchServerLogs(token);
    }, 3000);
    
    return () => {
      console.log('❌ Остановлен интервал обновления логов');
      clearInterval(interval);
    };
  }, [logAutoRefresh, activeTab, token]);

  // Pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (token) {
        if (activeTab === 'groups') {
          await fetchGroups(token);
        } else if (activeTab === 'chats') {
          await fetchChats(token);
        } else if (activeTab === 'users') {
          await fetchUsers(token);
        } else if (activeTab === 'posts') {
          await fetchPosts(token);
        } else if (activeTab === 'reports') {
          await fetchReports(token);
        } else if (activeTab === 'server') {
          await checkServerStatus(token);
          await fetchServerLogs(token);
        }
      }
    } catch (error) {
      console.error('Ошибка обновления:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Удаление группы
  const deleteGroup = async (groupId) => {
    setConfirmModal({
      visible: true,
      title: '🗑️ Удаление группы',
      message: 'Вы уверены? Это действие необратимо. Все сообщения в группе будут удалены.',
      icon: '🗑️',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      confirmColor: '#ef4444',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(token);
          await client.delete(`/admin/groups/${groupId}`);
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Группа удалена',
          });
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            fetchGroups(token);
          }, 1500);
        } catch (error) {
          console.error('Ошибка удаления группы:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Не удалось удалить группу',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Бан пользователя
  const banUser = async (userId) => {
    // Найти пользователя для отображения имени
    const user = users.find(u => u.id === userId);
    // Открыть модальное окно с выбором периода
    setSelectedUserForBan({ 
      id: userId, 
      username: user?.username || 'Пользователь',
      duration_days: 3 // По умолчанию 3 дня
    });
    setBanReason('Нарушение правил сообщества');
    setBanModalVisible(true);
  };

  const openBanModal = (userId, days) => {
    setSelectedUserForBan({ id: userId, duration_days: days });
    setBanReason('Нарушение правил сообщества');
    setBanModalVisible(true);
  };

  // Подтверждение бана с причиной
  const confirmBan = async () => {
    if (!banReason.trim()) {
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: 'Укажите причину бана',
      });
      return;
    }

    try {
      const client = await createApiClient(token);
      await client.post(`/admin/users/${selectedUserForBan.id}/ban`, { 
        reason: banReason.trim(),
        ban_duration_days: selectedUserForBan.duration_days
      });
      const message = selectedUserForBan.duration_days === null
        ? `Пользователь забанен навсегда`
        : `Пользователь забанен на ${selectedUserForBan.duration_days} дней`;
      console.log(`✅ ${message}. Причина: ${banReason}`);
      
      setSuccessModal({
        visible: true,
        title: '✅ Успешно',
        message: message,
      });
      
      // Закрыть модальные окна
      setTimeout(() => {
        setBanModalVisible(false);
        setSuccessModal({ ...successModal, visible: false });
        setBanReason('');
        setSelectedUserForBan(null);
        fetchUsers(token);
      }, 1500);
    } catch (error) {
      console.error('Ошибка при бане:', error);
      setErrorModal({
        visible: true,
        title: '❌ Ошибка',
        message: error.response?.data?.error || 'Не удалось забанить пользователя',
      });
    }
  };

  // Разбан пользователя
  const unbanUser = async (userId, username) => {
    setConfirmModal({
      visible: true,
      title: '✅ Разбанить пользователя',
      message: `Разбанить пользователя ${username}?`,
      icon: '✅',
      confirmText: 'Разбанить',
      cancelText: 'Отмена',
      confirmColor: '#22c55e',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(token);
          await client.post(`/admin/users/${userId}/unban`);
          console.log(`✅ Пользователь ${userId} разбанен`);
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Пользователь разбанен',
          });
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            fetchUsers(token);
          }, 1500);
        } catch (error) {
          console.error('Ошибка при разбане:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: error.response?.data?.error || 'Не удалось разбанить пользователя',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Удаление пользователя
  const deleteUser = async (userId, username) => {
    setConfirmModal({
      visible: true,
      title: '🗑️ Удаление пользователя',
      message: `Вы уверены, что хотите удалить пользователя ${username}? Это действие необратимо. Все его данные будут удалены.`,
      icon: '🗑️',
      confirmText: 'Удалить навсегда',
      cancelText: 'Отмена',
      confirmColor: '#ef4444',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(token);
          await client.delete(`/admin/users/${userId}`);
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Пользователь удалён',
          });
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            fetchUsers(token);
          }, 1500);
        } catch (error) {
          console.error('Ошибка удаления пользователя:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Не удалось удалить пользователя',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Удаление поста
  const deletePost = async (postId, author) => {
    setConfirmModal({
      visible: true,
      title: '🗑️ Удаление поста',
      message: `Вы уверены, что хотите удалить пост от ${author}? Это действие необратимо.`,
      icon: '🗑️',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      confirmColor: '#ef4444',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(token);
          await client.delete(`/admin/posts/${postId}`);
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Пост удалён',
          });
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            fetchPosts(token);
          }, 1500);
        } catch (error) {
          console.error('Ошибка удаления поста:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: error.response?.data?.error || 'Не удалось удалить пост',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Удаление чата
  const deleteChat = async (user1Id, user2Id) => {
    setConfirmModal({
      visible: true,
      title: '🗑️ Удаление чата',
      message: 'Вы уверены? Все сообщения в этом чате будут удалены. Это действие необратимо.',
      icon: '🗑️',
      confirmText: 'Удалить чат',
      cancelText: 'Отмена',
      confirmColor: '#ef4444',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(token);
          await client.delete(`/admin/chats/${user1Id}/${user2Id}`);
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Чат удалён',
          });
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            fetchChats(token);
          }, 1500);
        } catch (error) {
          console.error('Ошибка удаления чата:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Не удалось удалить чат',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Одобрить жалобу (удалить пост)
  const approveReport = async (reportId, postId) => {
    setConfirmModal({
      visible: true,
      title: '🗑️ Удалить пост',
      message: 'Вы уверены, что хотите удалить этот пост и одобрить жалобу?',
      icon: '🗑️',
      confirmText: 'Удалить пост',
      cancelText: 'Отмена',
      confirmColor: '#ef4444',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(token);
          await client.post(`/admin/post-reports/${reportId}/approve`);
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Пост удален и жалоба одобрена',
          });
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            fetchReports(token);
          }, 1500);
        } catch (error) {
          console.error('Ошибка удаления поста:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Не удалось удалить пост',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Отклонить жалобу
  const rejectReport = async (reportId) => {
    setConfirmModal({
      visible: true,
      title: '❌ Отклонить жалобу',
      message: 'Вы уверены, что хотите отклонить эту жалобу?',
      icon: '❌',
      confirmText: 'Отклонить',
      cancelText: 'Отмена',
      confirmColor: '#999',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          const client = await createApiClient(token);
          await client.post(`/admin/post-reports/${reportId}/reject`);
          setSuccessModal({
            visible: true,
            title: '✅ Успешно',
            message: 'Жалоба отклонена',
          });
          setTimeout(() => {
            setSuccessModal({ ...successModal, visible: false });
            fetchReports(token);
          }, 1500);
        } catch (error) {
          console.error('Ошибка отклонения жалобы:', error);
          setErrorModal({
            visible: true,
            title: '❌ Ошибка',
            message: 'Не удалось отклонить жалобу',
          });
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Заблокировать пользователя по жалобе
  const banUserFromReport = async (reportId) => {
    Alert.alert(
      '🚫 Заблокировать пользователя',
      'На сколько времени заблокировать пользователя?',
      [
        { text: 'Отмена', onPress: () => {} },
        { text: '1 день', onPress: () => confirmBanFromReport(reportId, 1) },
        { text: '3 дня', onPress: () => confirmBanFromReport(reportId, 3) },
        { text: '7 дней', onPress: () => confirmBanFromReport(reportId, 7) },
        { text: '30 дней', onPress: () => confirmBanFromReport(reportId, 30) },
        { text: '🔄 Навсегда', onPress: () => confirmBanFromReport(reportId, null) },
      ]
    );
  };

  const confirmBanFromReport = async (reportId, days) => {
    try {
      const client = await createApiClient(token);
      console.log(`📤 Отправляю бан на ${days} дней для жалобы ${reportId}:`, { ban_duration_days: days });
      const response = await client.post(`/admin/post-reports/${reportId}/ban-user`, { 
        ban_duration_days: days 
      });
      console.log('✅ Ответ сервера:', response.data);
      const message = days === null 
        ? 'Пользователь заблокирован навсегда'
        : `Пользователь заблокирован на ${days} дней`;
      Alert.alert('Успешно', message);
      await fetchReports(token);
    } catch (error) {
      console.error('Ошибка блокирования пользователя:', error);
      console.error('Ответ ошибки:', error.response?.data);
      Alert.alert('Ошибка', 'Не удалось заблокировать пользователя');
    }
  };

  // Выход
  const handleLogout = async () => {
    setConfirmModal({
      visible: true,
      title: '👋 Выход',
      message: 'Вы уверены, что хотите выйти из админ-панели?',
      icon: '👋',
      confirmText: 'Выйти',
      cancelText: 'Отмена',
      confirmColor: '#ef4444',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, visible: false });
        try {
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('user');
          navigation.navigate('Login');
        } catch (error) {
          console.error('Ошибка выхода:', error);
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, visible: false });
      }
    });
  };

  // Рендер логов сервера
  const renderLogItem = ({ item, index }) => (
    <View style={styles.logItem}>
      <View style={[
        styles.logIndicator,
        { 
          backgroundColor: item.level === 'error' ? '#ef4444' : 
                          item.level === 'warning' ? '#f59e0b' :
                          item.level === 'success' ? '#22c55e' : '#3b82f6'
        }
      ]} />
      <View style={styles.logContent}>
        <Text style={styles.logText}>{item.message}</Text>
        <Text style={styles.logTime}>
          {new Date(item.timestamp).toLocaleTimeString('ru-RU')}
        </Text>
      </View>
    </View>
  );

  // Рендер статуса сервера
  const renderServerStatus = () => (
    <ScrollView 
      style={styles.list}
      contentContainerStyle={styles.serverContent}
      refreshControl={
        <RefreshControl 
          refreshing={refreshing} 
          onRefresh={onRefresh}
          tintColor="#6366F1"
        />
      }
    >
      {/* Статус блок */}
      <View style={[
        styles.statusCard,
        { backgroundColor: serverStatus === 'online' ? '#dcfce7' : '#fee2e2' }
      ]}>
        <View style={styles.statusHeader}>
          <View style={[
            styles.statusIndicator,
            { backgroundColor: serverStatus === 'online' ? '#22c55e' : '#ef4444' }
          ]} />
          <Text style={[
            styles.statusTitle,
            { color: serverStatus === 'online' ? '#15803d' : '#7f1d1d' }
          ]}>
            {serverStatus === 'online' ? '🟢 Сервер онлайн' : '🔴 Сервер оффлайн'}
          </Text>
        </View>
        <Text style={[
          styles.statusSubtitle,
          { color: serverStatus === 'online' ? '#16a34a' : '#991b1b' }
        ]}>
          {serverStatus === 'online' ? 'Все системы работают нормально' : 'Нет подключения к серверу'}
        </Text>
      </View>

      {/* Статистика */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="timer" size={24} color="#6366F1" />
          <Text style={styles.statValue}>{serverStats.uptime || '0'}s</Text>
          <Text style={styles.statLabel}>Время работы</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="people" size={24} color="#6366F1" />
          <Text style={styles.statValue}>{serverStats.activeUsers || 0}</Text>
          <Text style={styles.statLabel}>Активных пользователей</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="chatbubbles" size={24} color="#6366F1" />
          <Text style={styles.statValue}>{serverStats.totalMessages || 0}</Text>
          <Text style={styles.statLabel}>Всего сообщений</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="hardware-chip" size={24} color="#6366F1" />
          <Text style={styles.statValue}>{serverStats.memory || 'N/A'}</Text>
          <Text style={styles.statLabel}>Память</Text>
        </View>
      </View>

      {/* Кнопка перезагрузки */}
      <TouchableOpacity 
        style={styles.restartButton}
        onPress={() => restartServer(token)}
        activeOpacity={0.8}
      >
        <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.restartButtonText}>Перезагрузить сервер</Text>
      </TouchableOpacity>

      {/* Кнопка очистки БД */}
      <TouchableOpacity 
        style={[styles.restartButton, { backgroundColor: '#dc2626' }]}
        onPress={() => clearDatabase(token)}
        activeOpacity={0.8}
      >
        <Ionicons name="trash" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.restartButtonText}>Очистить базу данных</Text>
      </TouchableOpacity>

      {/* Переключатель автообновления логов */}
      <View style={styles.autoRefreshContainer}>
        <View style={styles.autoRefreshContent}>
          <Ionicons name="sync" size={18} color="#6366F1" />
          <Text style={styles.autoRefreshLabel}>Автообновление логов</Text>
        </View>
        <TouchableOpacity 
          style={[
            styles.toggleButton,
            { backgroundColor: logAutoRefresh ? '#22c55e' : '#cbd5e1' }
          ]}
          onPress={() => setLogAutoRefresh(!logAutoRefresh)}
          activeOpacity={0.8}
        >
          <View style={[
            styles.toggleCircle,
            { transform: [{ translateX: logAutoRefresh ? 20 : 0 }] }
          ]} />
        </TouchableOpacity>
      </View>

      {/* Логи */}
      <View style={styles.logsHeader}>
        <Ionicons name="document-text" size={20} color="#1e293b" />
        <Text style={styles.logsTitle}>Логи сервера (последние 50)</Text>
      </View>
      
      {serverLogs.length > 0 ? (
        <View style={styles.logsList}>
          {serverLogs.slice(-50).reverse().map((log, index) => (
            <View key={index} style={styles.logItem}>
              <View style={[
                styles.logIndicator,
                { 
                  backgroundColor: log.level === 'error' ? '#ef4444' : 
                                  log.level === 'warning' ? '#f59e0b' :
                                  log.level === 'success' ? '#22c55e' : '#3b82f6'
                }
              ]} />
              <View style={styles.logContent}>
                <Text style={styles.logText} numberOfLines={2}>{log.message}</Text>
                <Text style={styles.logTime}>
                  {new Date(log.timestamp).toLocaleTimeString('ru-RU')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyLogsContainer}>
          <Ionicons name="document-outline" size={48} color="#ddd" />
          <Text style={styles.emptyLogsText}>Нет логов</Text>
        </View>
      )}
    </ScrollView>
  );

  // Рендер элемента группы
  const renderGroupItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemIcon}>
        <Ionicons name="people" size={24} color="#6366F1" />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        <View style={styles.itemMetaRow}>
          <Ionicons name="person" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {item.creator_name || 'Неизвестно'}
          </Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Ionicons name="people" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {item.member_count || 0} участников
          </Text>
        </View>
        {item.description && (
          <Text style={styles.itemDescription}>{item.description}</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteGroup(item.id)}
        activeOpacity={0.7}
      >
        <Ionicons name="trash" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // Рендер элемента чата
  const renderChatItem = ({ item }) => {
    const user1Name = item.user1?.username || `User ${item.user1?.id || 'Unknown'}`;
    const user2Name = item.user2?.username || `User ${item.user2?.id || 'Unknown'}`;
    const messageTime = item.last_message_time 
      ? new Date(item.last_message_time).toLocaleString('ru-RU')
      : 'N/A';

    return (
      <View style={styles.itemContainer}>
        <View style={styles.itemIcon}>
          <Ionicons name="chatbubbles" size={24} color="#6366F1" />
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>
            {user1Name} ↔ {user2Name}
          </Text>
          <View style={styles.itemMetaRow}>
            <Ionicons name="chatbox-ellipses" size={12} color="#999" />
            <Text style={styles.itemMeta}>
              {item.message_count || 0} сообщений
            </Text>
          </View>
          <View style={styles.itemMetaRow}>
            <Ionicons name="time" size={12} color="#999" />
            <Text style={styles.itemMeta}>
              {messageTime}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            if (item.user1?.id && item.user2?.id) {
              deleteChat(item.user1.id, item.user2.id);
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="trash" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  // Рендер элемента пользователя
  const renderUserItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemIcon}>
        <Ionicons name="person" size={24} color="#6366F1" />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.username}</Text>
        <View style={styles.itemMetaRow}>
          <Ionicons name="mail" size={12} color="#999" />
          <Text style={styles.itemMeta}>{item.email}</Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Ionicons name="calendar" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {new Date(item.created_at).toLocaleDateString('ru-RU')}
          </Text>
        </View>
        {item.is_banned && (
          <View style={styles.bannedBadge}>
            <Text style={styles.bannedText}>ЗАБАНЕН</Text>
          </View>
        )}
      </View>
      {item.is_banned ? (
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: '#22c55e', marginRight: 8 }]}
          onPress={() => unbanUser(item.id, item.username)}
          activeOpacity={0.7}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.deleteButton, { marginRight: 8 }]}
          onPress={() => banUser(item.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="ban" size={18} color="#fff" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteUser(item.id, item.username)}
        activeOpacity={0.7}
      >
        <Ionicons name="trash" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // Рендер элемента поста
  const renderPostItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemIcon}>
        <Ionicons name="document-text" size={24} color="#6366F1" />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.content || 'Без текста'}
        </Text>
        <View style={styles.itemMetaRow}>
          <Ionicons name="person" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {item.user?.username || 'Неизвестно'}
          </Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Ionicons name="heart" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {item.likes_count || 0} лайков
          </Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Ionicons name="chatbubbles" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {item.comments_count || 0} комментариев
          </Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Ionicons name="calendar" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {new Date(item.created_at).toLocaleString('ru-RU')}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deletePost(item.id, item.user?.username || 'Неизвестно')}
        activeOpacity={0.7}
      >
        <Ionicons name="trash" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // Рендер элемента жалобы
  const renderReportItem = ({ item }) => (
    <View style={[
      styles.itemContainer,
      item.status === 'pending' && { borderLeftWidth: 3, borderLeftColor: '#FF9500' }
    ]}>
      <View style={[
        styles.itemIcon,
        { backgroundColor: 
          item.status === 'pending' ? '#fff3e0' :
          item.status === 'reviewed' ? '#e3f2fd' :
          item.status === 'approved' ? '#e8f5e9' : '#fafafa'
        }
      ]}>
        <Ionicons name="warning" size={24} color={
          item.status === 'pending' ? '#FF9500' :
          item.status === 'reviewed' ? '#5AC8FA' :
          item.status === 'approved' ? '#34C759' : '#999'
        } />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.post_content || 'Пост удален'}
        </Text>
        <View style={styles.itemMetaRow}>
          <Ionicons name="person" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            Пожаловался: {item.reporter_username}
          </Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Ionicons name="document-text" size={12} color="#999" />
          <Text style={styles.itemMeta} numberOfLines={1}>
            "{item.reason}"
          </Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Ionicons name="calendar" size={12} color="#999" />
          <Text style={styles.itemMeta}>
            {new Date(item.created_at).toLocaleDateString('ru-RU')}
          </Text>
        </View>
        <View style={[
          styles.statusBadgeSmall,
          { backgroundColor: 
            item.status === 'pending' ? '#FFF3E0' :
            item.status === 'reviewed' ? '#E3F2FD' :
            item.status === 'approved' ? '#E8F5E9' : '#FAFAFA'
          }
        ]}>
          <Text style={[
            styles.statusBadgeText,
            { color: 
              item.status === 'pending' ? '#FF9500' :
              item.status === 'reviewed' ? '#5AC8FA' :
              item.status === 'approved' ? '#34C759' : '#999'
            }
          ]}>
            {item.status === 'pending' ? 'На рассмотрении' :
             item.status === 'reviewed' ? 'Просмотрено' :
             item.status === 'approved' ? 'Одобрено' : 'Отклонено'}
          </Text>
        </View>
      </View>
      {item.status === 'pending' && (
        <View style={styles.reportActions}>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: '#34C759' }]}
            onPress={() => approveReport(item.id, item.post_id)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: '#FF3B30', marginTop: 8 }]}
            onPress={() => banUserFromReport(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons name="ban" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: '#999', marginTop: 8 }]}
            onPress={() => rejectReport(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Оверлей для закрытия меню - НА ВЕРХНЕМ УРОВНЕ */}
      {menuOpen && (
        <Pressable
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 50,
          }}
          onPress={() => setMenuOpen(false)}
        />
      )}

      {/* Меню - НА ВЕРХНЕМ УРОВНЕ */}
      <Animated.View style={[
        styles.permanentSideMenu,
        {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          transform: [{ translateX: slideAnim }]
        }
      ]}>
        <View style={styles.permanentMenuHeader}>
          <Text style={styles.permanentMenuTitle}>⚙️ Панель</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.permanentMenuItem,
            activeTab === 'server' && styles.activeMenuItemBg,
          ]}
          onPress={() => {
            setActiveTab('server');
            setMenuOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="server" 
            size={20} 
            color={activeTab === 'server' ? '#6366F1' : '#666'}
            style={{ marginRight: 10 }}
          />
          <Text
            style={[
              styles.permanentMenuItemText,
              activeTab === 'server' && styles.activeMenuItemText,
            ]}
          >
            Сервер
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.permanentMenuItem,
            activeTab === 'groups' && styles.activeMenuItemBg,
          ]}
          onPress={() => {
            setActiveTab('groups');
            setMenuOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="people" 
            size={20} 
            color={activeTab === 'groups' ? '#6366F1' : '#666'}
            style={{ marginRight: 10 }}
          />
          <Text
            style={[
              styles.permanentMenuItemText,
              activeTab === 'groups' && styles.activeMenuItemText,
            ]}
          >
            Группы
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.permanentMenuItem,
            activeTab === 'chats' && styles.activeMenuItemBg,
          ]}
          onPress={() => {
            setActiveTab('chats');
            setMenuOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="chatbubbles" 
            size={20} 
            color={activeTab === 'chats' ? '#6366F1' : '#666'}
            style={{ marginRight: 10 }}
          />
          <Text
            style={[
              styles.permanentMenuItemText,
              activeTab === 'chats' && styles.activeMenuItemText,
            ]}
          >
            Чаты
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.permanentMenuItem,
            activeTab === 'users' && styles.activeMenuItemBg,
          ]}
          onPress={() => {
            setActiveTab('users');
            setMenuOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="person" 
            size={20} 
            color={activeTab === 'users' ? '#6366F1' : '#666'}
            style={{ marginRight: 10 }}
          />
          <Text
            style={[
              styles.permanentMenuItemText,
              activeTab === 'users' && styles.activeMenuItemText,
            ]}
          >
            Люди
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.permanentMenuItem,
            activeTab === 'posts' && styles.activeMenuItemBg,
          ]}
          onPress={() => {
            setActiveTab('posts');
            setMenuOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="document-text" 
            size={20} 
            color={activeTab === 'posts' ? '#6366F1' : '#666'}
            style={{ marginRight: 10 }}
          />
          <Text
            style={[
              styles.permanentMenuItemText,
              activeTab === 'posts' && styles.activeMenuItemText,
            ]}
          >
            Посты
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.permanentMenuItem,
            activeTab === 'reports' && styles.activeMenuItemBg,
          ]}
          onPress={() => {
            setActiveTab('reports');
            setMenuOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="warning" 
            size={20} 
            color={activeTab === 'reports' ? '#6366F1' : '#666'}
            style={{ marginRight: 10 }}
          />
          <Text
            style={[
              styles.permanentMenuItemText,
              activeTab === 'reports' && styles.activeMenuItemText,
            ]}
          >
            Жалобы
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.permanentMenuItem}
          onPress={() => {
            setActiveTab('support');
            setMenuOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="help-circle" 
            size={20} 
            color="#666"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.permanentMenuItemText}>
            Поддержка
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Основной контент */}
      <View style={{ flex: 1 }}>

        {/* Основной контент */}
        <View style={{ flex: 1 }}>
          {/* Шапка */}
          <SafeAreaView style={[styles.safeArea, styles.header]} edges={['top']}>
            <View style={styles.headerContent}>
              <TouchableOpacity 
                onPress={() => setMenuOpen(!menuOpen)}
                style={styles.menuButton}
                activeOpacity={0.8}
              >
                <Ionicons name={menuOpen ? "chevron-back" : "chevron-forward"} size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.title}>⚙️ Админ-панель</Text>
              <TouchableOpacity 
                onPress={handleLogout}
                style={styles.logoutButton}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* Контент */}
          {activeTab === 'server' ? (
            renderServerStatus()
          ) : activeTab === 'groups' ? (
            <FlatList
              data={groups}
              renderItem={renderGroupItem}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh}
                  tintColor="#6366F1"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="layers-outline" size={64} color="#ddd" />
                  <Text style={styles.emptyText}>Нет групп</Text>
                </View>
              }
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          ) : activeTab === 'chats' ? (
            <FlatList
              data={groups}
              renderItem={renderGroupItem}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh}
                  tintColor="#6366F1"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="layers-outline" size={64} color="#ddd" />
                  <Text style={styles.emptyText}>Нет групп</Text>
                </View>
              }
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          ) : activeTab === 'chats' ? (
            <FlatList
              data={chats}
              renderItem={renderChatItem}
              keyExtractor={(item, index) => `${item.user1?.id}-${item.user2?.id}-${index}`}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh}
                  tintColor="#6366F1"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="chatbubbles-outline" size={64} color="#ddd" />
                  <Text style={styles.emptyText}>Нет чатов</Text>
                </View>
              }
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          ) : activeTab === 'users' ? (
            <FlatList
              data={users}
              renderItem={renderUserItem}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh}
                  tintColor="#6366F1"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={64} color="#ddd" />
                  <Text style={styles.emptyText}>Нет пользователей</Text>
                </View>
              }
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          ) : activeTab === 'posts' ? (
            <FlatList
              data={posts}
              renderItem={renderPostItem}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh}
                  tintColor="#6366F1"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-outline" size={64} color="#ddd" />
                  <Text style={styles.emptyText}>Нет постов</Text>
                </View>
              }
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          ) : activeTab === 'support' ? (
            supportDetailViewMode ? (
              // Детальный вид обращения
              <ScrollView style={styles.list}>
                {selectedSupportTicket && (
                  <>
                    <View style={styles.supportHeader}>
                      <TouchableOpacity onPress={() => setSupportDetailViewMode(false)}>
                        <Ionicons name="chevron-back" size={24} color="#6366F1" />
                      </TouchableOpacity>
                      <Text style={styles.supportHeaderTitle}>Обращение #{selectedSupportTicket.id}</Text>
                    </View>
                    
                    <View style={styles.supportDetail}>
                      <Text style={styles.supportSubject}>{selectedSupportTicket.subject}</Text>
                      <View style={styles.supportMeta}>
                        <Text style={styles.supportMetaText}>👤 {selectedSupportTicket.username}</Text>
                        <Text style={styles.supportMetaText}>📁 {selectedSupportTicket.category}</Text>
                      </View>
                      
                      <View style={[styles.supportMessage, { backgroundColor: '#f5f5f5' }]}>
                        <Text style={styles.supportMessageText}>{selectedSupportTicket.message}</Text>
                      </View>
                      
                      {supportReplies.length > 0 && (
                        <>
                          <Text style={styles.supportRepliesTitle}>Ответы ({supportReplies.length})</Text>
                          {supportReplies.map((reply, idx) => (
                            <View key={idx} style={styles.supportReply}>
                              <Text style={styles.supportReplyAuthor}>👨‍💼 {reply.admin_name || 'Админ'}</Text>
                              <Text style={styles.supportReplyDate}>{new Date(reply.created_at).toLocaleString('ru-RU')}</Text>
                              <Text style={styles.supportReplyMessage}>{reply.message}</Text>
                            </View>
                          ))}
                        </>
                      )}
                      
                      <View style={styles.supportStatusSection}>
                        <Text style={styles.supportStatusLabel}>Статус:</Text>
                        <View style={styles.supportStatusButtons}>
                          {['open', 'in_progress', 'resolved', 'closed'].map((status) => (
                            <TouchableOpacity
                              key={status}
                              style={[
                                styles.supportStatusBtn,
                                selectedSupportTicket.status === status && styles.supportStatusBtnActive
                              ]}
                              onPress={() => changeSupportStatus(status, token)}
                              disabled={supportLoading}
                            >
                              <Text style={[
                                styles.supportStatusBtnText,
                                selectedSupportTicket.status === status && styles.supportStatusBtnTextActive
                              ]}>
                                {status === 'open' ? '🔴' : status === 'in_progress' ? '🟡' : status === 'resolved' ? '🟢' : '⚫'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      
                      <TextInput
                        style={styles.supportReplyInput}
                        placeholder="Введите ответ пользователю..."
                        placeholderTextColor="#999"
                        value={supportReplyText}
                        onChangeText={setSupportReplyText}
                        multiline
                        maxLength={5000}
                        editable={!supportLoading}
                      />
                      
                      <TouchableOpacity
                        style={[styles.supportSendBtn, supportLoading && { opacity: 0.7 }]}
                        onPress={() => sendSupportReply(token)}
                        disabled={supportLoading}
                      >
                        <Text style={styles.supportSendBtnText}>✅ Отправить ответ</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            ) : (
              // Список обращений
              <View style={styles.list}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ paddingVertical: 8 }}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                >
                  {[
                    { label: 'Открыты', value: 'open', color: '#e74c3c', icon: '🔴' },
                    { label: 'В обработке', value: 'in_progress', color: '#f39c12', icon: '🟡' },
                    { label: 'Решены', value: 'resolved', color: '#27ae60', icon: '🟢' },
                    { label: 'Закрыты', value: 'closed', color: '#95a5a6', icon: '⚫' }
                  ].map((filter) => (
                    <TouchableOpacity
                      key={filter.value}
                      style={[
                        styles.supportFilterBtn,
                        supportStatusFilter === filter.value && [
                          styles.supportFilterBtnActive,
                          { borderColor: filter.color, backgroundColor: filter.color + '15' }
                        ]
                      ]}
                      onPress={() => setSupportStatusFilter(filter.value)}
                    >
                      <Text style={styles.supportFilterIcon}>{filter.icon}</Text>
                      <Text style={[
                        styles.supportFilterBtnText,
                        supportStatusFilter === filter.value && { color: filter.color, fontWeight: '700' }
                      ]}>
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                <FlatList
                  data={supportTickets}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.supportTicketCard}
                      onPress={() => loadSupportTicketDetail(item.id, token)}
                    >
                      <View style={styles.supportTicketCardContent}>
                        <View style={styles.supportTicketCardTop}>
                          <Text style={styles.supportTicketNumber}>#{item.id}</Text>
                          <Text style={styles.supportTicketStatus}>{item.status === 'open' ? '🔴' : item.status === 'in_progress' ? '🟡' : item.status === 'resolved' ? '🟢' : '⚫'}</Text>
                        </View>
                        <Text style={styles.supportTicketSubject} numberOfLines={2}>{item.subject}</Text>
                        <View style={styles.supportTicketFooter}>
                          <Text style={styles.supportTicketUser}>👤 {item.username}</Text>
                          <Text style={styles.supportTicketReplies}>💬 {item.replies_count || 0}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  keyExtractor={(item) => item.id.toString()}
                  refreshControl={
                    <RefreshControl 
                      refreshing={refreshing} 
                      onRefresh={() => fetchSupportTickets(token)}
                      tintColor="#6366F1"
                    />
                  }
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Ionicons name="help-outline" size={64} color="#ddd" />
                      <Text style={styles.emptyText}>Нет обращений</Text>
                    </View>
                  }
                  scrollEnabled={false}
                  contentContainerStyle={styles.listContent}
                />
              </View>
            )
          ) : (
            <View style={styles.list}>
              <View style={styles.filterReportsContainer}>
                {['all', 'pending', 'reviewed', 'approved', 'rejected'].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.filterReportButton,
                      reportFilterStatus === status && styles.filterReportButtonActive
                    ]}
                    onPress={() => setReportFilterStatus(status)}
                  >
                    <Text style={[
                      styles.filterReportButtonText,
                      reportFilterStatus === status && styles.filterReportButtonTextActive
                    ]}>
                      {status === 'all' ? 'Все' : 
                       status === 'pending' ? 'На рассмотрении' :
                       status === 'reviewed' ? 'Просмотрено' :
                       status === 'approved' ? 'Одобрено' : 'Отклонено'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FlatList
                data={reportFilterStatus === 'all' ? reports : reports.filter(r => r.status === reportFilterStatus)}
                renderItem={renderReportItem}
                keyExtractor={(item) => item.id.toString()}
                refreshControl={
                  <RefreshControl 
                    refreshing={refreshing} 
                    onRefresh={onRefresh}
                    tintColor="#6366F1"
                  />
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="warning-outline" size={64} color="#ddd" />
                    <Text style={styles.emptyText}>Нет жалоб</Text>
                  </View>
                }
                scrollEnabled={false}
                contentContainerStyle={styles.listContent}
              />
            </View>
          )}
        </View>
      </View>
      
      {/* Красивое модальное окно подтверждения */}
      <Modal
        visible={confirmModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setConfirmModal({ ...confirmModal, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContainer}>
            <View style={[
              styles.confirmModalIcon,
              { backgroundColor: confirmModal.isDestructive ? '#fee2e2' : '#f0f4ff' }
            ]}>
              <Text style={styles.confirmModalIconText}>{confirmModal.icon}</Text>
            </View>
            
            <Text style={styles.confirmModalTitle}>{confirmModal.title}</Text>
            <Text style={styles.confirmModalMessage}>{confirmModal.message}</Text>
            
            <View style={styles.confirmModalButtonsContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={confirmModal.onCancel}
              >
                <Text style={styles.cancelButtonText}>{confirmModal.cancelText}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  styles.confirmButton,
                  { backgroundColor: confirmModal.confirmColor }
                ]}
                onPress={confirmModal.onConfirm}
              >
                <Text style={styles.confirmButtonText}>{confirmModal.confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Красивое модальное окно успеха */}
      <Modal
        visible={successModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSuccessModal({ ...successModal, visible: false })}
      >
        <TouchableOpacity 
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={() => setSuccessModal({ ...successModal, visible: false })}
        >
          <View style={styles.successModalContainer}>
            <View style={styles.successModalIcon}>
              <Text style={styles.successModalIconText}>✅</Text>
            </View>
            
            <Text style={styles.successModalTitle}>{successModal.title}</Text>
            <Text style={styles.successModalMessage}>{successModal.message}</Text>
            
            <View style={styles.successModalLoader}>
              <View style={[styles.successModalDot, { backgroundColor: '#22c55e' }]} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Красивое модальное окно ошибки */}
      <Modal
        visible={errorModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setErrorModal({ ...errorModal, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.errorModalContainer}>
            <View style={styles.errorModalIcon}>
              <Text style={styles.errorModalIconText}>❌</Text>
            </View>
            
            <Text style={styles.errorModalTitle}>{errorModal.title}</Text>
            <Text style={styles.errorModalMessage}>{errorModal.message}</Text>
            
            <TouchableOpacity
              style={styles.errorModalButton}
              onPress={() => setErrorModal({ ...errorModal, visible: false })}
            >
              <Text style={styles.errorModalButtonText}>ОК</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Модальное окно причины бана */}
      <Modal
        visible={banModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.banModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🚫 Причина бана</Text>
            </View>
            
            {selectedUserForBan?.duration_days !== undefined && (
              <View style={styles.banDurationInfo}>
                <Ionicons name="time" size={16} color="#FF9500" />
                <Text style={styles.banDurationText}>
                  {selectedUserForBan.duration_days === null 
                    ? 'Период: Навсегда'
                    : `Период: ${selectedUserForBan.duration_days} ${selectedUserForBan.duration_days === 1 ? 'день' : 'дней'}`
                  }
                </Text>
              </View>
            )}
            
            <Text style={styles.modalSubtitle}>
              Выберите период бана
            </Text>

            <View style={styles.banDurationButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.banDurationButton,
                  selectedUserForBan?.duration_days === 1 && styles.banDurationButtonActive
                ]}
                onPress={() => setSelectedUserForBan({ ...selectedUserForBan, duration_days: 1 })}
              >
                <Text style={[
                  styles.banDurationButtonText,
                  selectedUserForBan?.duration_days === 1 && styles.banDurationButtonTextActive
                ]}>1 день</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.banDurationButton,
                  selectedUserForBan?.duration_days === 3 && styles.banDurationButtonActive
                ]}
                onPress={() => setSelectedUserForBan({ ...selectedUserForBan, duration_days: 3 })}
              >
                <Text style={[
                  styles.banDurationButtonText,
                  selectedUserForBan?.duration_days === 3 && styles.banDurationButtonTextActive
                ]}>3 дня</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.banDurationButton,
                  selectedUserForBan?.duration_days === 7 && styles.banDurationButtonActive
                ]}
                onPress={() => setSelectedUserForBan({ ...selectedUserForBan, duration_days: 7 })}
              >
                <Text style={[
                  styles.banDurationButtonText,
                  selectedUserForBan?.duration_days === 7 && styles.banDurationButtonTextActive
                ]}>7 дней</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.banDurationButton,
                  selectedUserForBan?.duration_days === 30 && styles.banDurationButtonActive
                ]}
                onPress={() => setSelectedUserForBan({ ...selectedUserForBan, duration_days: 30 })}
              >
                <Text style={[
                  styles.banDurationButtonText,
                  selectedUserForBan?.duration_days === 30 && styles.banDurationButtonTextActive
                ]}>30 дней</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.banDurationButton,
                  selectedUserForBan?.duration_days === null && styles.banDurationButtonActive
                ]}
                onPress={() => setSelectedUserForBan({ ...selectedUserForBan, duration_days: null })}
              >
                <Text style={[
                  styles.banDurationButtonText,
                  selectedUserForBan?.duration_days === null && styles.banDurationButtonTextActive
                ]}>🔄 Навсегда</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSubtitle}>
              Укажите причину блокировки
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Напишите причину бана..."
              placeholderTextColor="#999"
              value={banReason}
              onChangeText={setBanReason}
              multiline={true}
              numberOfLines={4}
            />
            
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setBanModalVisible(false);
                  setBanReason('');
                  setSelectedUserForBan(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmBan}
              >
                <Text style={styles.confirmButtonText}>Забанить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  safeArea: {
    backgroundColor: '#1e293b',
  },
  header: {
    backgroundColor: '#1e293b',
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  menuButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  permanentSideMenu: {
    width: 240,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    paddingVertical: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  permanentMenuHeader: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  permanentMenuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  permanentMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f4ff',
  },
  activeMenuItemBg: {
    backgroundColor: '#f0f4ff',
  },
  permanentMenuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  activeMenuItemText: {
    color: '#6366F1',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    paddingBottom: 20,
  },
  serverContent: {
    padding: 12,
    paddingBottom: 20,
  },
  statusCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusSubtitle: {
    fontSize: 14,
    marginLeft: 22,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6366F1',
    marginVertical: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  restartButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  restartButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  autoRefreshContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  autoRefreshContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  autoRefreshLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  toggleButton: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  logsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  logsList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  logIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 10,
  },
  logContent: {
    flex: 1,
  },
  logText: {
    fontSize: 13,
    color: '#1e293b',
    marginBottom: 2,
  },
  logTime: {
    fontSize: 11,
    color: '#94a3b8',
  },
  emptyLogsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyLogsText: {
    fontSize: 16,
    color: '#cbd5e1',
    marginTop: 12,
    fontWeight: '500',
  },
  itemContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginBottom: 12,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 6,
  },
  itemDescription: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
    fontStyle: 'italic',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#cbd5e1',
    marginTop: 12,
    fontWeight: '500',
  },
  bannedBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  bannedText: {
    color: '#dc2626',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
    lineHeight: 20,
  },
  banDurationInfo: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  banDurationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9500',
    flex: 1,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    marginBottom: 20,
    textAlignVertical: 'top',
    backgroundColor: '#f8f9fa',
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e2e8f0',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#ef4444',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  filterReportsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  filterReportButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  filterReportButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  filterReportButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterReportButtonTextActive: {
    color: '#fff',
  },
  reportActions: {
    justifyContent: 'center',
    gap: 4,
  },
  statusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  confirmModalContainer: {
    width: '82%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  confirmModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmModalIconText: {
    fontSize: 32,
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  confirmModalMessage: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  confirmModalButtonsContainer: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  successModalContainer: {
    width: '75%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  successModalIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successModalIconText: {
    fontSize: 36,
  },
  successModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#15803d',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  successModalMessage: {
    fontSize: 14,
    color: '#4ade80',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  successModalLoader: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  successModalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  errorModalContainer: {
    width: '82%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  errorModalIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorModalIconText: {
    fontSize: 36,
  },
  errorModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#7f1d1d',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  errorModalMessage: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorModalButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  errorModalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  banModalContainer: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginTop: 'auto',
    marginBottom: 'auto',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  banDurationButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 16,
    gap: 8,
  },
  banDurationButton: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f0f4ff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  banDurationButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  banDurationButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  banDurationButtonTextActive: {
    color: '#fff',
  },
  
  // Стили для поддержки
  supportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  supportHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 12,
  },
  supportDetail: {
    padding: 16,
  },
  supportSubject: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 14,
    lineHeight: 24,
  },
  supportMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  supportMetaText: {
    fontSize: 12,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  supportMessage: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 18,
    backgroundColor: '#f8fafc',
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  supportMessageText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },
  supportRepliesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 14,
    marginTop: 20,
  },
  supportReply: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  supportReplyAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 4,
  },
  supportReplyDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 8,
  },
  supportReplyMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  supportStatusSection: {
    marginVertical: 18,
  },
  supportStatusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 10,
  },
  supportStatusButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  supportStatusBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  supportStatusBtnActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  supportStatusBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  supportStatusBtnTextActive: {
    color: '#fff',
  },
  supportReplyInput: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 110,
    fontSize: 14,
    textAlignVertical: 'top',
    color: '#1e293b',
    marginVertical: 18,
    backgroundColor: '#f8fafc',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  supportSendBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  supportSendBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  supportFilterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: '#f8f9fa',
    borderColor: '#e9ecef',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 120,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  supportFilterIcon: {
    fontSize: 18,
  },
  supportFilterBtnActive: {
    backgroundColor: '#f0f4ff',
    borderColor: '#6366F1',
    elevation: 3,
    shadowOpacity: 0.15,
  },
  supportFilterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  supportFilterBtnTextActive: {
    color: '#6366F1',
    fontWeight: '700',
  },
  supportTicketCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  supportTicketCardContent: {
    gap: 10,
  },
  supportTicketCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  supportTicketNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  supportTicketStatus: {
    fontSize: 16,
  },
  supportTicketSubject: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  supportTicketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  supportTicketUser: {
    fontSize: 12,
    color: '#64748b',
  },
  supportTicketReplies: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
  },
});

export default AdminPanelScreen;