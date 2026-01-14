import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  Image,
  PanGestureHandler,
  Animated,
  Easing,
  Keyboard,
  ActivityIndicator,
  ScrollView,
  Switch,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Video } from 'expo-av';
import { getOrCreateSocket } from '../services/globalSocket';
import { emitMessageSent, emitGroupMessageSent, emitMessageRead } from '../services/appEvents';
import { messageAPI, mediaAPI, groupAPI, pinnedAPI, userAPI, friendAPI, callAPI, profileAPI } from '../services/api';
import { showNotificationIfEnabled, NotificationTemplates, NotificationSettings, setActiveChatContext, clearActiveChatContext } from '../services/notifications';
import { GestureHandlerRootView, PanGestureHandler as RNGHPanGestureHandler } from 'react-native-gesture-handler';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { LinearGradient } from 'expo-linear-gradient';
import { VoiceRecorderModal } from '../components/VoiceRecorderModal';
import { VoiceMessagePlayer } from '../components/VoiceMessagePlayer';
import { PinnedMessagesBar } from '../components/PinnedMessagesBar';
import { PinVisibilityModal } from '../components/PinVisibilityModal';
import { MediaCaptionModal } from '../components/MediaCaptionModal';
import { audioRecorder } from '../services/audioRecorder';
import TypingIndicator from '../components/TypingIndicator';
import MessageCheckmark from '../components/MessageCheckmark';
import { normalizeMediaUrl, normalizeMessageMediaUrl } from '../services/urlUtils';
import VideoCirclePlayer from '../components/VideoCirclePlayer';
import VideoCircleRecorder from '../components/VideoCircleRecorder';
import CachedImage from '../components/CachedImage';
import CachedVideo from '../components/CachedVideo';
import { preloadVideos, cleanOldCache, preloadMediaList, cacheLocalFile } from '../services/mediaCache';
import { saveChatMessages, loadChatMessages, addMessageToCache, updateMessageInCache, deleteMessageFromCache, cleanOldMessageCache } from '../services/messageCache';

const ChatScreen = ({ route, navigation }) => {
  const { theme, isDark } = useTheme();
  const { error, warning, info, success } = useModalAlert();

  const API_URL = 'http://151.247.196.66:3001/api';

  // Функция для форматирования времени последнего визита
  const formatLastSeen = (lastSeenDate) => {
    if (!lastSeenDate) {
      // ⭐ ИЗМЕНЕНО: Показываем точное время вместо "никогда не был в сети"
      return 'недавно';
    }
    
    try {
      const date = new Date(lastSeenDate);
      const now = new Date();
      const diff = now - date;
      
      // Различные интервалы времени
      const minute = 60 * 1000;
      const hour = minute * 60;
      const day = hour * 24;
      const week = day * 7;
      const month = day * 30;
      
      if (diff < minute) {
        return 'только что';
      } else if (diff < hour) {
        const mins = Math.floor(diff / minute);
        if (mins === 1) return '1 минуту назад';
        if (mins % 10 === 1 && mins !== 11) return `${mins} минуту назад`;
        if (mins % 10 >= 2 && mins % 10 <= 4 && (mins % 100 < 10 || mins % 100 >= 20)) return `${mins} минуты назад`;
        return `${mins} минут назад`;
      } else if (diff < day) {
        const hours = Math.floor(diff / hour);
        if (hours === 1) return 'час назад';
        if (hours % 10 === 1 && hours !== 11) return `${hours} час назад`;
        if (hours % 10 >= 2 && hours % 10 <= 4 && (hours % 100 < 10 || hours % 100 >= 20)) return `${hours} часа назад`;
        return `${hours} часов назад`;
      } else if (diff < day * 2) {
        const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return `вчера в ${time}`;
      } else if (diff < week) {
        const days = Math.floor(diff / day);
        if (days === 2) return '2 дня назад';
        if (days === 3) return '3 дня назад';
        if (days === 4) return '4 дня назад';
        if (days % 10 === 1 && days !== 11) return `${days} день назад`;
        if (days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20)) return `${days} дня назад`;
        return `${days} дней назад`;
      } else if (diff < month) {
        const weeks = Math.floor(diff / week);
        if (weeks === 1) return 'неделю назад';
        if (weeks % 10 === 1 && weeks !== 11) return `${weeks} неделю назад`;
        if (weeks % 10 >= 2 && weeks % 10 <= 4 && (weeks % 100 < 10 || weeks % 100 >= 20)) return `${weeks} недели назад`;
        return `${weeks} недель назад`;
      } else {
        // ⭐ ИЗМЕНЕНО: Для старых дат показываем точное время (дата + время)
        const dateStr = date.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return `${dateStr} в ${timeStr}`;
      }
    } catch (error) {
      return 'недавно';
    }
  };

  const routeParams = route?.params ?? {};
  const user = routeParams.user ?? null;
  const isGroup = routeParams.isGroup ?? false;

  useEffect(() => {
    if (!user) {
      navigation?.goBack?.();
    }
  }, [user, navigation, routeParams]);

  // � Очистка старого кэша видеокружков при монтировании
  useEffect(() => {
    cleanOldCache(); // Очистка медиа-кэша
    cleanOldMessageCache(); // Очистка кэша сообщений
  }, []);

  // �🆕 НОВОЕ: Обработка focusInput из уведомления
  useEffect(() => {
    const { focusInput } = routeParams;
    if (focusInput && newMessageInputRef.current) {
      setTimeout(() => {
        newMessageInputRef.current?.focus();
      }, 300);
    }
  }, [routeParams]);

  // 🔧 Сброс статуса печатания при входе на страницу чата
  useEffect(() => {
    // Сбрасываем статус при входе
    setIsUserTyping(false);
    
    return () => {
      // Очищаем таймауты при выходе
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (typingResetTimeoutRef.current) {
        clearTimeout(typingResetTimeoutRef.current);
      }
    };
  }, [user?.id]); // Только когда меняется чат

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: '#999', padding: 24, textAlign: 'center' }}>
          Не удалось открыть чат: отсутствуют данные пользователя.
        </Text>
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#667eea', borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Назад</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  const displayName = (user.username || user.name || 'Группа').toString();
  const displayAvatar = user.avatar || null;
  const displayInitial = displayName?.[0]?.toUpperCase?.() || 'G';

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const profileModalHandlersRef = useRef(null);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [contactOnline, setContactOnline] = useState(() => {
    if (isGroup) {
      return true;
    }
    if (typeof user?.is_online === 'boolean') {
      return user.is_online;
    }
    return true;
  });
  const [lastSeenTime, setLastSeenTime] = useState(user?.last_seen || null);
  const [isUserActive, setIsUserActive] = useState(true);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [pinVisibilityModalVisible, setPinVisibilityModalVisible] = useState(false);
  const [pendingPinMessageId, setPendingPinMessageId] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [groupMembers, setGroupMembers] = useState(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addMembersModalVisible, setAddMembersModalVisible] = useState(false);
  const [availableMembers, setAvailableMembers] = useState([]);
  const [addMembersLoading, setAddMembersLoading] = useState(false);
  const [addMembersQuery, setAddMembersQuery] = useState('');
  const [addingMemberId, setAddingMemberId] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const typingResetTimeoutRef = useRef(null);
  const flatListRef = useRef(null);
  const insets = useSafeAreaInsets();
  const newMessageInputRef = useRef(null); // 🆕 Ref для TextInput сообщения
  const isInitialScrollDone = useRef(false); // 🆕 Флаг для мгновенного скролла при первом открытии
  
  // ⚡ ПАГИНАЦИЯ СООБЩЕНИЙ: Загружаем только последние 50 сообщений
  const [messagesPage, setMessagesPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const MESSAGES_PER_PAGE = 50;
  
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  
  const [friendStatus, setFriendStatus] = useState('unknown'); // 'friend', 'pending', 'none', 'unknown'
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [callModalVisible, setCallModalVisible] = useState(false);
  const [callStatus, setCallStatus] = useState('idle'); // 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'cancelled'
  const [callType, setCallType] = useState('audio'); // 'audio' | 'video'
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingCallModalVisible, setIncomingCallModalVisible] = useState(false);
  const [currentCallId, setCurrentCallId] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [voiceRecorderModalVisible, setVoiceRecorderModalVisible] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordingDuration, setVoiceRecordingDuration] = useState(0);
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [chatBackground, setChatBackground] = useState('default');
  const [backgroundModalVisible, setBackgroundModalVisible] = useState(false);
  const [customBackgroundImage, setCustomBackgroundImage] = useState(null);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const voiceRecordingIntervalRef = useRef(null);
  const isProcessingVoiceRef = useRef(false);
  const callTimerRef = useRef(null);
  const callTimeoutsRef = useRef([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Анимация пульсации статуса участников
  const memberStatusPulse = useRef(new Animated.Value(1)).current;

  // Состояние для модали подписи к медиа
  const [mediaCaptionModalVisible, setMediaCaptionModalVisible] = useState(false);
  const [pendingMediaUri, setPendingMediaUri] = useState(null);
  const [pendingMediaType, setPendingMediaType] = useState(null);
  
  // Состояние для отслеживания загрузки медиа
  const [mediaUploadProgress, setMediaUploadProgress] = useState(null); // { uri, progress: 0-100, speed: 'XXX KB/s', timeRemaining: 'XX s', type: 'image'|'video' }
  const [groupAvatarUpdating, setGroupAvatarUpdating] = useState(false);
  const [uploadingMediaUri, setUploadingMediaUri] = useState(null);
  
  // Состояние для полноэкранного просмотра фото
  const [fullscreenPhotoVisible, setFullscreenPhotoVisible] = useState(false);
  const [selectedPhotoUri, setSelectedPhotoUri] = useState(null);
  
  // ✏️ РЕДАКТИРОВАНИЕ СООБЩЕНИЯ
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editingText, setEditingText] = useState('');
  
  // 🎥 ОШИБКИ ЗАГРУЗКИ ВИДЕО
  const [videoLoadErrors, setVideoLoadErrors] = useState({});
  
  // 🎬 ВИДЕОКРУЖКИ
  const [videoCircleRecorderVisible, setVideoCircleRecorderVisible] = useState(false);
  const [activeVideoCircleId, setActiveVideoCircleId] = useState(null); // ID текущего играющего кружка
  
  // 📤 ПЕРЕСЫЛКА СООБЩЕНИЙ
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [forwardRecipients, setForwardRecipients] = useState([]);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [forwardLoading, setForwardLoading] = useState(false);
  
  // 🖼️ МЕДИА В ПРОФИЛЕ
  const [mediaTab, setMediaTab] = useState('photos'); // 'photos', 'videos', 'links', 'voice'
  const [profileMediaLoading, setProfileMediaLoading] = useState(false);
  const [profileMedia, setProfileMedia] = useState({
    photos: [],
    videos: [],
    links: [],
    voice: []
  });
  
  // 🎬 ПРОСМОТР ВИДЕО
  const [videoPlayerVisible, setVideoPlayerVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoDurations, setVideoDurations] = useState({}); // Хранит длительность видео по ID

  useEffect(() => {
    if (!isGroup && typeof user?.is_online === 'boolean') {
      setContactOnline(user.is_online);
      if (user?.last_seen) {
        setLastSeenTime(user.last_seen);
      }
    }
  }, [isGroup, user?.is_online, user?.last_seen]);

  const clearCallTimers = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (Array.isArray(callTimeoutsRef.current)) {
      callTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    }
    callTimeoutsRef.current = [];
  }, []);

  const scheduleCallTimeout = useCallback((callback, delay) => {
    const timeoutId = setTimeout(() => {
      callback();
      callTimeoutsRef.current = callTimeoutsRef.current.filter(id => id !== timeoutId);
    }, delay);
    callTimeoutsRef.current = [...callTimeoutsRef.current, timeoutId];
    return timeoutId;
  }, []);

  const formatCallDuration = useCallback((totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, []);

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
      const bg = data.chat_background || 'default';
      setChatBackground(bg);
      
      // Если фон кастомный - загружаем изображение
      if (bg === 'custom') {
        await loadCustomBackground();
      }
    } catch (err) {
      setChatBackground('default');
    }
  };

  // Функция для загрузки кастомного изображения
  const loadCustomBackground = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch('http://151.247.196.66:3001/api/user/chat-background/image', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success && data.image) {
        if (data.image.startsWith('data:')) {
          setCustomBackgroundImage(data.image);
        } else {
          setCustomBackgroundImage(`data:image/jpeg;base64,${data.image}`);
        }
      }
    } catch (err) {
      console.log('Кастомный фон не найден или ошибка загрузки');
    }
  };

  // Выбор предустановленного фона
  const selectBackground = async (backgroundType) => {
    setBackgroundLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch('http://151.247.196.66:3001/api/user/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ chat_background: backgroundType })
      });
      
      setChatBackground(backgroundType);
      setCustomBackgroundImage(null);
      setBackgroundModalVisible(false);
    } catch (err) {
      error('Ошибка', 'Не удалось сменить фон');
    } finally {
      setBackgroundLoading(false);
    }
  };

  // Выбор кастомного изображения из галереи
  const pickCustomBackground = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      warning('Ошибка', 'Нужно разрешение для доступа к галерее');
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
        
        const response = await fetch('http://151.247.196.66:3001/api/user/chat-background/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ image: base64Image })
        });
        
        const data = await response.json();
        
        if (data.success) {
          setChatBackground('custom');
          setCustomBackgroundImage(base64Image);
          setBackgroundModalVisible(false);
        } else {
          error('Ошибка', data.error || 'Не удалось загрузить изображение');
        }
      } catch (err) {
        error('Ошибка', 'Не удалось загрузить изображение');
      } finally {
        setBackgroundLoading(false);
      }
    }
  };

  // Сброс фона на стандартный
  const resetBackground = async () => {
    setBackgroundLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch('http://151.247.196.66:3001/api/user/chat-background', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setChatBackground('default');
      setCustomBackgroundImage(null);
      setBackgroundModalVisible(false);
    } catch (err) {
      error('Ошибка', 'Не удалось сбросить фон');
    } finally {
      setBackgroundLoading(false);
    }
  };

  useEffect(() => {
    // Анимация контейнера при появлении/исчезновении клавиатуры
    let keyboardShowSubscription;
    let keyboardHideSubscription;

    const onKeyboardShow = (e) => {
      const kb = (e && e.endCoordinates && e.endCoordinates.height) || 0;
      setKeyboardHeight(kb);
      setKeyboardVisible(true);
    };

    const onKeyboardHide = () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    };

    if (Platform.OS === 'android') {
      keyboardShowSubscription = Keyboard.addListener('keyboardDidShow', onKeyboardShow);
      keyboardHideSubscription = Keyboard.addListener('keyboardDidHide', onKeyboardHide);
    } else {
      keyboardShowSubscription = Keyboard.addListener('keyboardWillShow', onKeyboardShow);
      keyboardHideSubscription = Keyboard.addListener('keyboardWillHide', onKeyboardHide);
    }

    return () => {
      keyboardShowSubscription?.remove();
      keyboardHideSubscription?.remove();
    };
  }, []);

  // Анимация пульса для индикатора записи голоса
  useEffect(() => {
    if (isRecordingVoice) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecordingVoice, pulseAnim]);

  const normalizeGroupMember = useCallback((member) => ({
    id: member.id,
    username: (member.username || member.name || 'Пользователь').toString(),
    avatar: member.avatar || null,
    role: member.role || 'member',
    is_online: !!member.is_online,
  }), []);

  const fetchGroupMembers = useCallback(async ({ silent = false, skipSpinner = false } = {}) => {
    if (!isGroup) return [];
    if (!skipSpinner) setMembersLoading(true);
    try {
      const response = await groupAPI.getGroupMembers(user.id);
      const membersArray = Array.isArray(response.data) ? response.data : [];
      const normalized = membersArray
        .filter(item => item && typeof item === 'object')
        .map(normalizeGroupMember);
      setGroupMembers(normalized);
      return normalized;
    } catch (err) {
      if (!silent) {
        error('Ошибка', 'Не удалось загрузить участников группы');
      }
      return [];
    } finally {
      if (!skipSpinner) setMembersLoading(false);
    }
  }, [error, isGroup, normalizeGroupMember, user.id]);

  useEffect(() => {
    if (isGroup) {
      fetchGroupMembers({ silent: true, skipSpinner: true });
    }
  }, [fetchGroupMembers, isGroup]);

  const memberCount = isGroup
    ? (Array.isArray(groupMembers) && groupMembers.length > 0 ? groupMembers.length : (user.member_count || 0))
    : 0;

  const refreshGroupMembers = useCallback(() => {
    fetchGroupMembers({ silent: true });
  }, [fetchGroupMembers]);

  const refreshGroupMembersStatus = useCallback(async () => {
    if (!isGroup || !user?.id) return;
    try {
      // Используем существующий endpoint для загрузки участников с их статусом
      const response = await groupAPI.getGroupMembers(user.id);
      const membersArray = Array.isArray(response.data) ? response.data : [];
      const normalized = membersArray
        .filter(item => item && typeof item === 'object')
        .map(normalizeGroupMember);

      // Обновляем состояние с актуальными данными статуса
      setGroupMembers(normalized);
    } catch (err) {
    }
  }, [isGroup, user?.id, normalizeGroupMember]);

  const toggleNotifications = useCallback(async (value) => {
    setNotificationsEnabled(value);
    try {
      const currentSettings = await NotificationSettings.getSettings();
      await NotificationSettings.updateSettings({
        ...currentSettings,
        messages: value,
      });
    } catch (err) {
      setNotificationsEnabled(prev => !prev);
    }
  }, []);

  const handleSendFriendRequest = useCallback(async () => {
    if (friendStatus !== 'none' || !user?.id) return;
    setFriendRequestLoading(true);
    try {
      await friendAPI.sendFriendRequest(user.id);
      setFriendStatus('pending');
      info('Заявка отправлена', 'Пользователь получит уведомление о вашей заявке.');
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Не удалось отправить заявку. Попробуйте позже.';
      error('Ошибка', errorMessage);
    } finally {
      setFriendRequestLoading(false);
    }
  }, [error, friendStatus, info, user?.id]);

  const openUserProfileScreen = useCallback(async () => {
    if (!user) return;
    setShowProfileModal(false);
    
    try {
      // 📌 Загружаем полные данные пользователя для получения cardColor
      const response = await profileAPI.getUserProfile(user.id);
      const enrichedUser = {
        ...user,
        ...response.data,
        cardColor: response.data?.cardColor || user.cardColor || '#FF6B6B',
      };
      navigation.navigate('UserProfile', { user: enrichedUser });
    } catch (err) {
      // Fallback - используем текущие данные
      const userWithFallbackColor = { ...user, cardColor: user.cardColor || '#FF6B6B' };
      navigation.navigate('UserProfile', { user: userWithFallbackColor });
    }
  }, [navigation, user]);

  const openAddMembersModal = useCallback(async () => {
    if (!isGroup) return;
    setAddMembersModalVisible(true);
    setAddMembersQuery('');
    setAddMembersLoading(true);
    try {
      const currentMembers = await fetchGroupMembers({ silent: true, skipSpinner: true });
      const memberIds = new Set(currentMembers.map(member => member.id));
      const friendsResponse = await friendAPI.getFriends();
      const rawFriends = Array.isArray(friendsResponse.data) ? friendsResponse.data : [];
      const normalizedFriends = rawFriends
        .filter(friend => friend && typeof friend === 'object')
        .map(friend => ({
          id: friend.id,
          username: (friend.username || friend.name || 'Пользователь').toString(),
          avatar: friend.avatar || null,
          status: friend.status || 'accepted',
        }))
        .filter(friend => friend.status === 'accepted' && !memberIds.has(friend.id));
      setAvailableMembers(normalizedFriends);
    } catch (err) {
      error('Ошибка', 'Не удалось загрузить список друзей для добавления.');
    } finally {
      setAddMembersLoading(false);
    }
  }, [error, fetchGroupMembers, isGroup]);

  const closeAddMembersModal = useCallback(() => {
    setAddMembersModalVisible(false);
    setAvailableMembers([]);
    setAddMembersQuery('');
  }, []);

  const handleAddMember = useCallback(async (candidate) => {
    if (!candidate || addingMemberId) return;
    setAddingMemberId(candidate.id);
    try {
      await groupAPI.addGroupMember(user.id, candidate.id);
      setGroupMembers(prev => {
        const prevList = Array.isArray(prev) ? prev : [];
        if (prevList.some(member => member.id === candidate.id)) return prevList;
        return [...prevList, { ...candidate, role: 'member' }];
      });
      setAvailableMembers(prev => prev.filter(item => item.id !== candidate.id));
    } catch (err) {
      error('Ошибка', 'Не удалось добавить участника. Попробуйте позже.');
    } finally {
      setAddingMemberId(null);
    }
  }, [addingMemberId, error, user.id]);

  const handleRemoveMember = useCallback(async (memberId, memberName) => {
    info(
      'Удалить участника?',
      `Вы уверены, что хотите удалить ${memberName} из группы?`,
      {
        buttons: [
          { text: 'Отмена', color: '#ccc' },
          {
            text: 'Удалить',
            color: '#FF6B6B',
            onPress: async () => {
              try {
                await groupAPI.removeGroupMember(user.id, memberId);
                setGroupMembers(prev => 
                  Array.isArray(prev) 
                    ? prev.filter(member => member.id !== memberId)
                    : []
                );
                success('Готово', `${memberName} удален из группы`);
              } catch (err) {
                error('Ошибка', 'Не удалось удалить участника. Попробуйте позже.');
              }
            }
          }
        ],
        autoClose: false
      }
    );
  }, [info, error, success, user.id]);

  const updateMemberOnlineStatus = useCallback((memberId, isOnline) => {
    setGroupMembers(prev => {
      if (!Array.isArray(prev)) return prev;
      return prev.map(member => 
        member.id === memberId 
          ? { ...member, is_online: isOnline }
          : member
      );
    });
    
    // Пульсирующий эффект при изменении статуса
    memberStatusPulse.setValue(0.7);
    Animated.timing(memberStatusPulse, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [memberStatusPulse]);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  // useEffect для управления Socket обработчиками при открытии/закрытии профиля группы
  useEffect(() => {
    if (!isGroup || !socket || !showProfileModal) {
      // Очищаем обработчики когда профиль закрыт или это не группа
      if (profileModalHandlersRef.current) {
        profileModalHandlersRef.current.forEach(unsub => {
          try {
            unsub && unsub();
          } catch (e) {
          }
        });
        profileModalHandlersRef.current = null;
      }
      return;
    }

    // Регистрируем обработчики для обновления статуса участников
    const handlers = [];

    try {
      const handleGroupMemberStatusChange = (data) => {
        const memberId = data?.user_id || data?.id;
        const isOnline = data?.is_online !== false && data?.status !== 'offline';
        
        if (memberId) {
          updateMemberOnlineStatus(memberId, isOnline);
        }
      };

      const handleUserOnlineInGroup = (data) => {
        const memberId = data?.user_id || data?.id;
        if (memberId) {
          updateMemberOnlineStatus(memberId, true);
        }
      };

      const handleUserOfflineInGroup = (data) => {
        const memberId = data?.user_id || data?.id;
        if (memberId) {
          updateMemberOnlineStatus(memberId, false);
        }
      };

      // Регистрируем обработчики
      socket.on('user_status_changed', handleGroupMemberStatusChange);
      socket.on('user_online', handleUserOnlineInGroup);
      socket.on('user_offline', handleUserOfflineInGroup);
      socket.on('group_member_status_updated', handleGroupMemberStatusChange);

      handlers.push(() => socket.off('user_status_changed', handleGroupMemberStatusChange));
      handlers.push(() => socket.off('user_online', handleUserOnlineInGroup));
      handlers.push(() => socket.off('user_offline', handleUserOfflineInGroup));
      handlers.push(() => socket.off('group_member_status_updated', handleGroupMemberStatusChange));

      profileModalHandlersRef.current = handlers;

      // Запрашиваем актуальный статус членов группы при открытии профиля
      if (isGroup) {
        // Сразу загружаем статус из API
        refreshGroupMembersStatus();
        
        // Отправляем запрос статуса на сервер через Socket
        socket.emit('request_group_members_status', { group_id: user.id });
      }
    } catch (error) {
    }

    return () => {
      handlers.forEach(unsub => {
        try {
          unsub && unsub();
        } catch (e) {
        }
      });
      profileModalHandlersRef.current = null;
    };
  }, [isGroup, socket, showProfileModal, updateMemberOnlineStatus, refreshGroupMembersStatus, user.id]);

  useEffect(() => {
    const loadNotificationPreference = async () => {
      setNotificationsLoading(true);
      try {
        const settings = await NotificationSettings.getSettings();
        setNotificationsEnabled(settings.messages !== false);
      } catch (err) {
      } finally {
        setNotificationsLoading(false);
      }
    };

    loadNotificationPreference();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadFriendStatus = async () => {
      if (isGroup || !user?.id) {
        if (isMounted) setFriendStatus('none');
        return;
      }

      try {
        const response = await friendAPI.getFriends();
        const friendsList = Array.isArray(response.data) ? response.data : [];
        const matched = friendsList.find(item => String(item.id) === String(user.id));
        if (!isMounted) return;
        if (!matched) {
          setFriendStatus('none');
        } else if (matched.status === 'accepted') {
          setFriendStatus('friend');
        } else {
          setFriendStatus('pending');
        }
      } catch (err) {
        if (isMounted) setFriendStatus('none');
      }
    };

    loadFriendStatus();
    return () => {
      isMounted = false;
    };
  }, [isGroup, user?.id]);

  useEffect(() => {
    if (!isGroup) {
      if (typeof user?.is_online === 'boolean') {
        setContactOnline(user.is_online);
      }
    }
  }, [isGroup, user?.is_online]);

  useEffect(() => {
    // ✅ ИСПРАВЛЕНИЕ: Отслеживаем фокус экрана и устанавливаем активный чат
    const { setActiveChatContext, clearActiveChatContext } = require('../services/notifications');
    
    const unsubscribe = navigation.addListener('focus', () => {
      setIsUserActive(true);
      // 📍 Устанавливаем этот чат как активный для подавления уведомлений
      setActiveChatContext(user.id, isGroup ? 'group' : 'personal');
      
      // 🆕 ОТПРАВЛЯЕМ НА СЕРВЕР информацию об активном чате
      (async () => {
        try {
          const { getOrCreateSocket } = require('../services/globalSocket');
          const socketInstance = await getOrCreateSocket();
          if (socketInstance && socketInstance.connected) {
            console.log('\n' + '='.repeat(70));
            console.log('📍 ОТПРАВЛЯЕМ SET_ACTIVE_CHAT');
            console.log(`   Chat ID: ${user.id}`);
            console.log(`   Chat Type: ${isGroup ? 'group' : 'personal'}`);
            console.log('='.repeat(70));
            
            socketInstance.emit('set_active_chat', {
              chat_id: user.id,
              chat_type: isGroup ? 'group' : 'personal',
              timestamp: new Date().toISOString()
            });
          } else {
            console.log('⚠️ Socket не подключен, set_active_chat не отправлен');
          }
        } catch (err) {
          console.error('❌ Ошибка при отправке set_active_chat:', err);
        }
      })();
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      setIsUserActive(false);
      // ❌ Очищаем активный чат при выходе
      clearActiveChatContext();
      
      // 🆕 ОТПРАВЛЯЕМ НА СЕРВЕР что вышли из чата
      (async () => {
        try {
          const { getOrCreateSocket } = require('../services/globalSocket');
          const socketInstance = await getOrCreateSocket();
          if (socketInstance && socketInstance.connected) {
            console.log('\n' + '='.repeat(70));
            console.log('📍 ОТПРАВЛЯЕМ CLEAR_ACTIVE_CHAT');
            console.log('   Пользователь вышел из чата');
            console.log('='.repeat(70));
            
            socketInstance.emit('clear_active_chat', {
              timestamp: new Date().toISOString()
            });
          } else {
            console.log('⚠️ Socket не подключен, clear_active_chat не отправлен');
          }
        } catch (err) {
          console.error('❌ Ошибка при отправке clear_active_chat:', err);
        }
      })();
    });

    return () => {
      unsubscribe?.();
      unsubscribeBlur?.();
      clearActiveChatContext(); // Очищаем при размонтировании
    };
  }, [navigation, user.id, isGroup]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    // ⚡ ОПТИМИЗАЦИЯ: Загружаем ВСЕ данные параллельно вместо последовательной загрузки
    const initializeChatData = async () => {
      try {
        // Вызываем все запросы одновременно (Promise.all для параллелизма)
        const promises = [
          loadMessages(),
          loadPinnedMessages(),
          loadUnreadCount(),
        ];

        // Добавляем getUserStatus только для личных чатов
        if (!isGroup) {
          promises.push(
            userAPI.getUserStatus(user.id)
              .then(response => {
                setContactOnline(response.data?.is_online ?? true);
                if (response.data?.last_seen) {
                  setLastSeenTime(response.data.last_seen);
                }
              })
              .catch(err => {
                if (err.response?.status === 404) {
                  setContactOnline(true);
                }
              })
          );
        }

        // Ждём ПЕРВЫЙ ответ - загрузка сообщений САМАЯ КРИТИЧНАЯ
        // Остальные будут завершены параллельно
        await Promise.race([promises[0]]);
        
      } catch (error) {
        if (__DEV__) console.error('Ошибка при инициализации данных чата:', error);
      }
    };

    // Запускаем инициализацию
    initializeChatData();

    const visitKey = isGroup ? `group_visit_${user.id}` : `chat_visit_${user.id}`;
    AsyncStorage.setItem(visitKey, new Date().toISOString()).catch(err => {
    });

    let isMounted = true;
    let socketConnection = null;
    const detachments = [];

    const registerHandler = (event, handler) => {
      if (!socketConnection) return;
      socketConnection.on(event, handler);
      detachments.push(() => socketConnection.off(event, handler));
    };

    const initializeSocket = async () => {
      try {
        const sharedSocket = await getOrCreateSocket();
        if (!isMounted) return;

        socketConnection = sharedSocket;
        setSocket(sharedSocket);

        const handleConnect = () => {
          console.log('\n' + '🔌'.repeat(35));
          console.log('✅ [SOCKET] Подключение установлено!');
          console.log('   Socket ID:', sharedSocket.id);
          console.log('   Connected:', sharedSocket.connected);
          console.log('   Текущий пользователь:', currentUser?.id);
          console.log('   Чат с:', user.id, isGroup ? '(группа)' : '(личный)');
          console.log('🔌'.repeat(35) + '\n');
          
          // 🔑 КРИТИЧНО: Первый шаг - аутентификация
          if (currentUser?.id) {
            sharedSocket.emit('authenticate_socket', { user_id: currentUser.id });
            
            // Отправляем статус "онлайн" для текущего пользователя
            sharedSocket.emit('user_status', { 
              user_id: currentUser.id, 
              is_online: true,
              timestamp: new Date().toISOString()
            });
          }

          // 🔑 КРИТИЧНО: Второй шаг - присоединяемся к комнате ПОСЛЕ аутентификации
          // ⏰ Небольшая задержка чтобы убедиться что аутентификация обработана
          setTimeout(() => {
            if (isGroup) {
              sharedSocket.emit('join_group_room', user.id);
              console.log('✅ Присоединились к групповой комнате:', user.id);
            } else {
              // ✅ КРИТИЧНОЕ: Присоединяемся к НЕСКОЛЬКИМ комнатам для личного чата
              
              // 1. Комната для получения сообщений ОТ собеседника
              sharedSocket.emit('join_personal_room', user.id);
              console.log('✅ Присоединились к комнате собеседника:', user.id);
              
              // 2. Подписываемся на статус собеседника
              sharedSocket.emit('subscribe_user_status', user.id);
              
              // 3. ⭐ НОВОЕ: Подписываемся на события чтения для этого чата
              sharedSocket.emit('subscribe_read_status', {
                user_id: currentUser?.id,
                other_user_id: user.id,
                chat_type: 'personal'
              });
              console.log('✅ Подписались на события чтения для чата:', user.id);
            }
          }, 100); // Задержка 100ms для гарантии обработки аутентификации
          
          // ✅ Отправляем серверу что пользователь открыл чат
          sharedSocket.emit('set_active_chat', {
            chat_id: user.id,
            chat_type: isGroup ? 'group' : 'personal',
            timestamp: new Date().toISOString()
          });
        };

        const handleDisconnect = () => {
          
          // ✅ Очищаем активный чат при отключении
          if (currentUser?.id) {
            try {
              socketConnection.emit('clear_active_chat');
            } catch (err) {
            }
          }
          
          // Отправляем статус "офлайн" перед отключением
          if (currentUser?.id) {
            try {
              socketConnection.emit('user_status', { 
                user_id: currentUser.id, 
                is_online: false,
                timestamp: new Date().toISOString()
              });
            } catch (err) {
            }
          }
        };

        registerHandler('connect', handleConnect);
        registerHandler('disconnect', handleDisconnect);

        const extractUserId = (payload) => {
          if (payload === undefined || payload === null) return undefined;
          if (typeof payload === 'object') {
            return payload.userId ?? payload.user_id ?? payload.id;
          }
          return payload;
        };

        const resolveStatus = (payload, fallback) => {
          if (typeof fallback === 'boolean') return fallback;
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

        const handleStatusEvent = (payload, fallback) => {
          if (isGroup) {
            return;
          }
          const targetId = extractUserId(payload);
          if (targetId === undefined || String(targetId) !== String(user.id)) {
            return;
          }
          const statusValue = resolveStatus(payload, fallback);
          if (typeof statusValue === 'boolean') {
            setContactOnline(statusValue);
            
            // Если пользователь перешел в оффлайн, сохраняем время последнего визита
            if (!statusValue && payload.timestamp) {
              setLastSeenTime(payload.timestamp);
            }
          }
        };

        const handleUserStatusChanged = (data) => handleStatusEvent(data);
        const handleUserStatusUpdated = (data) => handleStatusEvent(data);
        const handleUserOnline = (data) => handleStatusEvent(data, true);
        const handleUserOffline = (data) => handleStatusEvent(data, false);

        // ⭐ НОВЫЙ ОБРАБОТЧИК: Обновление last_seen в реальном времени
        const handleUserLastSeenUpdated = (data) => {
          if (isGroup) {
            return;
          }
          
          const targetId = data?.user_id;
          if (targetId === undefined || String(targetId) !== String(user.id)) {
            return;
          }
          
          if (data?.timestamp) {
            setLastSeenTime(data.timestamp);
          }
        };

        registerHandler('user_status_changed', handleUserStatusChanged);
        registerHandler('user_status_updated', handleUserStatusUpdated);
        registerHandler('user_online', handleUserOnline);
        registerHandler('user_offline', handleUserOffline);
        registerHandler('user_last_seen_updated', handleUserLastSeenUpdated); // ⭐ НОВОЕ

        // Обработчик для обновления статуса членов группы
        if (isGroup) {
          const handleGroupMemberOnline = (data) => {
            const memberId = data?.user_id || data?.id;
            if (memberId) {
              updateMemberOnlineStatus(memberId, true);
            }
          };

          const handleGroupMemberOffline = (data) => {
            const memberId = data?.user_id || data?.id;
            if (memberId) {
              updateMemberOnlineStatus(memberId, false);
            }
          };

          registerHandler('group_member_online', handleGroupMemberOnline);
          registerHandler('group_member_offline', handleGroupMemberOffline);
        }

        const handleNewMessage = (message) => {

          let isForThisChat = false;
          if (isGroup) {
            // ✅ ИСПРАВЛЕНО: Приводим к числу для корректного сравнения
            isForThisChat = Number(message.group_id) === Number(user.id);
          } else {
            isForThisChat =
              (Number(message.sender_id) === Number(user.id) && Number(message.receiver_id) === Number(currentUser.id)) ||
              (Number(message.sender_id) === Number(currentUser.id) && Number(message.receiver_id) === Number(user.id));
          }

          if (isForThisChat) {
            setMessages(prev => {
              // ⭐ Исправляем IP в URL перед добавлением сообщения
              const normalizedMessage = normalizeMessageMediaUrl(message);
              
              // ⭐ УЛУЧШЕННАЯ ПРОВЕРКА: учитываем временные ID (temp-*)
              const exists = prev.some(msg => {
                // Если это date separator - пропускаем
                if (msg.type === 'date') return false;
                // Если это временное сообщение - не проверяем на совпадение по ID
                if (msg.id && typeof msg.id === 'string' && msg.id.startsWith('temp-')) {
                  return false;
                }
                return msg.id === normalizedMessage.id;
              });
              
              if (exists) {
                return prev;
              }
              
              // Если это наше отправленное сообщение, заменяем временное ID на реальный
              if (normalizedMessage.sender_id === currentUser?.id) {
                return prev.map(msg => {
                  // Пропускаем date separators
                  if (msg.type === 'date') return msg;
                  // Ищем временное сообщение для замены
                  if (msg.id && typeof msg.id === 'string' && msg.id.startsWith('temp-') && 
                      msg.message === normalizedMessage.message &&
                      msg.created_at && normalizedMessage.created_at &&
                      Math.abs(new Date(msg.created_at).getTime() - new Date(normalizedMessage.created_at).getTime()) < 5000) {
                    // Это наше сообщение с временным ID - заменяем на реальное
                    return normalizedMessage;
                  }
                  return msg;
                });
              }

              if (normalizedMessage.sender_id !== currentUser.id) {
                const senderName = isGroup ? (normalizedMessage.sender_username || displayName) : displayName;
                const template = NotificationTemplates.newMessage(senderName, normalizedMessage.message);
                showNotificationIfEnabled(template, {
                  chatId: user.id,
                  messageId: normalizedMessage.id,
                  isGroup
                });
                setTimeout(() => scrollToBottom(), 100);
                
                // Отмечаем входящее сообщение как прочитанное
                if (!isGroup) {
                  markMessageAsRead(normalizedMessage.id);
                }
              }

              return [...prev, normalizedMessage];
            });
          } else {
          }
        };

        // ✅ ИСПРАВЛЕНИЕ: Регистрируем ОБА обработчика ВСЕГДА
        registerHandler('new_group_message', handleNewMessage);
        registerHandler('new_message', handleNewMessage);

        if (!isGroup) {
          const handleTyping = (data) => {
            // ✅ КРИТИЧНО: Проверяем что событие ОТ собеседника в ЭТОМ чате
            if (data.from_user_id !== user.id) {
              return;
            }
            
            
            if (data.is_typing) {
              setIsUserTyping(true);
              // Очищаем предыдущий таймаут сброса если он был
              if (typingResetTimeoutRef.current) {
                clearTimeout(typingResetTimeoutRef.current);
              }
              // Устанавливаем таймаут для автоматического сброса статуса через 5 секунд
              typingResetTimeoutRef.current = setTimeout(() => {
                setIsUserTyping(false);
              }, 5000);
            } else {
              setIsUserTyping(false);
              if (typingResetTimeoutRef.current) {
                clearTimeout(typingResetTimeoutRef.current);
              }
            }
          };
          registerHandler('user_typing', handleTyping);
        } else {
          const handleGroupTyping = (data) => {
            if (data.group_id === user.id && data.user_id !== currentUser?.id) {
              if (data.is_typing) {
                setIsUserTyping(true);
                // Очищаем предыдущий таймаут сброса если он был
                if (typingResetTimeoutRef.current) {
                  clearTimeout(typingResetTimeoutRef.current);
                }
                // Устанавливаем таймаут для автоматического сброса статуса через 5 секунд
                typingResetTimeoutRef.current = setTimeout(() => {
                  setIsUserTyping(false);
                }, 5000);
              } else {
                setIsUserTyping(false);
                if (typingResetTimeoutRef.current) {
                  clearTimeout(typingResetTimeoutRef.current);
                }
              }
            }
          };
          registerHandler('group_user_typing', handleGroupTyping);
        }

        if (!isGroup) {
          const handleIncomingCall = (data) => {
            if (data.receiver_id === currentUser?.id && data.caller_id !== currentUser?.id) {
              setIncomingCall(data);
              setIncomingCallModalVisible(true);
            } else if (data.caller_id === currentUser?.id) {
              setCurrentCallId(data.call_id);
              setCallStatus('ringing');
            }
          };

          const handleCallResponse = (data) => {
            if (data.status === 'accepted') {
              setCallStatus('connected');
            } else if (data.status === 'rejected') {
              setCallStatus('ended');
              setIncomingCallModalVisible(false);
            }
          };

          const handleCallEnded = (data) => {
            setCallStatus('ended');
            setIncomingCallModalVisible(false);
            if (data.duration) {
              const minutes = Math.floor(data.duration / 60);
              const seconds = data.duration % 60;
              success('Звонок завершен', `Длительность: ${minutes}м ${seconds}с`);
            }
          };

          registerHandler('incoming_call', handleIncomingCall);
          registerHandler('call_response', handleCallResponse);
          registerHandler('call_ended', handleCallEnded);
        }

        // ⭐ КРИТИЧНО: Регистрируем обработчик статуса чтения
        // Сначала удаляем старый слушатель (если был)
        sharedSocket.off('message_read_status_updated');

        // Регистрируем новый слушатель НАПРЯМУЮ на сокет
        sharedSocket.on('message_read_status_updated', (data) => {
          console.log('\n' + '🔔'.repeat(35));
          console.log('📨 [SOCKET] message_read_status_updated ПОЛУЧЕНО!');
          console.log('   Payload:', JSON.stringify(data, null, 2));
          console.log('🔔'.repeat(35) + '\n');
          
          handleMessageReadStatusUpdated(data);
        });

        // Также регистрируем через registerHandler для cleanup
        registerHandler('message_read_status_updated', handleMessageReadStatusUpdated);

        console.log('✅ Слушатель message_read_status_updated зарегистрирован');

        // 📌 НОВОЕ: Обработчик синхронизации закреплённых сообщений
        const handleMessagePinned = (data) => {
          const { message_id, is_pinned, pinned_by_user_id, initiator_id } = data;
          
          // Проверяем что это событие для нашего чата
          let isForThisChat = false;
          if (!isGroup) {
            // Для личного чата - проверяем что это между нами
            isForThisChat = 
              (initiator_id === currentUser?.id && data.other_user_id === user.id) ||
              (initiator_id === user.id && data.other_user_id === currentUser?.id) ||
              (pinned_by_user_id === currentUser?.id) ||
              (pinned_by_user_id === user.id);
          } else {
            // Для группы
            isForThisChat = data.group_id === user.id;
          }
          
          if (!isForThisChat) {
            return;
          }
          
          // Обновляем pinnedMessages
          setPinnedMessages(prev => {
            const updated = [...prev];
            if (is_pinned && !updated.includes(message_id)) {
              updated.push(message_id);
            } else if (!is_pinned) {
              const idx = updated.indexOf(message_id);
              if (idx > -1) {
                updated.splice(idx, 1);
              }
            }
            return updated;
          });
        };
        
        registerHandler('message_pinned', handleMessagePinned);

        // ✅ ОБРАБОТЧИК: Получение событий закрепления/открепления сообщений
        const handleMessagePinToggle = (data) => {
          console.log('📌 [DEBUG] Получено событие message_pin_toggle:', data);
          
          const { message_id, is_pinned, chat_type } = data;
          
          // Обновляем pinnedMessages в зависимости от типа чата
          if (chat_type === 'personal') {
            // Для личного чата обновляем pinnedMessages стейт
            setPinnedMessages(prevPinned => {
              const newPinned = [...prevPinned];
              
              if (is_pinned) {
                // Добавляем в закрепленные
                if (!newPinned.includes(message_id)) {
                  newPinned.push(message_id);
                  console.log('📌 [DEBUG] Сообщение закреплено:', message_id);
                }
              } else {
                // Удаляем из закрепленных
                const idx = newPinned.indexOf(message_id);
                if (idx > -1) {
                  newPinned.splice(idx, 1);
                  console.log('📌 [DEBUG] Сообщение открепилось:', message_id);
                }
              }
              
              return newPinned;
            });
          } else if (chat_type === 'group') {
            // Для группового чата
            setPinnedMessages(prevPinned => {
              const newPinned = [...prevPinned];
              
              if (is_pinned) {
                if (!newPinned.includes(message_id)) {
                  newPinned.push(message_id);
                  console.log('📌 [DEBUG] Групповое сообщение закреплено:', message_id);
                }
              } else {
                const idx = newPinned.indexOf(message_id);
                if (idx > -1) {
                  newPinned.splice(idx, 1);
                  console.log('📌 [DEBUG] Групповое сообщение открепилось:', message_id);
                }
              }
              
              return newPinned;
            });
          }
        };
        
        registerHandler('message_pin_toggle', handleMessagePinToggle);

        // ✅ ОБРАБОТЧИК: Получение события удаления сообщения
        const handleMessageDeleted = (data) => {
          console.log('🗑️ [DEBUG] Получено событие message_deleted:', data);
          
          const { message_id, chat_type, other_user_id, group_id } = data;
          
          // ⭐ КРИТИЧНО: Проверяем что событие для нашего чата
          let isForThisChat = false;
          
          if (chat_type === 'group' && group_id) {
            isForThisChat = isGroup && Number(group_id) === Number(user.id);
          } else if (chat_type === 'personal' && other_user_id) {
            isForThisChat = !isGroup && Number(other_user_id) === Number(user.id);
          } else {
            // Fallback - пробуем удалить в любом случае
            isForThisChat = true;
          }
          
          if (!isForThisChat) {
            console.log('🗑️ [DEBUG] Событие НЕ для этого чата, пропускаем');
            return;
          }
          
          // ⭐ КРИТИЧНО: Используем функциональное обновление БЕЗ проверки messageExists
          // Проверка внутри setMessages гарантирует актуальные данные
          setMessages(prevMessages => {
            const messageExists = prevMessages.some(msg => msg.id === message_id);
            if (!messageExists) {
              console.log('🗑️ [DEBUG] Сообщение не найдено в текущем чате:', message_id);
              return prevMessages;
            }
            
            const filtered = prevMessages.filter(msg => msg.id !== message_id);
            console.log('🗑️ [DEBUG] Сообщение удалено:', message_id);
            return filtered;
          });
        };
        
        registerHandler('message_deleted', handleMessageDeleted);

        // ✏️ ОБРАБОТЧИК: Получение события редактирования сообщения
        const handleMessageUpdated = (data) => {
          console.log('✏️ [DEBUG] Получено событие message_updated:', data);
          
          const { message_id, new_message, chat_type, other_user_id, group_id } = data;
          
          // ⭐ КРИТИЧНО: Проверяем что событие для нашего чата
          let isForThisChat = false;
          
          if (chat_type === 'group' && group_id) {
            isForThisChat = isGroup && Number(group_id) === Number(user.id);
          } else if (chat_type === 'personal' && other_user_id) {
            isForThisChat = !isGroup && Number(other_user_id) === Number(user.id);
          } else {
            // Fallback - пробуем обновить в любом случае
            isForThisChat = true;
          }
          
          if (!isForThisChat) {
            console.log('✏️ [DEBUG] Событие НЕ для этого чата, пропускаем');
            return;
          }
          
          // ⭐ КРИТИЧНО: Используем функциональное обновление
          setMessages(prevMessages => {
            let found = false;
            const updated = prevMessages.map(msg => {
              if (msg.type === 'date') return msg;
              if (msg.id === message_id) {
                found = true;
                console.log('✏️ [DEBUG] Сообщение обновлено:', message_id);
                return { ...msg, message: new_message, is_edited: true };
              }
              return msg;
            });
            
            if (!found) {
              console.log('✏️ [DEBUG] Сообщение не найдено в текущем чате:', message_id);
            }
            
            return updated;
          });
        };
        
        registerHandler('message_updated', handleMessageUpdated);

        // 🆕 ОБРАБОТЧИК ОЧИСТКИ ЧАТА В РЕАЛЬНОМ ВРЕМЕНИ
        const handleChatCleared = (data) => {
          
          if (isGroup) {
            return;
          }
          
          // ✅ ИСПРАВЛЕНО: Проверяем что это чат между нами и отправителем события
          // data.initiatorId - тот кто нажал "очистить"
          // data.otherUserId - адресат (второй участник)
          // Событие придёт обоим, нам нужно очистить если это наш чат
          const isRelevantChat = 
            (data?.initiatorId === user.id && data?.otherUserId === currentUser?.id) ||
            (data?.otherUserId === user.id && data?.initiatorId === currentUser?.id) ||
            (data?.initiatorId === user.id) ||
            (data?.otherUserId === user.id);
          
          
          if (!isRelevantChat) {
            return;
          }
          
          setMessages([]);
        };
        
        registerHandler('chat_cleared', handleChatCleared);

        // � ДИАГНОСТИКА: Логируем ВСЕ Socket события для отладки
        if (__DEV__) {
          sharedSocket.onAny((eventName, ...args) => {
            // Фильтруем слишком частые события
            if (!['ping', 'pong', 'user_typing'].includes(eventName)) {
              console.log(`📨 [SOCKET EVENT] ${eventName}:`, JSON.stringify(args, null, 2).substring(0, 500));
            }
          });
          console.log('🔌 Socket подключен:', sharedSocket.connected);
          console.log('🔌 Socket id:', sharedSocket.id);
        }
      } catch (error) {
        console.error('❌ Ошибка initializeSocket:', error);
      }
    };

    initializeSocket();

    return () => {
      isMounted = false;
      // Очищаем таймауты печатания
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (typingResetTimeoutRef.current) {
        clearTimeout(typingResetTimeoutRef.current);
      }
      // Сбрасываем статус печатания при выходе из чата
      setIsUserTyping(false);
      if (socketConnection) {
        // ❌ УДАЛЕНО: Не отправляем user_status false при выходе из чата
        // Пользователь всё ещё онлайн (просто вернулся в ChatsListScreen)
        // Реальный офлайн определяется через disconnect события socket
        
        if (isGroup) {
          socketConnection.emit('leave_group', user.id);
        }
        detachments.forEach(unsub => unsub && unsub());
      }
    };
  }, [currentUser?.id, user.id, isGroup, displayName, updateMemberOnlineStatus]);

  // 🔄 ПЕРИОДИЧЕСКОЕ ОБНОВЛЕНИЕ LAST_SEEN TIMESTAMP
  // Отправляет update_last_seen каждые 30 секунд пока пользователь в личном чате
  useEffect(() => {
    if (!isGroup && socket && currentUser?.id && contactOnline) {
      
      const interval = setInterval(() => {
        try {
          socket.emit('update_last_seen', { user_id: currentUser.id });
        } catch (err) {
        }
      }, 30000); // Каждые 30 секунд

      return () => {
        clearInterval(interval);
      };
    }
  }, [isGroup, socket, currentUser?.id, contactOnline]);

  const loadCurrentUser = async () => {
    const userData = await AsyncStorage.getItem('user');
    setCurrentUser(JSON.parse(userData));
  };

  const getBackgroundColor = () => {
    // Если кастомный фон - возвращаем прозрачный (изображение будет под чатом)
    if (chatBackground === 'custom' && customBackgroundImage) {
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

  const scrollToBottom = React.useCallback((animated = true) => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated });
    }
  }, []);

  const groupMessagesByDate = (messages) => {
    const grouped = [];
    let currentDate = null;
    let dateIndex = 0;
    
    messages.forEach(message => {
      const messageDate = new Date(message.created_at).toDateString();
      
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        dateIndex++;
        grouped.push({
          id: `date-separator-${dateIndex}-${new Date(message.created_at).getTime()}`,
          type: 'date',
          date: message.created_at
        });
      }
      
      grouped.push(message);
    });
    
    return grouped;
  };

  const loadMessages = async (pageNum = 1) => {
    try {
      // ⚡ ОПТИМИЗАЦИЯ: Сначала показываем кэшированные сообщения, потом загружаем свежие
      if (pageNum === 1) {
        try {
          const cachedMessages = isGroup 
            ? await loadChatMessages(user.id) // Для групп тоже используем loadChatMessages пока
            : await loadChatMessages(user.id);
          
          if (cachedMessages && cachedMessages.length > 0) {
            // Нормализуем URL в кэшированных сообщениях
            const normalizedCachedMessages = cachedMessages.map(msg => ({
              ...msg,
              media_url: normalizeMediaUrl(msg.media_url)
            }));
            const groupedMessages = groupMessagesByDate(normalizedCachedMessages);
            setMessages(groupedMessages);
            // Скролим вниз для кэшированных сообщений
            setTimeout(() => scrollToBottom(), 100);
          }
        } catch (cacheErr) {
          // Игнорируем ошибки кэша
        }
      }

      // Загружаем только последние N сообщений
      const response = isGroup 
        ? await groupAPI.getGroupMessages(user.id, { page: pageNum, limit: MESSAGES_PER_PAGE })
        : await messageAPI.getMessages(user.id, { page: pageNum, limit: MESSAGES_PER_PAGE });
      
      const messages = Array.isArray(response.data) ? response.data : [];
      
      // ⚡ Кэшируем свежие сообщения через messageCache
      if (pageNum === 1 && messages.length > 0) {
        saveChatMessages(user.id, messages).catch(() => {});
      }
      
      // ⚡ ЕСЛИ ПЕРВАЯ СТРАНИЦА - ПОЛНАЯ ЗАГРУЗКА
      // ЕСЛИ ПОСЛЕДУЮЩИЕ - ДОБАВЛЯЕМ В НАЧАЛО
      if (pageNum === 1) {
        setHasMoreMessages(messages.length >= MESSAGES_PER_PAGE);
      } else {
        setHasMoreMessages(messages.length >= MESSAGES_PER_PAGE);
      }
      
      // 🔧 ИСПРАВЛЕНИЕ: Правильная обработка is_read при загрузке
      const correctedMessages = messages.map(msg => {
        const isSentByMe = msg.sender_id === currentUser?.id;
        
        // ⭐ КРИТИЧНО: Конвертируем 0/1 в boolean ПРАВИЛЬНО
        // Для МОИХ сообщений: is_read означает что СОБЕСЕДНИК прочитал
        // Для ВХОДЯЩИХ сообщений: is_read означает что Я прочитал
        let isReadValue = false;
        
        if (msg.is_read === true || msg.is_read === 1 || msg.is_read === '1') {
          isReadValue = true;
        }
        
        return {
          ...msg,
          is_read: isReadValue,
          media_url: normalizeMediaUrl(msg.media_url)
        };
      });
      
      // Группируем по датам
      const groupedMessages = groupMessagesByDate(correctedMessages);
      
      // 🎬 Предзагружаем все медиа в фоне
      const videoCircleUrls = correctedMessages
        .filter(msg => (msg.media_type === 'video_circle' || msg.is_circle) && msg.media_url)
        .map(msg => msg.media_url);
      const imageUrls = correctedMessages
        .filter(msg => msg.media_type === 'image' && msg.media_url)
        .map(msg => msg.media_url);
      const videoUrls = correctedMessages
        .filter(msg => msg.media_type === 'video' && !msg.is_circle && msg.media_url)
        .map(msg => msg.media_url);
      
      // Предзагрузка в фоне
      if (videoCircleUrls.length > 0) {
        preloadVideos(videoCircleUrls);
      }
      if (imageUrls.length > 0) {
        preloadMediaList(imageUrls, 'image');
      }
      if (videoUrls.length > 0) {
        preloadMediaList(videoUrls, 'video');
      }
      
      // Если первая страница - заменяем все сообщения, иначе добавляем в начало
      if (pageNum === 1) {
        setMessages(groupedMessages);
        if (groupedMessages.length > 0) {
          setTimeout(() => scrollToBottom(), 300);
        }
      } else {
        // ⭐ ИСПРАВЛЕНИЕ: Удаляем дубликаты
        setMessages(prev => {
          // Собираем ID сообщений которые уже есть
          const existingIds = new Set(
            prev
              .filter(m => m.type !== 'date')
              .map(m => m.id)
          );
          
          // Берём только НОВЫЕ сообщения (которых ещё нет в списке)
          const newMessages = groupedMessages.filter(m => {
            if (m.type === 'date') return true;
            return !existingIds.has(m.id);
          });
          
          // ⭐ ИСПРАВЛЕНИЕ: Удаляем дублирующиеся date separators на границе
          let result = [...newMessages, ...prev];
          
          // Если последний элемент в newMessages это date separator
          // И первый элемент в prev это date separator для той же даты
          // То удаляем дублирующийся separator
          if (newMessages.length > 0 && prev.length > 0) {
            const lastNew = newMessages[newMessages.length - 1];
            const firstPrev = prev[0];
            
            if (lastNew.type === 'date' && firstPrev.type === 'date') {
              const lastNewDate = new Date(lastNew.date).toDateString();
              const firstPrevDate = new Date(firstPrev.date).toDateString();
              
              // Если даты одинаковые - удаляем дубликат
              if (lastNewDate === firstPrevDate) {
                result = [...newMessages.slice(0, -1), ...prev];
              }
            }
          }
          
          return result;
        });
      }
      
      setReplyToMessage(null);
    } catch (error) {
      
      if (error.response?.status === 401) {
        error('Ошибка', 'Сессия истекла. Войдите снова', {
          buttons: [{ text: 'OK', onPress: () => navigation.replace('Login') }],
          autoClose: false
        });
      } else {
        error('Ошибка', 'Не удалось загрузить сообщения');
      }
    }
  };

  const loadPinnedMessages = async () => {
    try {
      if (!currentUser) return;
      
      
      const endpoint = isGroup 
        ? pinnedAPI.getGroupPinnedMessages(user.id)
        : pinnedAPI.getPinnedMessages(user.id);
      
      const response = await endpoint;
      
      const messageIds = response.data.map(p => p.message_id);
      
      setPinnedMessages(messageIds);
    } catch (err) {
      // Fallback: пытаемся загрузить из локального хранилища
      try {
        const key = `pinned_messages_${currentUser.id}_${isGroup ? 'group' : 'chat'}_${user.id}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const pinned = JSON.parse(stored);
          setPinnedMessages(pinned);
        }
      } catch (fallbackErr) {
      }
    }
  };

  const togglePinnedMessage = async (messageId, isVisibleToAll = true) => {
    try {
      if (!currentUser) return;
      
      const current = [...pinnedMessages];
      const idx = current.findIndex(id => id === messageId);
      const isPinned = idx > -1;
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📌 [DEBUG] togglePinnedMessage ВЫЗВАНА`);
      console.log(`   message_id: ${messageId}`);
      console.log(`   current_status: ${isPinned ? 'pinned' : 'unpinned'}`);
      console.log(`   new_status: ${!isPinned ? 'pinned' : 'unpinned'}`);
      console.log(`   socket_connected: ${socket && socket.connected}`);
      console.log(`${'='.repeat(70)}`);
      
      if (isPinned) {
        // Открепить
        current.splice(idx, 1);
        await pinnedAPI.unpinMessage(messageId);
        success('Сообщение откреплено', '');
        
        // 📌 НОВОЕ: Отправляем событие через Socket
        if (socket && socket.connected) {
          console.log(`📤 [DEBUG] Отправляем message_pin_toggle на Socket (unpin)`);
          socket.emit('message_pin_toggle', {
            message_id: messageId,
            is_pinned: false,
            pinned_by_user_id: currentUser.id,
            initiator_id: currentUser.id,
            other_user_id: isGroup ? null : user.id,
            group_id: isGroup ? user.id : null,
            chat_type: isGroup ? 'group' : 'personal',
            timestamp: new Date().toISOString()
          });
          console.log('✅ [DEBUG] message_pin_toggle отправлен\n');
        } else {
          console.warn('⚠️ [DEBUG] Socket не подключен, событие не отправлено\n');
        }
      } else {
        // Закрепить
        current.push(messageId);
        const chatType = isGroup ? 'group' : 'personal';
        await pinnedAPI.pinMessage(messageId, chatType, user.id, isVisibleToAll);
        const message = isVisibleToAll 
          ? 'Сообщение закреплено для обоих' 
          : 'Сообщение закреплено только для вас';
        success(message, '');
        
        // 📌 НОВОЕ: Отправляем событие через Socket
        if (socket && socket.connected) {
          console.log(`📤 [DEBUG] Отправляем message_pin_toggle на Socket (pin)`);
          socket.emit('message_pin_toggle', {
            message_id: messageId,
            is_pinned: true,
            pinned_by_user_id: currentUser.id,
            initiator_id: currentUser.id,
            other_user_id: isGroup ? null : user.id,
            group_id: isGroup ? user.id : null,
            chat_type: isGroup ? 'group' : 'personal',
            is_visible_to_all: isVisibleToAll,
            timestamp: new Date().toISOString()
          });
          console.log('✅ [DEBUG] message_pin_toggle отправлен\n');
        } else {
          console.warn('⚠️ [DEBUG] Socket не подключен, событие не отправлено\n');
        }
      }
      
      setPinnedMessages(current);
      
      // Сохраняем в локальное хранилище как резервный вариант
      const key = `pinned_messages_${currentUser.id}_${isGroup ? 'group' : 'chat'}_${user.id}`;
      await AsyncStorage.setItem(key, JSON.stringify(current));
    } catch (err) {
      error('Ошибка при закреплении сообщения', '');
    }
  };

  const initiateCall = useCallback(async (type) => {
    try {
      if (isGroup) {
        warning('Ошибка', 'Звонки доступны только в личных чатах');
        return;
      }

      if (!currentUser || !user?.id) {
        error('Ошибка', 'Не удалось получить данные пользователя');
        return;
      }

      
      const response = type === 'audio' 
        ? await callAPI.initiateAudioCall(user.id)
        : await callAPI.initiateVideoCall(user.id);

      if (response.data?.call_id) {
        setCurrentCallId(response.data.call_id);
        setCallType(type);
        setCallStatus('connecting');
        setCallModalVisible(true);
        info('Звонок', `Вызов ${type === 'audio' ? 'голосовой' : 'видео'}...`);
      }
    } catch (err) {
      error('Ошибка', 'Не удалось начать звонок');
    }
  }, [isGroup, currentUser, user?.id, callAPI, error, warning, info]);

  const respondToIncomingCall = useCallback(async (accept) => {
    try {
      if (!incomingCall?.call_id) {
        error('Ошибка', 'Не удалось получить ID звонка');
        return;
      }


      const response = await callAPI.respondToCall(incomingCall.call_id, accept);
      
      if (accept && response.data?.status === 'accepted') {
        setCurrentCallId(incomingCall.call_id);
        setCallType(incomingCall.call_type || 'audio');
        setCallStatus('connected');
        setIncomingCallModalVisible(false);
        info('Звонок', `Звонок ${incomingCall.call_type || 'audio'} принят`);
      } else {
        setIncomingCallModalVisible(false);
        info('Звонок', 'Входящий звонок отклонен');
      }
    } catch (err) {
      error('Ошибка', 'Не удалось ответить на звонок');
      setIncomingCallModalVisible(false);
    }
  }, [incomingCall?.call_id, incomingCall?.call_type, callAPI, error, info]);

  const loadUnreadCount = async () => {
    try {
      if (isGroup) {
        const response = await groupAPI.getGroupUnreadCount(user.id);
        setUnreadCount(response.data.unread_count || 0);
      } else {
        const response = await messageAPI.getUnreadCount(user.id);
        setUnreadCount(response.data.unread_count || 0);
      }
    } catch (err) {
    }
  };

  const markAllAsRead = async () => {
    try {
      // 🔴 ИСПРАВЛЕНИЕ: Собираем НЕПРОЧИТАННЫЕ сообщения ПЕРЕД вызовом API
      const unreadMessageIds = messages
        .filter(msg => {
          // Пропускаем служебные сообщения (даты и т.п.)
          if (msg.type === 'date') return false;
          // Пропускаем сообщения которые уже прочитаны
          if (msg.is_read) return false;
          // Для группы: отмечаем только сообщения от других пользователей
          if (isGroup) {
            return msg.sender_id !== currentUser?.id;
          }
          // Для личного чата: отмечаем только входящие сообщения
          return msg.sender_id !== currentUser?.id;
        })
        .map(msg => msg.id);
      
      
      // Обновляем ТОЛЬКО непрочитанные сообщения локально
      setMessages(prev => prev.map(msg => {
        if (msg.type === 'date') return msg;
        // Отмечаем как прочитанные только если это было непрочитанное входящее сообщение
        if (!msg.is_read && msg.sender_id !== currentUser?.id) {
          return { ...msg, is_read: true };
        }
        return msg;
      }));
      
      // Отправляем события на сервер для непрочитанных сообщений
      if (socket && unreadMessageIds.length > 0) {
        unreadMessageIds.forEach(msgId => {
          socket.emit('mark_message_read', { message_id: msgId });
        });
        
        // Также отправляем API запрос если нужно
        if (isGroup) {
          await groupAPI.markGroupAsRead(user.id);
        } else {
          await messageAPI.markAllAsRead(user.id);
        }
      }
      
      setUnreadCount(0);
    } catch (err) {
    }
  };

  const markMessageAsRead = async (messageId) => {
    if (!messageId) return;
    
    try {
      // ⭐ Находим сообщение чтобы получить sender_id и receiver_id
      const targetMessage = messages.find(m => m.id === messageId && m.type !== 'date');
      
      if (!targetMessage) {
        console.log('⚠️ [markMessageAsRead] Сообщение не найдено:', messageId);
        return;
      }
      
      // Не отмечаем свои сообщения как прочитанные
      if (targetMessage.sender_id === currentUser?.id) {
        return;
      }
      
      // ⭐ Сначала обновляем локально
      setMessages(prev => prev.map(item => {
        if (item.type === 'date') return item;
        if (item.id === messageId && !item.is_read) {
          return { ...item, is_read: true };
        }
        return item;
      }));
      
      // Отправляем событие через Socket.io на сервер
      if (socket && socket.connected) {
        const eventData = {
          message_id: messageId,
          sender_id: targetMessage.sender_id,      // ⭐ Кто отправил сообщение
          receiver_id: targetMessage.receiver_id,  // ⭐ Кому было отправлено
          reader_id: currentUser?.id,              // ⭐ Кто прочитал (я)
          chat_id: user.id,
          chat_type: 'personal',
          timestamp: new Date().toISOString()
        };
        
        console.log('📤 [markMessageAsRead] Отправляем mark_message_read:', eventData);
        socket.emit('mark_message_read', eventData);
      } else {
        // Fallback на API
        console.log('⚠️ [markMessageAsRead] Socket не подключен, используем API');
        await messageAPI.markMessageAsRead(messageId);
      }
    } catch (err) {
      console.error('❌ [markMessageAsRead] Ошибка:', err);
    }
  };

  // 🆕 НОВАЯ ФУНКЦИЯ: Отмечать сообщение как прочитанное только когда оно видно на экране
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    try {
      const nextPage = messagesPage + 1;
      await loadMessages(nextPage);
      setMessagesPage(nextPage);
    } catch (error) {
      if (__DEV__) console.error('Ошибка при загрузке больше сообщений:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreMessages, messagesPage]);

  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (!socket?.connected || !currentUser?.id || viewableItems.length === 0) return;

    const messagesToMark = [];
    const messagesData = []; // ⭐ Храним полные данные для Socket
    const messageIdSet = new Set();
    
    viewableItems.forEach(viewable => {
      const message = viewable.item;
      
      // Пропускаем служебные сообщения
      if (!message || message.type === 'date') return;
      
      // Пропускаем временные ID
      if (message.id && typeof message.id === 'string' && message.id.startsWith('temp-')) {
        return;
      }
      
      // Только ВХОДЯЩИЕ непрочитанные сообщения
      if (!message.is_read && message.sender_id !== currentUser?.id) {
        if (!messageIdSet.has(message.id)) {
          messagesToMark.push(message.id);
          messageIdSet.add(message.id);
          
          // ⭐ Сохраняем полные данные для Socket
          messagesData.push({
            message_id: message.id,
            sender_id: message.sender_id,
            receiver_id: message.receiver_id || currentUser?.id
          });
        }
      }
    });
    
    if (messagesToMark.length === 0) return;
    
    console.log('\n' + '='.repeat(70));
    console.log('📝 [AUTO_READ] Видимые непрочитанные сообщения:', messagesToMark);
    console.log('='.repeat(70) + '\n');
    
    // ⭐ Отправляем пакет на сервер с ПОЛНЫМИ данными
    socket.emit('mark_messages_read_batch', { 
      message_ids: messagesToMark,
      messages_data: messagesData,  // ⭐ Полные данные о сообщениях
      reader_id: currentUser?.id,
      chat_id: user.id,
      chat_type: isGroup ? 'group' : 'personal',
      timestamp: new Date().toISOString()
    });
    
    // ⭐ Обновляем локально
    setMessages(prev => {
      return prev.map(msg => {
        if (msg.type === 'date') return msg;
        if (messageIdSet.has(msg.id)) {
          return { ...msg, is_read: true };
        }
        return msg;
      });
    });
    
  }, [socket, currentUser?.id, isGroup, user.id]);

  // Обработчик события: сообщение прочитано (от сервера)
  const handleMessageReadStatusUpdated = (data) => {
    if (!data || !data.message_id) {
      console.log('❌ [handleMessageReadStatusUpdated] Некорректные данные:', data);
      return;
    }
    
    const { 
      message_id, 
      is_read, 
      read_by, 
      reader_count, 
      sender_id, 
      receiver_id, 
      group_id,
      reader_id,
      chat_id
    } = data;
    
    console.log('\n' + '='.repeat(70));
    console.log('📥 [CHECKMARK] handleMessageReadStatusUpdated получено событие');
    console.log('   Данные:', JSON.stringify({
      message_id,
      is_read,
      sender_id,
      receiver_id,
      reader_id,
      chat_id,
      group_id
    }, null, 2));
    console.log('   Текущий чат: user.id=' + user.id + ', isGroup=' + isGroup);
    console.log('   Текущий пользователь: currentUser.id=' + currentUser?.id);
    console.log('='.repeat(70) + '\n');
    
    // ⭐ УЛУЧШЕННАЯ ПРОВЕРКА: Это событие для нашего чата?
    let isForThisChat = false;
    
    if (group_id) {
      // Для группового чата
      isForThisChat = Number(group_id) === Number(user.id);
    } else if (!isGroup) {
      // Для ЛИЧНОГО чата - проверяем несколько вариантов
      
      // Вариант 1: Событие о том что СОБЕСЕДНИК прочитал МОЁ сообщение
      // sender_id = я (currentUser.id), receiver_id = собеседник (user.id)
      const isMyMessageReadByThem = 
        Number(sender_id) === Number(currentUser?.id) && 
        Number(receiver_id) === Number(user.id);
      
      // Вариант 2: Событие о том что Я прочитал сообщение СОБЕСЕДНИКА
      // sender_id = собеседник (user.id), receiver_id = я (currentUser.id)
      const isTheirMessageReadByMe = 
        Number(sender_id) === Number(user.id) && 
        Number(receiver_id) === Number(currentUser?.id);
      
      // Вариант 3: Проверка по chat_id если передан
      const isChatIdMatch = chat_id && Number(chat_id) === Number(user.id);
      
      // Вариант 4: Проверка по reader_id
      const isReaderMatch = reader_id && (
        Number(reader_id) === Number(user.id) || 
        Number(reader_id) === Number(currentUser?.id)
      );
      
      isForThisChat = isMyMessageReadByThem || isTheirMessageReadByMe || isChatIdMatch || isReaderMatch;
      
      console.log('   Проверка чата:', {
        isMyMessageReadByThem,
        isTheirMessageReadByMe,
        isChatIdMatch,
        isReaderMatch,
        isForThisChat
      });
    }
    
    if (!isForThisChat) {
      console.log('   ❌ Событие НЕ для этого чата, пропускаем');
      return;
    }
    
    console.log('   ✅ Событие ДЛЯ этого чата, обновляем сообщение');
    
    // ⭐ КРИТИЧНО: Обновляем состояние с НОВЫМ массивом
    setMessages(prev => {
      if (!Array.isArray(prev) || prev.length === 0) {
        console.log('   ⚠️ Массив сообщений пуст');
        return prev;
      }
      
      // Ищем индекс сообщения
      const messageIndex = prev.findIndex(m => m && m.id === message_id && m.type !== 'date');
      
      if (messageIndex === -1) {
        console.log('   ⚠️ Сообщение ' + message_id + ' не найдено в списке');
        return prev;
      }
      
      const oldMessage = prev[messageIndex];
      
      // ⭐ Конвертируем is_read в boolean
      const isReadBoolean = is_read === true || is_read === 1 || is_read === '1';
      
      // Если значение не изменилось - не обновляем
      if (oldMessage.is_read === isReadBoolean) {
        console.log('   ℹ️ Значение is_read не изменилось, пропускаем');
        return prev;
      }
      
      // Создаём НОВЫЙ массив с обновленным сообщением
      const newMessages = [...prev];
      newMessages[messageIndex] = {
        ...oldMessage,
        is_read: isReadBoolean,
        read_by: read_by || oldMessage.read_by || [],
        reader_count: typeof reader_count === 'number' ? reader_count : (oldMessage.reader_count || 0)
      };
      
      console.log('   ✅ ОБНОВЛЕНО сообщение:', {
        id: message_id,
        old_is_read: oldMessage.is_read,
        new_is_read: isReadBoolean
      });
      
      return newMessages;
    });
    
    // ⭐ КРИТИЧНО: Эмитим локальное событие для ChatsListScreen
    // чтобы обновить галочки (✓ → ✓✓) в списке чатов
    emitMessageRead({
      message_id,
      is_read: true,
      sender_id,
      receiver_id,
      group_id,
      reader_id,
      chat_id
    });
  };

  const sendMessage = async (mediaData = null, captionText = null) => {
    if (!newMessage.trim() && !mediaData) {
      warning('Ошибка', 'Введите сообщение или выберите медиа');
      return;
    }
    
    // ⭐ Клавиатура остаётся открытой после отправки для удобства
    // Keyboard.dismiss(); // Закомментировано по запросу
    
    const messageText = newMessage.trim() || '📎 Медиа';
    setNewMessage('');
    
    // ⭐ УНИКАЛЬНЫЙ ID с временной меткой и достаточной энтропией
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // ⚡ ОПТИМИЗАЦИЯ: Сразу добавляем сообщение в UI без ждания ответа (optimistic update)
    const optimisticMessage = {
      id: tempId,
      message: messageText,
      created_at: new Date().toISOString(),
      sender_id: currentUser?.id,
      sender_username: currentUser?.username || 'Вы',
      media_type: mediaData?.type || 'text',
      media_url: mediaData?.url || null,
      is_circle: mediaData?.is_circle || false, // ⭐ Флаг видеокружка
      duration: mediaData?.duration || null, // ⭐ Длительность видео
      caption: captionText || null,
      is_read: false,
      is_edited: false,
      is_optimistic: true, // ⭐ ФЛАГ для отслеживания оптимистичных сообщений
      ...(replyToMessage && {
        reply_to_message: replyToMessage.message || replyToMessage.media_url || '',
        reply_to_sender: replyToMessage.sender_id === currentUser?.id
          ? currentUser?.username
          : replyToMessage.sender_username || (isGroup ? replyToMessage.sender_username : user.username),
        reply_to_sender_id: replyToMessage.sender_id,
      })
    };

    // Добавляем в UI сразу (optimistic update)
    setMessages(prev => {
      // Проверяем нужно ли добавить разделитель по датам
      const lastMessage = prev[prev.length - 1];
      const newMessageDate = new Date(optimisticMessage.created_at).toDateString();
      const lastMessageDate = lastMessage && new Date(lastMessage.created_at).toDateString();
      
      let updatedMessages = [...prev];
      if (lastMessageDate && newMessageDate !== lastMessageDate) {
        updatedMessages.push({
          id: `date-separator-${new Date(optimisticMessage.created_at).getTime()}`,
          type: 'date',
          date: optimisticMessage.created_at
        });
      }
      updatedMessages.push(optimisticMessage);
      
      return updatedMessages;
    });
    scrollToBottom();
    setReplyToMessage(null);
    
    try {
      const messageData = {
        ...(isGroup ? { group_id: user.id } : { receiver_id: user.id }),
        message: messageText,
        reply_to: replyToMessage?.id || null,
        media_type: mediaData?.type || 'text',
        media_url: mediaData?.url || null,
        is_circle: mediaData?.is_circle || false, // ⭐ Флаг видеокружка
        duration: mediaData?.duration || null, // ⭐ Длительность видео
        caption: captionText || null,
      };
      
      const response = await (isGroup 
        ? groupAPI.sendGroupMessage(messageData)
        : messageAPI.sendMessage(messageData));

      // ⭐ ИСПРАВЛЕНИЕ: Заменяем временный ID на реальный с полными данными
      const finalMessage = {
        ...response.data,
        sender_username: currentUser?.username || 'Вы',
        is_optimistic: false, // убираем флаг оптимистичности
        is_circle: messageData.is_circle || response.data?.is_circle || false, // ⭐ Сохраняем флаг кружка
        duration: messageData.duration || response.data?.duration || null, // ⭐ Сохраняем длительность
      };
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === tempId) {
          return finalMessage;
        }
        return msg;
      }));
      
      // 📦 Добавляем сообщение в кэш
      addMessageToCache(user.id, finalMessage, isGroup).catch(() => {});

      // ✅ Отправляем событие на сокет чтобы сервер обновил получателя
      // И эмитим событие локально для НЕМЕДЛЕННОГО обновления ChatsListScreen
      const sentMessageData = {
        id: response.data?.id,
        sender_id: currentUser?.id,
        receiver_id: isGroup ? null : user.id,
        group_id: isGroup ? user.id : null,
        message: messageText,
        created_at: response.data?.created_at || new Date().toISOString(),
        is_read: response.data?.is_read || false,
      };
      
      if (socket && socket.connected) {
        console.log('📤 ChatScreen: Отправляем message_sent на сервер', sentMessageData);
        socket.emit('message_sent', sentMessageData);
      }
      
      // ⭐ КРИТИЧНО: Эмитим локальное событие через AppEvents
      // Это гарантированно обновит ChatsListScreen
      console.log('📤 ChatScreen: Вызываем AppEvents для обновления ChatsListScreen');
      if (isGroup) {
        emitGroupMessageSent(sentMessageData);
      } else {
        emitMessageSent(sentMessageData);
      }
      
    } catch (err) {
      // Откатываем оптимистичное обновление при ошибке
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setNewMessage(messageText);
      
      if (err.response?.status === 401) {
        error('Ошибка', 'Сессия истекла. Войдите снова', {
          buttons: [{ text: 'OK', onPress: () => navigation.replace('Login') }],
          autoClose: false
        });
      } else {
        const errorMessage = err.response?.data?.error || 'Не удалось отправить сообщение';
        error('Ошибка отправки', errorMessage);
      }
    }
  };

  const handleMediaCaptionSend = async (caption) => {
    try {
      let mediaUrl = pendingMediaUri;
      
      // Если это видео, загружаем его сначала на сервер
      if (pendingMediaType === 'video') {
        setUploadingMediaUri(pendingMediaUri);
        setMediaUploadProgress({ 
          uri: pendingMediaUri, 
          progress: 0, 
          speed: '0 KB/s', 
          timeRemaining: 'Калькуляция...', 
          type: 'video' 
        });
        
        const uploadResponse = await mediaAPI.uploadMedia(pendingMediaUri, 'video', (progressEvent) => {
          if (progressEvent.total > 0) {
            const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            const speed = ((progressEvent.loaded / (progressEvent.timeStamp / 1000)) / 1024).toFixed(1);
            const timeRemaining = progressEvent.total > progressEvent.loaded 
              ? Math.ceil((progressEvent.total - progressEvent.loaded) / (progressEvent.loaded / (progressEvent.timeStamp / 1000)))
              : 0;
            
            setMediaUploadProgress({
              uri: pendingMediaUri,
              progress,
              speed: `${speed} KB/s`,
              timeRemaining: `${timeRemaining}s`,
              type: 'video'
            });
          }
        });
        
        mediaUrl = uploadResponse.data.url;
        setUploadingMediaUri(null);
        setMediaUploadProgress(null);
      }
      
      // Отправляем сообщение с подписью как отдельное поле
      setNewMessage('');
      await sendMessage({ 
        type: pendingMediaType, 
        url: mediaUrl
      }, caption);
      
      // Очищаем состояние
      setPendingMediaUri(null);
      setPendingMediaType(null);
    } catch (err) {
      setUploadingMediaUri(null);
      setMediaUploadProgress(null);
      error('Ошибка', 'Не удалось загрузить медиа');
    }
  };

  const pickMedia = () => {
    info(
      'Выберите медиа',
      'Что вы хотите отправить?',
      {
        buttons: [
          { text: 'Отмена', color: '#ccc', textColor: '#333', onPress: () => {} },
          { text: 'Фото', color: theme.primary, onPress: () => pickImage() },
          { text: 'Видео', color: theme.primary, onPress: () => pickVideo() },
          { text: '🎬 Кружок', color: '#667eea', onPress: () => setVideoCircleRecorderVisible(true) },
        ],
        autoClose: false
      }
    );
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      warning('Ошибка', 'Нужно разрешение для доступа к галерее');
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
      setPendingMediaUri(base64Image);
      setPendingMediaType('image');
      setMediaCaptionModalVisible(true);
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      warning('Ошибка', 'Нужно разрешение для доступа к галерее');
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
      setPendingMediaUri(asset.uri);
      setPendingMediaType('video');
      setMediaCaptionModalVisible(true);
    }
  };

  const pickGroupAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      warning('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled) {
      try {
        setGroupAvatarUpdating(true);
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const token = await AsyncStorage.getItem('token');
        
        // Загружаем аватарку на сервер
        // groupId из props (текущего чата), не user.id
        const groupId = isGroup ? user.id : null;
        
        if (!groupId) {
          error('Ошибка', 'Группа не определена');
          setGroupAvatarUpdating(false);
          return;
        }
        
        const response = await fetch(`${API_URL}/groups/${groupId}/avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            avatar: base64Image,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          // Обновляем локальные данные
          if (socket) {
            socket.emit('group_avatar_updated', {
              group_id: user.id,
              avatar: data.avatar,
            });
          }
          success('Готово', 'Аватар группы обновлен');
          // Перезагружаем данные группы
          refreshGroupMembers();
        } else {
          const errorData = await response.json().catch(() => ({}));
          error('Ошибка', errorData.error || 'Не удалось обновить аватар');
        }
      } catch (err) {
        error('Ошибка', 'Не удалось загрузить аватар');
      } finally {
        setGroupAvatarUpdating(false);
      }
    }
  };

  const handleVoiceMessageSend = async (recordingData) => {
    try {
      setVoiceRecorderModalVisible(false);
      
      // Загружаем голосовое сообщение без блокирующего диалога
      const uploadResponse = await audioRecorder.uploadVoiceMessage(recordingData.uri, mediaAPI);
      
      
      // Отправляем сообщение
      sendMessage({ 
        type: 'voice', 
        url: uploadResponse.url,
        duration: recordingData.duration
      });
      
    } catch (err) {
      error('Ошибка', 'Не удалось загрузить голосовое сообщение');
    }
  };

  // 🎬 Обработчик записи видеокружка
  const handleVideoCircleRecorded = async (videoData) => {
    try {
      setVideoCircleRecorderVisible(false);
      
      console.log('🎬 [VIDEO_CIRCLE] Начало загрузки видеокружка:', {
        uri: videoData.uri,
        duration: videoData.duration
      });
      
      // Проверяем размер файла
      const FileSystem = require('expo-file-system/legacy');
      const fileInfo = await FileSystem.getInfoAsync(videoData.uri);
      const fileSizeMB = (fileInfo.size / 1024 / 1024).toFixed(2);
      console.log(`🎬 [VIDEO_CIRCLE] Размер файла: ${fileSizeMB} MB`);
      
      if (fileInfo.size > 50 * 1024 * 1024) {
        error('Ошибка', `Видео слишком большое (${fileSizeMB} MB). Максимум 50 MB.`);
        return;
      }
      
      // Показываем индикатор загрузки
      setMediaUploadProgress({
        uri: videoData.uri,
        progress: 0,
        speed: `Загрузка ${fileSizeMB} MB...`,
        timeRemaining: '',
        type: 'video'
      });
      setUploadingMediaUri(videoData.uri);
      
      console.log('🎬 [VIDEO_CIRCLE] Отправка на сервер через mediaAPI...');
      
      // ✅ Используем mediaAPI.uploadMedia как для остальных медиа
      const uploadResponse = await mediaAPI.uploadMedia(videoData.uri, 'video');
      
      console.log('🎬 [VIDEO_CIRCLE] Ответ сервера:', uploadResponse.data);
      
      const mediaUrl = uploadResponse.data?.url;
      
      if (!mediaUrl) {
        throw new Error('Сервер не вернул URL видео');
      }
      
      console.log('🎬 [VIDEO_CIRCLE] Видео загружено:', mediaUrl);
      
      // ⭐ Сохраняем локальный файл в кэш СРАЗУ, до отправки сообщения
      // Это позволит мгновенно воспроизвести видео без повторной загрузки
      try {
        const cachedPath = await cacheLocalFile(videoData.uri, mediaUrl, 'video_circle');
        if (cachedPath) {
          console.log('🎬 [VIDEO_CIRCLE] Локальный файл закэширован:', cachedPath);
        }
      } catch (cacheErr) {
        console.warn('🎬 [VIDEO_CIRCLE] Ошибка кэширования (не критично):', cacheErr.message);
      }
      
      // Скрываем индикатор загрузки
      setUploadingMediaUri(null);
      setMediaUploadProgress(null);
      
      // Отправляем сообщение с видеокружком
      // ⭐ Используем тип video_circle для отображения как кружок
      await sendMessage({ 
        type: 'video_circle', 
        url: mediaUrl,
        duration: videoData.duration,
        is_circle: true,
      });
      
      console.log('🎬 [VIDEO_CIRCLE] Сообщение отправлено успешно');
    } catch (err) {
      console.error('❌ [VIDEO_CIRCLE] Ошибка отправки видеокружка:', err);
      console.error('❌ [VIDEO_CIRCLE] Детали ошибки:', {
        message: err.message,
        code: err.code,
        response: err.response?.data,
        status: err.response?.status,
      });
      setUploadingMediaUri(null);
      setMediaUploadProgress(null);
      error('Ошибка', 'Не удалось отправить видеокружок: ' + (err.message || 'Неизвестная ошибка'));
    }
  };

  const handleVoiceButtonPressIn = async () => {
    try {
      // Сбрасываем флаг при начале новой записи
      isProcessingVoiceRef.current = false;
      
      const success = await audioRecorder.startRecording();
      if (success) {
        setIsRecordingVoice(true);
        setVoiceRecordingDuration(0);
        
        // Обновляем длительность каждые 100ms
        voiceRecordingIntervalRef.current = setInterval(() => {
          const status = audioRecorder.getStatus();
          setVoiceRecordingDuration(status.duration);
        }, 100);
      }
    } catch (err) {
      error('Ошибка', 'Не удалось начать запись');
    }
  };

  const handleVoiceButtonPressOut = async () => {
    try {
      // Предотвращаем повторный вызов
      if (isProcessingVoiceRef.current) {
        return;
      }
      isProcessingVoiceRef.current = true;

      // Сразу очищаем интервал и выключаем индикатор
      if (voiceRecordingIntervalRef.current) {
        clearInterval(voiceRecordingIntervalRef.current);
        voiceRecordingIntervalRef.current = null;
      }

      setIsRecordingVoice(false);
      
      // Получаем актуальную длительность из audioRecorder
      const status = audioRecorder.getStatus();
      const duration = status.duration;
      
      
      if (duration < 1) {
        // Если запись менее 1 секунды, отменяем
        await audioRecorder.cancelRecording();
        isProcessingVoiceRef.current = false;
        warning('Запись слишком короткая', 'Минимальная длительность - 1 секунда');
        return;
      }

      // Останавливаем запись
      const recordingData = await audioRecorder.stopRecording();
      
      
      if (recordingData) {
        // Отправляем голосовое сообщение
        await handleVoiceMessageSend(recordingData);
      } else {
      }
      
      isProcessingVoiceRef.current = false;
    } catch (err) {
      isProcessingVoiceRef.current = false;
      error('Ошибка', 'Не удалось завершить запись');
    }
  };

  const performSearch = useCallback((query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = messages.filter(msg => {
      if (msg.type === 'date') return false;
      
      // Ищем в текстовых сообщениях
      if (msg.message && msg.message.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      
      // Для медиа сообщений показываем если есть заголовок
      if (msg.media_type && msg.message === '📎 Медиа') {
        return false;
      }
      
      return false;
    });

    setSearchResults(results);
  }, [messages]);

  const handleSearchChange = (query) => {
    setSearchQuery(query);
    performSearch(query);
  };

  const handleClearChat = async () => {
    try {
      
      // Очищаем чат через API
      const response = await messageAPI.clearChat(user.id);
      
      // Очищаем сообщения локально
      setMessages([]);
      
      // Emit socket event для синхронизации с другим пользователем
      if (socket && socket.connected) {
        socket.emit('request_clear_chat', {
          other_user_id: user.id,
          timestamp: new Date().toISOString()
        });
      } else {
      }
    } catch (err) {
      error('Ошибка', 'Не удалось очистить чат: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteChat = async () => {
    try {
      if (!user) {
        error('Ошибка', 'Не удалось получить данные пользователя');
        return;
      }
      
      // Удаляем чат через API
      await messageAPI.deleteChat(user.id);
      
      // Очищаем сообщения локально
      setMessages([]);
      success('Успех', 'Чат удален');
      
      // Возвращаемся на предыдущий экран
      setTimeout(() => {
        navigation.goBack();
      }, 500);
    } catch (err) {
      error('Ошибка', 'Не удалось удалить чат: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleGroupMenu = () => {
    setChatMenuVisible(true);
  };

  const deleteMessage = async (messageId) => {
    info(
      'Удалить сообщение',
      'Вы уверены что хотите удалить это сообщение?',
      {
        buttons: [
          { text: 'Отмена', color: '#ccc', textColor: '#333' },
          {
            text: 'Удалить',
            color: '#F44336',
            onPress: async () => {
              try {
                console.log(`\n${'='.repeat(70)}`);
                console.log(`🗑️ [DEBUG] deleteMessage ВЫЗВАНА`);
                console.log(`   message_id: ${messageId}`);
                console.log(`   socket_connected: ${socket && socket.connected}`);
                console.log(`${'='.repeat(70)}`);

                // Удаляем сообщение локально ПЕРЕД API запросом
                setMessages(prev => {
                  const filtered = prev.filter(msg => msg.id !== messageId);
                  console.log('🗑️ [DEBUG] Сообщение удалено локально:', messageId);
                  return filtered;
                });

                // Отправляем запрос на удаление на сервер
                if (isGroup) {
                  await groupAPI.deleteGroupMessage(messageId);
                } else {
                  await messageAPI.deleteMessage(messageId);
                }

                console.log('✅ [DEBUG] Сообщение удалено на сервере:', messageId);

                // 📌 НОВОЕ: Отправляем Socket событие другому пользователю
                if (socket && socket.connected) {
                  console.log(`📤 [DEBUG] Отправляем message_deleted на Socket`);
                  
                  socket.emit('message_deleted', {
                    message_id: messageId,
                    chat_type: isGroup ? 'group' : 'personal',
                    other_user_id: isGroup ? null : user.id,
                    group_id: isGroup ? user.id : null,
                    user_id: currentUser?.id
                  });
                  
                  console.log('✅ [DEBUG] message_deleted отправлено\n');
                } else {
                  console.warn('⚠️ [DEBUG] Socket не подключен, событие не отправлено\n');
                }

              } catch (err) {
                console.error('❌ [DEBUG] Ошибка при удалении сообщения:', err);
                error('Ошибка', 'Не удалось удалить сообщение');
              }
            }
          }
        ],
        autoClose: false
      }
    );
  };

  // 📤 ПЕРЕСЫЛКА СООБЩЕНИЙ: Загрузка получателей
  const loadForwardRecipients = async () => {
    try {
      setForwardLoading(true);
      const recipients = [];
      
      // Загружаем друзей
      try {
        const friendsResponse = await friendAPI.getFriends();
        if (friendsResponse.data && Array.isArray(friendsResponse.data)) {
          friendsResponse.data.forEach(friend => {
            recipients.push({
              id: friend.id,
              name: friend.username,
              avatar: friend.avatar,
              type: 'user'
            });
          });
        }
      } catch (err) {
        console.log('Ошибка загрузки друзей:', err);
      }
      
      // Загружаем группы пользователя
      try {
        const groupsResponse = await groupAPI.getGroups();
        if (groupsResponse.data && Array.isArray(groupsResponse.data)) {
          groupsResponse.data.forEach(group => {
            recipients.push({
              id: group.id,
              name: group.name,
              avatar: group.avatar,
              type: 'group'
            });
          });
        }
      } catch (err) {
        console.log('Ошибка загрузки групп:', err);
      }
      
      setForwardRecipients(recipients);
    } catch (err) {
      console.error('Ошибка загрузки получателей:', err);
      error('Ошибка', 'Не удалось загрузить список получателей');
    } finally {
      setForwardLoading(false);
    }
  };

  // 📤 ПЕРЕСЫЛКА СООБЩЕНИЙ: Отправка
  const forwardMessage = async (recipient) => {
    if (!messageToForward) return;
    
    // ⚡ ОПТИМИЗАЦИЯ: Закрываем модалку сразу для мгновенного отклика
    const msgToForward = { ...messageToForward };
    setForwardModalVisible(false);
    setMessageToForward(null);
    setForwardSearchQuery('');
    
    try {
      const response = await messageAPI.forwardMessage({
        message_id: msgToForward.id,
        receiver_id: recipient.id,
        receiver_type: recipient.type
      });
      
      if (!response.data?.success) {
        error('Ошибка', response.data?.error || 'Не удалось переслать сообщение');
      }
    } catch (err) {
      console.error('Ошибка пересылки:', err);
      error('Ошибка', 'Не удалось переслать сообщение');
    }
  };

  // 📤 ПЕРЕСЫЛКА: Загружаем получателей при открытии модалки
  useEffect(() => {
    if (forwardModalVisible) {
      loadForwardRecipients();
    }
  }, [forwardModalVisible]);

  // 🖼️ МЕДИА В ПРОФИЛЕ: Загрузка медиа из сообщений
  const loadProfileMedia = useCallback(async () => {
    setProfileMediaLoading(true);
    try {
      // Загружаем все сообщения для извлечения медиа (личные или групповые)
      const response = isGroup
        ? await groupAPI.getGroupMessages(user.id, { page: 1, limit: 500 })
        : await messageAPI.getMessages(user.id, { page: 1, limit: 500 });
      const allMessages = Array.isArray(response.data) ? response.data : [];
      
      // Фильтруем по типам
      const photos = allMessages.filter(msg => msg.media_type === 'image' && msg.media_url);
      const videos = allMessages.filter(msg => msg.media_type === 'video' && msg.media_url);
      const voice = allMessages.filter(msg => msg.media_type === 'voice' && msg.media_url);
      
      // Извлекаем ссылки из текстовых сообщений
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const links = allMessages
        .filter(msg => msg.message && urlRegex.test(msg.message))
        .map(msg => {
          const urls = msg.message.match(urlRegex);
          return { ...msg, url: urls ? urls[0] : msg.message };
        });
      
      setProfileMedia({
        photos: photos.map(p => ({ ...p, media_url: normalizeMediaUrl(p.media_url) })),
        videos: videos.map(v => ({ ...v, media_url: normalizeMediaUrl(v.media_url) })),
        links,
        voice: voice.map(v => ({ ...v, media_url: normalizeMediaUrl(v.media_url) }))
      });
    } catch (err) {
      console.log('Ошибка загрузки медиа профиля:', err);
    } finally {
      setProfileMediaLoading(false);
    }
  }, [user.id, isGroup]);

  // 🖼️ МЕДИА: Загружаем при открытии профиля (личные и групповые чаты)
  useEffect(() => {
    if (showProfileModal) {
      loadProfileMedia();
    }
  }, [showProfileModal, loadProfileMedia]);

  const editMessage = async (messageId, newText) => {
    try {
      if (!newText.trim()) {
        warning('Ошибка', 'Текст не может быть пустым');
        return;
      }

      console.log(`\n${'='.repeat(70)}`);
      console.log(`✏️ [DEBUG] editMessage ВЫЗВАНА`);
      console.log(`   message_id: ${messageId}`);
      console.log(`   new_text: ${newText}`);
      console.log(`   socket_connected: ${socket && socket.connected}`);
      console.log(`${'='.repeat(70)}`);

      // Отправляем запрос на редактирование на сервер
      if (isGroup) {
        await groupAPI.editGroupMessage(messageId, newText);
      } else {
        await messageAPI.editMessage(messageId, newText);
      }

      console.log('✅ [DEBUG] Сообщение отредактировано на сервере:', messageId);

      // Обновляем локально
      setMessages(prev => prev.map(msg => {
        if (msg.type === 'date') return msg;
        if (msg.id === messageId) {
          return { ...msg, message: newText, is_edited: true };
        }
        return msg;
      }));

      // 📌 НОВОЕ: Отправляем Socket событие другому пользователю
      if (socket && socket.connected) {
        console.log(`📤 [DEBUG] Отправляем message_updated на Socket`);
        
        socket.emit('message_updated', {
          message_id: messageId,
          new_message: newText,
          chat_type: isGroup ? 'group' : 'personal',
          other_user_id: isGroup ? null : user.id,
          group_id: isGroup ? user.id : null,
          user_id: currentUser?.id
        });
        
        console.log('✅ [DEBUG] message_updated отправлено\n');
      } else {
        console.warn('⚠️ [DEBUG] Socket не подключен, событие не отправлено\n');
      }

      // Закрываем модаль
      setEditModalVisible(false);
      setEditingMessage(null);
      setEditingText('');
      success('Успех', 'Сообщение отредактировано');

    } catch (err) {
      console.error('❌ [DEBUG] Ошибка при редактировании сообщения:', err);
      error('Ошибка', 'Не удалось отредактировать сообщение');
    }
  };

  const SwipeableMessage = React.memo(({ item, onReply, showSenderMeta = true }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(1)).current;
    const messageRef = useRef({ lastTap: 0 });  // ✏️ ДОБАВИТЬ ЭТУ СТРОКУ
    const isSent = item.sender_id === currentUser?.id;
    const [contextMenu, setContextMenu] = useState(false);
    const senderName = item.sender_username || item.sender_name || item.sender || 'Участник';
    const senderAvatar = item.sender_avatar || item.avatar || null;
    const senderInitial = senderName?.[0]?.toUpperCase?.() || '•';
    const showGroupMeta = isGroup && !isSent && showSenderMeta;
    const shouldShowInlineLabel = isGroup && isSent;
    
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
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.96,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      setContextMenu(true);
    };

    const renderAvatar = () => (
      <View style={styles.groupAvatarWrapper}>
        {senderAvatar ? (
          <Image source={{ uri: senderAvatar }} style={styles.groupAvatarImage} />
        ) : (
          <View style={[styles.groupAvatarPlaceholder, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.groupAvatarInitial, { color: theme.primary }]}>
              {senderInitial}
            </Text>
          </View>
        )}
      </View>
    );

    const messageBubble = (
      <TouchableOpacity
        onLongPress={handleLongPress}
        onPress={() => {
          // Счётчик для двойного нажатия
          const now = Date.now();
          const DOUBLE_PRESS_DELAY = 300;
          
          if (now - (messageRef.current.lastTap || 0) < DOUBLE_PRESS_DELAY) {
            // Двойное нажатие - открываем модаль редактирования
            if (isSent && !item.reply_to) { // Только свои сообщения без ответа
              setEditingMessage(item);
              setEditingText(item.message);
              setEditModalVisible(true);
            }
          }
          messageRef.current.lastTap = now;
        }}
        delayLongPress={500}
        activeOpacity={1}
      >
        <View
          style={[
            styles.messageContainer,
            isSent ? styles.sentContainer : styles.receivedContainer,
            // Убираем фон, тени и паддинги для видеокружков
            (item.media_type === 'video_circle' || item.is_circle) 
              ? { 
                  backgroundColor: 'transparent',
                  shadowOpacity: 0,
                  elevation: 0,
                  paddingHorizontal: 0,
                  paddingVertical: 0,
                  borderRadius: 0,
                }
              : isSent
                ? { ...styles.sentMessage, backgroundColor: theme.sentMessage }
                : { ...styles.receivedMessage, backgroundColor: theme.surface },
          ]}
        >
          {shouldShowInlineLabel && (
            <Text
              style={[
                styles.groupSenderLabel,
                styles.groupSenderLabelSent
              ]}
            >
              Вы
            </Text>
          )}
          {item.forwarded_from_user && (
            <View style={[styles.forwardedHeader, { borderBottomColor: isSent ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }]}>
              <Ionicons name="arrow-redo" size={12} color={isSent ? 'rgba(255,255,255,0.7)' : '#667eea'} style={{ transform: [{ scaleX: -1 }] }} />
              <Text style={[styles.forwardedFromText, { color: isSent ? 'rgba(255,255,255,0.7)' : '#667eea' }]}>
                Переслано от {item.forwarded_from_user}
              </Text>
            </View>
          )}
          {item.reply_to && (
            <View style={[styles.replyContainer, { backgroundColor: isSent ? 'rgba(255,255,255,0.1)' : theme.background }]}>
              <View style={styles.replyHeader}>
                <Ionicons name="return-up-forward" size={12} color={isSent ? 'rgba(255,255,255,0.8)' : '#667eea'} />
                <Text style={[styles.replyAuthor, isSent ? styles.replyAuthorSent : { ...styles.replyAuthorReceived, color: '#667eea' }]}>
                  {item.reply_to_sender_id === currentUser?.id ? 'Вы' : (item.reply_to_sender || displayName || 'Пользователь')}
                </Text>
              </View>
              <Text style={[styles.replyText, isSent ? styles.replyTextSent : { ...styles.replyTextReceived, color: theme.textSecondary }]}>
                {item.reply_to_message || 'Сообщение'}
              </Text>
            </View>
          )}
          {item.media_type === 'image' && item.media_url ? (
            <View>
              <TouchableOpacity onPress={() => {
                setSelectedPhotoUri(item.media_url);
                setFullscreenPhotoVisible(true);
              }}>
                <CachedImage 
                  source={{ uri: item.media_url }} 
                  style={styles.messageImage}
                  resizeMode="cover"
                  showLoader={true}
                  loaderColor="#667eea"
                />
              </TouchableOpacity>
              {item.caption && (
                <Text style={[
                  styles.captionText,
                  isSent ? { ...styles.sentText, color: '#ffffff' } : { ...styles.receivedText, color: theme.text }
                ]}>
                  {item.caption}
                </Text>
              )}
            </View>
          ) : (item.media_type === 'video_circle' || item.is_circle) && item.media_url ? (
            <VideoCirclePlayer
              uri={item.media_url}
              duration={item.duration || 0}
              size="message"
              isCurrentUser={isSent}
              theme={theme}
              onLongPress={handleLongPress}
              style={{ marginVertical: 4 }}
              messageId={item.id}
              isActive={activeVideoCircleId === item.id}
              onPlay={() => setActiveVideoCircleId(item.id)}
              onStop={() => {
                if (activeVideoCircleId === item.id) {
                  setActiveVideoCircleId(null);
                }
              }}
            />
          ) : item.media_type === 'video' && item.media_url ? (
            <View>
              <CachedVideo
                key={`video-${item.id}`}
                source={{ uri: item.media_url }}
                style={styles.messageVideo}
                useNativeControls={true}
                resizeMode="contain"
                shouldPlay={false}
                showLoader={true}
                loaderColor="#667eea"
                onError={(error) => {
                  console.error('❌ [VIDEO] Ошибка загрузки видео:', {
                    url: item.media_url,
                    error: error?.message || error
                  });
                }}
                onLoad={(data) => {
                  console.log('✅ [VIDEO] Видео успешно загружено:', {
                    url: item.media_url,
                    duration: data?.durationMillis
                  });
                }}
              />
              {item.caption && (
                <Text style={[
                  styles.captionText,
                  isSent ? { ...styles.sentText, color: '#ffffff' } : { ...styles.receivedText, color: theme.text }
                ]}>
                  {item.caption || ''}
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
          {item.message !== '📎 Медиа' && (
            <Text style={[
              styles.messageText,
              isSent ? { ...styles.sentText, color: '#ffffff' } : { ...styles.receivedText, color: theme.text }
            ]}>
              {item.message || ''}
            </Text>
          )}
          <View style={styles.messageTimeContainer}>
            <Text style={[
              styles.messageTime,
              isSent ? styles.sentTime : styles.receivedTime
            ]}>
              {new Date(item.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {item.is_edited && (
              <Text style={[
                styles.editedIndicator,
                isSent ? styles.editedIndicatorSent : styles.editedIndicatorReceived
              ]}>
                (изменено)
              </Text>
            )}
            {isSent && (
              <View style={styles.checkmarkContainer}>
                {isGroup ? (
                  // 👥 ДЛЯ ГРУПП: показываем количество прочитавших или одну галочку
                  item.reader_count && item.reader_count > 0 ? (
                    <Text style={[styles.messageCheckmark, styles.sentCheckmark]}>
                      ✓✓ ({item.reader_count})
                    </Text>
                  ) : (
                    <Text style={[styles.messageCheckmark, styles.sentCheckmark]}>
                      ✓
                    </Text>
                  )
                ) : (
                  // ДЛЯ ЛИЧНЫХ ЧАТОВ: строгая проверка is_read
                  <Text style={[styles.messageCheckmark, styles.sentCheckmark]}>
                    {item.is_read === true ? '✓✓' : '✓'}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
    
    return (
      <>
        <RNGHPanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          activeOffsetX={[-10, 10]}
          failOffsetY={[-5, 5]}
        >
          <Animated.View
            style={[
              styles.messageRow,
              isSent ? styles.sentRow : styles.receivedRow,
              showGroupMeta && styles.groupMessageRow,
              { transform: [{ translateX }, { scale: scaleAnim }] }
            ]}
          >
            {showGroupMeta && renderAvatar()}
            <View style={[
              styles.groupMessageContent,
              showGroupMeta && styles.groupMessageContentWithAvatar
            ]}>
              {isGroup && showGroupMeta && (
                <Text style={[styles.groupSenderLabel, { color: theme.textSecondary }]}>
                  {senderName || ''}
                </Text>
              )}
              {messageBubble || null}
            </View>
          </Animated.View>
        </RNGHPanGestureHandler>

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
                    setMessageToForward(item);
                    setForwardModalVisible(true);
                    setContextMenu(false);
                  }}
                >
                  <Ionicons name="arrow-redo" size={18} color={theme.primary} />
                  <Text style={[styles.contextMenuItemText, { color: theme.text }]}>Переслать</Text>
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
  });
  
  const formatMessageDate = (date) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (messageDate.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    } else {
      return messageDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  };

  const DateSeparator = React.memo(({ date }) => (
    <View style={styles.dateSeparatorContainer}>
      <View style={styles.dateSeparatorLine} />
      <View style={styles.dateSeparatorBadge}>
        <Text style={styles.dateSeparatorText}>{formatMessageDate(date)}</Text>
      </View>
      <View style={styles.dateSeparatorLine} />
    </View>
  ));

  const renderItem = React.useCallback(({ item, index }) => {
    if (item.type === 'date') {
      return (
        <View key={`date-separator-${index}-${new Date(item.date).getTime()}`}>
          <DateSeparator date={item.date} />
        </View>
      );
    }

    let showSenderMeta = true;
    if (!isGroup || item.sender_id === currentUser?.id) {
      showSenderMeta = false;
    } else if (index !== undefined && index > 0) {
      // ⚡ ОПТИМИЗАЦИЯ: Проверяем ТОЛЬКО предыдущее сообщение, не весь список
      const prev = messages[index - 1];
      if (prev && prev.type !== 'date' && prev.sender_id === item.sender_id) {
        const prevDate = prev.created_at ? new Date(prev.created_at).toDateString() : null;
        const currDate = item.created_at ? new Date(item.created_at).toDateString() : null;
        if (prevDate === currDate) {
          showSenderMeta = false;
        }
      }
    }

    return (
      <SwipeableMessage
        item={item}
        onReply={setReplyToMessage}
        showSenderMeta={showSenderMeta}
      />
    );
  }, [currentUser?.id, isGroup, messages]);

  const renderAvailableMemberItem = ({ item }) => {
    const isAdding = addingMemberId === item.id;
    return (
      <View style={[styles.groupMemberRow, { backgroundColor: theme.surface }]}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.groupMemberAvatar} />
        ) : (
          <View style={[styles.groupMemberPlaceholder, { backgroundColor: theme.primary }]}>
            <Text style={styles.groupMemberInitial}>{item.username?.[0]?.toUpperCase?.() || 'U'}</Text>
          </View>
        )}
        <View style={styles.groupMemberInfo}>
          <Text style={[styles.groupMemberName, { color: theme.text }]}>{item.username}</Text>
          <View style={styles.groupMemberMeta}>
            <View style={[styles.memberRoleChip, { backgroundColor: theme.primary + '15' }]}>
              <Text style={[styles.memberRoleChipText, { color: theme.primary }]}>
                {item.status === 'accepted' ? 'Друг' : 'Не в друзьях'}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.addMemberButton,
            isAdding && styles.addMemberButtonDisabled
          ]}
          onPress={() => handleAddMember(item)}
          disabled={isAdding}
        >
          {isAdding ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="person-add" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.addMemberButtonText}>Добавить</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const filteredAvailableMembers = useMemo(() => {
    const query = addMembersQuery.trim().toLowerCase();
    if (!query) {
      return availableMembers;
    }
    return availableMembers.filter(candidate =>
      candidate.username.toLowerCase().includes(query)
    );
  }, [addMembersQuery, availableMembers]);

  const callStatusLabel = useMemo(() => {
    switch (callStatus) {
      case 'connecting':
        return 'Подключение...';
      case 'ringing':
        return 'Вызов...';
      case 'connected':
        return 'Вызов установлен';
      case 'ended':
        return 'Звонок завершён';
      case 'cancelled':
        return 'Звонок отменён';
      default:
        return 'Подготовка вызова';
    }
  }, [callStatus]);

  const callGradient = useMemo(() => {
    if (callType === 'video') {
      return isDark ? ['#FF8C00', '#FF7B00'] : ['#FFA705', '#FF8C00'];
    }
    return isDark ? ['#FF8C00', '#FF7B00'] : ['#FFA705', '#FF8C00'];
  }, [callType, isDark]);

  const callCardBackground = useMemo(
    () => (isDark ? 'rgba(17,24,39,0.92)' : 'rgba(255,255,255,0.92)'),
    [isDark]
  );

  const callPrimaryText = useMemo(
    () => (isDark ? '#F9FAFB' : '#111827'),
    [isDark]
  );

  const callSecondaryText = useMemo(
    () => (isDark ? 'rgba(255,255,255,0.72)' : '#475569'),
    [isDark]
  );

  const callControlsDisabled = callStatus !== 'connected';

  useEffect(() => {
    if (callStatus === 'connected') {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [callStatus]);

  useEffect(() => () => clearCallTimers(), [clearCallTimers]);

  const closeCallModal = useCallback(() => {
    clearCallTimers();
    setCallModalVisible(false);
    setCallStatus('idle');
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setIsCameraOn(true);
  }, [clearCallTimers]);

  const openCallModal = useCallback((type = 'audio') => {
    if (isGroup) {
      warning('Групповой звонок недоступен', 'Звонки доступны только в личных чатах.');
      return;
    }

    clearCallTimers();
    setShowProfileModal(false);
    setCallType(type);
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setIsCameraOn(true);
    setCallStatus('connecting');
    setCallModalVisible(true);

    if (socket?.emit) {
      socket.emit('call:initiate', {
        to: user.id,
        type,
        timestamp: new Date().toISOString(),
      });
    }

    scheduleCallTimeout(() => setCallStatus('ringing'), 350);
    scheduleCallTimeout(() => {
      setCallStatus('connected');
      if (socket?.emit) {
        socket.emit('call:connected', {
          to: user.id,
          type,
          timestamp: new Date().toISOString(),
        });
      }
    }, 1800);
  }, [isGroup, warning, clearCallTimers, socket, user.id, scheduleCallTimeout]);

  const handleEndCall = useCallback(() => {
    try {
      if (currentCallId) {
      }
      if (socket?.emit) {
        socket.emit('call:end', {
          to: user.id,
          type: callType,
          timestamp: new Date().toISOString(),
        });
      }
      setCallStatus((prev) => (prev === 'connected' ? 'ended' : 'cancelled'));
      clearCallTimers();
      scheduleCallTimeout(() => {
        closeCallModal();
      }, 600);
    } catch (err) {
    }
  }, [socket, user.id, callType, clearCallTimers, scheduleCallTimeout, closeCallModal, currentCallId, callAPI]);

  const toggleMute = useCallback(() => {
    if (callControlsDisabled) return;
    setIsMuted((prev) => !prev);
  }, [callControlsDisabled]);

  const toggleSpeaker = useCallback(() => {
    if (callControlsDisabled) return;
    setIsSpeakerOn((prev) => !prev);
  }, [callControlsDisabled]);

  const toggleCamera = useCallback(() => {
    if (callControlsDisabled) return;
    setIsCameraOn((prev) => !prev);
  }, [callControlsDisabled]);

  // Вычисляем отступы для контента FlatList
  const getContentContainerPadding = () => {
    return 12 + (insets.bottom || 0);
  };

  // Таймер для отсчёта времени звонка
  useEffect(() => {
    if (callStatus === 'connected' && callModalVisible) {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [callStatus, callModalVisible]);

  return (
    <GestureHandlerRootView style={[{ flex: 1 }, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: getAdaptiveColors().headerBg, paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={'#FF9500'} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.groupInfo}
            onPress={() => setShowProfileModal(true)}
          >
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.groupAvatarImage} />
            ) : (
              <View style={styles.groupAvatar}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: getAdaptiveColors().headerText }}>
                  {displayInitial}
                </Text>
              </View>
            )}
            <View>
              <Text style={[styles.headerTitle, { color: getAdaptiveColors().headerText }]}>{displayName}</Text>
              {isGroup ? (
                <Text style={[styles.memberCount, { color: getAdaptiveColors().lightText }]}>
                  {memberCount} участников
                </Text>
              ) : (
                <>
                  {isUserTyping ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TypingIndicator isHeaderMode={true} />
                    </View>
                  ) : (
                    <Text style={[styles.memberCount, { color: getAdaptiveColors().lightText }]}>
                      {contactOnline ? 'В сети' : formatLastSeen(lastSeenTime)}
                    </Text>
                  )}
                </>
              )}
            </View>
          </TouchableOpacity>
          {!isGroup && (
            <>
              <TouchableOpacity 
                style={{ marginRight: 8 }}
                onPress={() => initiateCall('audio')}
              >
                <Ionicons name="call" size={20} color={'#FF9500'} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ marginRight: 8 }}
                onPress={() => initiateCall('video')}
              >
                <Ionicons name="videocam" size={20} color={'#FF9500'} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={handleGroupMenu}>
            <Ionicons name="ellipsis-vertical" size={20} color={'#FF9500'} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={[styles.container, { flex: 1, backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { flex: 1, backgroundColor: theme.background }]}>
          <View style={[styles.chatContainer, { flex: 1 }]}>
            {/* Кастомный фон */}
            {chatBackground === 'custom' && customBackgroundImage && (
              <Image 
                source={{ uri: customBackgroundImage }}
                style={styles.chatBackgroundImage}
                resizeMode="cover"
              />
            )}
            
            {/* Основной контент чата */}
            <View style={[styles.chatContentOverlay, { backgroundColor: chatBackground === 'custom' ? 'transparent' : getBackgroundColor() }]}>
          {/* Панель закреплённых сообщений */}
          <PinnedMessagesBar 
            pinnedMessages={messages.filter(m => pinnedMessages.includes(m.id))}
            onPinnedMessagePress={(message) => {
              // Скролим к закреплённому сообщению
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

          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item, index) => {
              // ⭐ КРИТИЧНО: Основано на type для уникальных ключей
              if (item.type === 'date') {
                return `date-separator-${index}-${new Date(item.date).getTime()}`;
              }
              return `message-${item.id}`;
            }}
            extraData={messages}
            style={styles.messagesList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.messagesContainer, 
              { paddingBottom: getContentContainerPadding() }
            ]}
            onContentSizeChange={() => {
              // ⚡ При первом открытии скроллим мгновенно (без анимации)
              // Используем setTimeout чтобы FlatList успел отрендерить все элементы
              if (!isInitialScrollDone.current && messages.length > 0) {
                isInitialScrollDone.current = true;
                setTimeout(() => scrollToBottom(false), 50);
              }
            }}
            onLayout={() => {
              // ⚡ При первом layout тоже скроллим мгновенно
              if (!isInitialScrollDone.current && messages.length > 0) {
                isInitialScrollDone.current = true;
                setTimeout(() => scrollToBottom(false), 50);
              }
            }}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={{
              itemVisiblePercentThreshold: 50,
              waitForInteraction: false
            }}
            scrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={50}
            initialNumToRender={15}
            removeClippedSubviews={true}
            windowSize={10}
            scrollEventThrottle={16}
            onEndReached={({ distanceFromEnd }) => {
              if (distanceFromEnd < 100 && hasMoreMessages && !isLoadingMore) {
                loadMoreMessages();
              }
            }}
            onEndReachedThreshold={0.5}
          />
          
          {/* Контейнер для поля ввода */}
          <View 
            style={styles.inputContainer}
          >
            {isRecordingVoice && (
              <View style={[styles.voiceRecordingPanel, { backgroundColor: theme.primary + '10', borderBottomColor: theme.primary + '30' }]}>
                <Animated.View 
                  style={[
                    styles.recordingIndicatorDot,
                    { backgroundColor: '#EF4444', transform: [{ scale: pulseAnim }] }
                  ]}
                />
                <View style={styles.recordingStatusText}>
                  <Text style={[styles.recordingTitle, { color: getAdaptiveColors().textColor }]}>🎤 Запись голоса</Text>
                  <Text style={[styles.recordingSubtext, { color: getAdaptiveColors().lightText }]}>
                    Время: {Math.floor(voiceRecordingDuration)}с
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.recordingCancelBtn, { backgroundColor: theme.accent + '20' }]}
                  onPress={async () => {
                    if (voiceRecordingIntervalRef.current) {
                      clearInterval(voiceRecordingIntervalRef.current);
                      voiceRecordingIntervalRef.current = null;
                    }
                    setIsRecordingVoice(false);
                    await audioRecorder.cancelRecording();
                    isProcessingVoiceRef.current = false;
                  }}
                >
                  <Ionicons name="close" size={18} color={theme.accent} />
                </TouchableOpacity>
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
              <TouchableOpacity style={styles.mediaButton} onPress={pickMedia}>
                <Ionicons name="attach" size={20} color="#667eea" />
              </TouchableOpacity>
              <TextInput
                ref={newMessageInputRef}
                style={[styles.textInput, { color: getAdaptiveColors().textColor }]}
                value={newMessage}
                onChangeText={(text) => {
                  setNewMessage(text);
                  
                  // Отправляем событие "печатает"
                  if (socket) {
                    if (isGroup) {
                      socket.emit('group_user_typing', { 
                        group_id: user.id,
                        user_id: currentUser?.id,
                        username: currentUser?.username,
                        is_typing: text.length > 0
                      });
                    } else {
                      socket.emit('user_typing', { 
                        from_user_id: currentUser?.id,
                        from_user_username: currentUser?.username,
                        to_user_id: user.id,
                        is_typing: text.length > 0
                      });
                    }
                  }
                  
                  // Отменяем предыдущий таймер
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                  }
                  
                  // Устанавливаем новый таймер для отправки события "перестал печатать"
                  if (text.length > 0) {
                    typingTimeoutRef.current = setTimeout(() => {
                      if (socket) {
                        if (isGroup) {
                          socket.emit('group_user_typing', { 
                            group_id: user.id,
                            user_id: currentUser?.id,
                            is_typing: false
                          });
                        } else {
                          socket.emit('user_typing', { 
                            from_user_id: currentUser?.id,
                            from_user_username: currentUser?.username,
                            to_user_id: user.id,
                            is_typing: false
                          });
                        }
                      }
                    }, 3000);
                  }
                }}
                placeholder="Сообщение..."
                placeholderTextColor={getAdaptiveColors().lightText}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity 
                style={styles.voiceButton}
                onPressIn={handleVoiceButtonPressIn}
                onPressOut={handleVoiceButtonPressOut}
                activeOpacity={0.7}
              >
                {isRecordingVoice ? (
                  <View style={[styles.voiceRecordingIndicator, { backgroundColor: theme.primary + '20' }]}>
                    <Animated.View 
                      style={[
                        styles.recordingPulse,
                        { transform: [{ scale: pulseAnim }] }
                      ]}
                    >
                      <View style={[styles.recordingDot, { backgroundColor: '#EF4444' }]} />
                    </Animated.View>
                    <Text style={[styles.recordingTime, { color: '#EF4444' }]}>
                      {Math.floor(voiceRecordingDuration)}s
                    </Text>
                  </View>
                ) : (
                  <Ionicons name="mic" size={16} color="#667eea" />
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.videoCircleButton}
                onPress={() => setVideoCircleRecorderVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="radio-button-on" size={16} color="#667eea" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()}>
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

        {/* Меню чата */}
        <Modal
          visible={chatMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setChatMenuVisible(false)}
        >
          <TouchableOpacity 
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setChatMenuVisible(false)}
          >
            <View style={[styles.chatMenu, { backgroundColor: theme.surface }]}>
              {!isGroup && (
                <>
                  <TouchableOpacity 
                    style={styles.menuItem}
                    onPress={() => {
                      setChatMenuVisible(false);
                      setBackgroundModalVisible(true);
                    }}
                  >
                    <Ionicons name="image-outline" size={20} color={theme.text} />
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Сменить фон</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.menuItem}
                    onPress={() => {
                      setChatMenuVisible(false);
                      // Действие для очистки чата
                      info('Очистить чат', 'Вы уверены что хотите очистить историю чата?', {
                        buttons: [
                          { text: 'Отмена', color: '#ccc' },
                          {
                            text: 'Очистить',
                            color: '#FF9500',
                            onPress: handleClearChat
                          }
                        ],
                        autoClose: false
                      });
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color={theme.text} />
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Очистить чат</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.menuItem}
                    onPress={() => {
                      setChatMenuVisible(false);
                      setSearchModalVisible(true);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <Ionicons name="search-outline" size={20} color={theme.text} />
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Поиск в чате</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.menuItem}
                    onPress={() => {
                      setChatMenuVisible(false);
                      // Переключаем уведомления
                      toggleNotifications(!notificationsEnabled);
                    }}
                  >
                    <Ionicons name={notificationsEnabled ? "notifications" : "notifications-off-outline"} size={20} color={theme.text} />
                    <Text style={[styles.menuItemText, { color: theme.text }]}>
                      {notificationsEnabled ? 'Отключить уведомления' : 'Включить уведомления'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.menuItem, styles.menuItemDanger]}
                    onPress={() => {
                      setChatMenuVisible(false);
                      info('Удалить чат', 'Вы уверены что хотите удалить этот чат?', {
                        buttons: [
                          { text: 'Отмена', color: '#ccc' },
                          {
                            text: 'Удалить',
                            color: '#FF3B30',
                            onPress: handleDeleteChat
                          }
                        ],
                        autoClose: false
                      });
                    }}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color="#FF3B30" />
                    <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Удалить чат</Text>
                  </TouchableOpacity>
                </>
              )}
              {isGroup && (
                <>
                  <TouchableOpacity 
                    style={styles.menuItem}
                    onPress={() => {
                      setChatMenuVisible(false);
                      warning('Группа', 'Информация о группе');
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={20} color={theme.text} />
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Информация</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.menuItem}
                    onPress={() => {
                      setChatMenuVisible(false);
                      setMembersLoading(true);
                      fetchGroupMembers({ skipSpinner: false });
                    }}
                  >
                    <Ionicons name="people-outline" size={20} color={theme.text} />
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Участники</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.menuItem, styles.menuItemDanger]}
                    onPress={() => {
                      setChatMenuVisible(false);
                      info('Выйти из группы', 'Вы уверены что хотите выйти из группы?', {
                        buttons: [
                          { text: 'Отмена', color: '#ccc' },
                          {
                            text: 'Выйти',
                            color: '#FF3B30',
                            onPress: async () => {
                              try {
                                await groupAPI.leaveGroup(user.id);
                                success('Успех', 'Вы вышли из группы');
                                navigation.goBack();
                              } catch (err) {
                                error('Ошибка', 'Не удалось выйти из группы');
                              }
                            }
                          }
                        ],
                        autoClose: false
                      });
                    }}
                  >
                    <Ionicons name="exit-outline" size={20} color="#FF3B30" />
                    <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Выйти из группы</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Модаль поиска */}
        <Modal
          visible={searchModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSearchModalVisible(false)}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
              <TouchableOpacity 
                onPress={() => setSearchModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Поиск в чате</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* Поисковая строка */}
            <View style={[styles.searchContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Поиск сообщений..."
                placeholderTextColor={theme.textSecondary}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Результаты поиска */}
            <FlatList
              data={searchResults}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.searchResultItem, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
                  onPress={() => {
                    setSearchModalVisible(false);
                    flatListRef.current?.scrollToIndex({
                      index: messages.findIndex(m => m.id === item.id),
                      animated: true,
                      viewPosition: 0.5,
                    });
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.searchResultText, { color: theme.text }]} numberOfLines={2}>
                      {item.message}
                    </Text>
                    <Text style={[styles.searchResultTime, { color: theme.textSecondary }]}>
                      {new Date(item.created_at).toLocaleString('ru-RU')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id.toString()}
              ListEmptyComponent={
                searchQuery.length > 0 ? (
                  <View style={[styles.emptySearchState, { backgroundColor: theme.background }]}>
                    <Ionicons name="search" size={48} color={theme.textSecondary} />
                    <Text style={[styles.emptySearchText, { color: theme.textSecondary }]}>
                      Нет результатов поиска
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.emptySearchState, { backgroundColor: theme.background }]}>
                    <Ionicons name="search" size={48} color={theme.textSecondary} />
                    <Text style={[styles.emptySearchText, { color: theme.textSecondary }]}>
                      Введите текст для поиска
                    </Text>
                  </View>
                )
              }
              contentContainerStyle={{ flexGrow: 1 }}
            />
          </SafeAreaView>
        </Modal>
        
        <Modal
          visible={showProfileModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowProfileModal(false)}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
              <TouchableOpacity 
                onPress={() => setShowProfileModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Профиль</Text>
              <View style={{ width: 24 }} />
            </View>
            
            <ScrollView 
              style={[styles.profileContent, { backgroundColor: theme.background }]}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              {/* Avatar Section */}
              <View style={[styles.profileHeader, { backgroundColor: theme.surface }]}>
                <TouchableOpacity 
                  onPress={isGroup ? pickGroupAvatar : null}
                  disabled={!isGroup || groupAvatarUpdating}
                  style={{ position: 'relative' }}
                >
                  {displayAvatar ? (
                    <Image source={{ uri: displayAvatar }} style={styles.profileAvatar} />
                  ) : (
                    <View style={[
                      styles.profileAvatarPlaceholder,
                      { backgroundColor: theme.primary }
                    ]}>
                      <Text style={styles.profileAvatarText}>{displayInitial}</Text>
                    </View>
                  )}
                  {isGroup && (
                    <View style={[styles.avatarEditBadge, { backgroundColor: theme.primary }]}>
                      {groupAvatarUpdating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="camera" size={16} color="#fff" />
                      )}
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={[styles.profileName, { color: theme.text }]}>{displayName}</Text>
                {isGroup ? (
                  <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                    {memberCount} участников
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                      {user.email || 'Не указан'}
                    </Text>
                    {contactOnline && (
                      <View style={[styles.statusBadge, { backgroundColor: theme.success }]}>
                        <Text style={styles.statusBadgeText}>В сети</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
              
              {!isGroup && (
                <View style={[styles.profileActionsCard, { backgroundColor: theme.surface }]}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      (friendStatus === 'friend' || friendStatus === 'pending' || friendRequestLoading) && styles.actionButtonDisabled,
                    ]}
                    onPress={handleSendFriendRequest}
                    disabled={friendStatus !== 'none' || friendRequestLoading}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: theme.primary + '20' }]}>
                      <Ionicons
                        name={
                          friendStatus === 'friend'
                            ? 'checkmark'
                            : friendStatus === 'pending'
                            ? 'time'
                            : 'person-add'
                        }
                        size={20}
                        color={
                          friendStatus === 'friend'
                            ? theme.success
                            : friendStatus === 'pending'
                            ? theme.textSecondary
                            : theme.primary
                        }
                      />
                    </View>
                    <Text style={[
                      styles.actionText,
                      { color: theme.text },
                      (friendStatus === 'friend' || friendStatus === 'pending') && { color: theme.textSecondary }
                    ]}>
                      {friendRequestLoading
                        ? 'Отправка...'
                        : friendStatus === 'friend'
                        ? 'В друзьях'
                        : friendStatus === 'pending'
                        ? 'Заявка отправлена'
                        : 'Добавить в друзья'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              
              <View style={[styles.profileInfo, { backgroundColor: theme.surface }]}>
                {isGroup ? (
                  <>
                    {/* Add Members Button - Top Action */}
                    <TouchableOpacity 
                      style={[styles.addMembersFloatingButton, { backgroundColor: theme.primary }]}
                      onPress={openAddMembersModal}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="person-add" size={24} color="#fff" />
                      <Text style={styles.addMembersFloatingButtonText}>Добавить</Text>
                    </TouchableOpacity>

                    {/* Members List Section */}
                    <View style={styles.groupMembersSection}>
                      <View style={styles.groupMembersHeader}>
                        <Text style={[styles.groupMembersTitle, { color: theme.text }]}>
                          👥 Участники ({memberCount})
                        </Text>
                        <TouchableOpacity
                          onPress={refreshGroupMembers}
                          style={[styles.groupMembersRefreshButton, { borderColor: theme.primary }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {membersLoading ? (
                            <ActivityIndicator size="small" color={theme.primary} />
                          ) : (
                            <Ionicons name="refresh" size={18} color={theme.primary} />
                          )}
                        </TouchableOpacity>
                      </View>

                      {Array.isArray(groupMembers) && groupMembers.length > 0 ? (
                        <ScrollView
                          style={styles.groupMembersScroll}
                          contentContainerStyle={styles.groupMembersScrollContent}
                          showsVerticalScrollIndicator={false}
                          scrollEnabled={true}
                        >
                          {groupMembers.map((member, index) => (
                            <View
                              key={`group-member-${member.id}`}
                              style={[
                                styles.groupMemberCard,
                                {
                                  backgroundColor: theme.background,
                                  borderColor: theme.border,
                                }
                              ]}
                            >
                              <View style={{ position: 'relative' }}>
                                {member.avatar ? (
                                  <Image source={{ uri: member.avatar }} style={styles.memberCardAvatar} />
                                ) : (
                                  <View style={[styles.memberCardPlaceholder, { backgroundColor: theme.primary }]}>
                                    <Text style={styles.memberCardInitial}>
                                      {member.username?.[0]?.toUpperCase?.() || 'U'}
                                    </Text>
                                  </View>
                                )}
                                {member.is_online && (
                                  <View style={[styles.onlineBadge, { backgroundColor: '#4CAF50' }]} />
                                )}
                              </View>
                              
                              <View style={styles.memberCardContent}>
                                <View style={styles.memberCardHeader}>
                                  <Text style={[styles.memberCardName, { color: theme.text }]} numberOfLines={1}>
                                    {member.username}
                                  </Text>
                                  {member.role === 'admin' && (
                                    <View style={[styles.memberBadge, { backgroundColor: theme.primary + '25' }]}>
                                      <Text style={[styles.memberBadgeText, { color: theme.primary }]}>👑</Text>
                                    </View>
                                  )}
                                </View>
                                
                                <View style={styles.memberCardStatus}>
                                  {member.is_online ? (
                                    <>
                                      <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
                                      <Text style={[styles.statusText, { color: '#4CAF50' }]}>В сети</Text>
                                    </>
                                  ) : (
                                    <>
                                      <View style={[styles.statusDot, { backgroundColor: '#9E9E9E' }]} />
                                      <Text style={[styles.statusText, { color: '#9E9E9E' }]}>Оффлайн</Text>
                                    </>
                                  )}
                                </View>
                              </View>

                              <TouchableOpacity 
                                style={[styles.memberRemoveButton, { backgroundColor: '#FF6B6B' }]}
                                onPress={() => handleRemoveMember(member.id, member.username)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="close" size={18} color="#fff" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <View style={styles.emptyMembersContainer}>
                          <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
                          <Text style={[styles.emptyMembersText, { color: theme.textSecondary }]}>
                            Нет участников
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={styles.infoItem} onPress={openUserProfileScreen}>
                      <View style={[styles.infoIcon, { backgroundColor: theme.primary + '15' }]}>
                        <Ionicons name="information-circle" size={20} color={theme.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: theme.text }]}>О пользователе</Text>
                        {user.bio && (
                          <Text style={[styles.infoBio, { color: theme.textSecondary }]} numberOfLines={2}>
                            {user.bio}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                    </TouchableOpacity>
                    <View style={styles.infoItem}>
                      <View style={styles.notificationRowLeft}>
                        <View style={[styles.infoIcon, { backgroundColor: theme.primary + '15' }]}>
                          <Ionicons name="notifications" size={20} color={theme.primary} />
                        </View>
                        <View style={styles.notificationTextBlock}>
                          <Text style={[styles.infoLabel, { color: theme.text }]}>Уведомления</Text>
                          <Text style={[styles.notificationSubtext, { color: theme.textSecondary }]}>
                            Получать уведомления о новых сообщениях
                          </Text>
                        </View>
                      </View>
                      {notificationsLoading ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <Switch
                          value={notificationsEnabled}
                          onValueChange={toggleNotifications}
                          trackColor={{ false: theme.textLight, true: theme.primary }}
                          thumbColor="#fff"
                        />
                      )}
                    </View>
                    
                    <View style={styles.infoItem}>
                      <View style={[styles.infoIcon, { backgroundColor: theme.primary + '15' }]}>
                        <Ionicons name="shield-checkmark" size={20} color={theme.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: theme.text }]}>Конфиденциальность</Text>
                        <Text style={[styles.infoSubtext, { color: theme.textSecondary }]}>Приватный чат</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                    </View>
                  </>
                )}
              </View>
                  
              {/* 🖼️ РАЗДЕЛ МЕДИА */}
              <View style={[styles.profileMediaSection, { backgroundColor: theme.surface }]}>
                  {/* Вкладки */}
                  <View style={[styles.mediaTabsContainer, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity 
                      style={[styles.mediaTab, mediaTab === 'photos' && styles.mediaTabActive, mediaTab === 'photos' && { borderBottomColor: theme.primary }]}
                      onPress={() => setMediaTab('photos')}
                    >
                      <Ionicons name={mediaTab === 'photos' ? "images" : "images-outline"} size={22} color={mediaTab === 'photos' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.mediaTabText, { color: mediaTab === 'photos' ? theme.primary : theme.textSecondary }]}>
                        Фото
                      </Text>
                      {profileMedia.photos.length > 0 && (
                        <View style={[styles.mediaTabBadge, { backgroundColor: theme.primary }]}>
                          <Text style={styles.mediaTabBadgeText}>{profileMedia.photos.length}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.mediaTab, mediaTab === 'videos' && styles.mediaTabActive, mediaTab === 'videos' && { borderBottomColor: theme.primary }]}
                      onPress={() => setMediaTab('videos')}
                    >
                      <Ionicons name={mediaTab === 'videos' ? "videocam" : "videocam-outline"} size={22} color={mediaTab === 'videos' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.mediaTabText, { color: mediaTab === 'videos' ? theme.primary : theme.textSecondary }]}>
                        Видео
                      </Text>
                      {profileMedia.videos.length > 0 && (
                        <View style={[styles.mediaTabBadge, { backgroundColor: theme.primary }]}>
                          <Text style={styles.mediaTabBadgeText}>{profileMedia.videos.length}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.mediaTab, mediaTab === 'links' && styles.mediaTabActive, mediaTab === 'links' && { borderBottomColor: theme.primary }]}
                      onPress={() => setMediaTab('links')}
                    >
                      <Ionicons name={mediaTab === 'links' ? "link" : "link-outline"} size={22} color={mediaTab === 'links' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.mediaTabText, { color: mediaTab === 'links' ? theme.primary : theme.textSecondary }]}>
                        Ссылки
                      </Text>
                      {profileMedia.links.length > 0 && (
                        <View style={[styles.mediaTabBadge, { backgroundColor: theme.primary }]}>
                          <Text style={styles.mediaTabBadgeText}>{profileMedia.links.length}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.mediaTab, mediaTab === 'voice' && styles.mediaTabActive, mediaTab === 'voice' && { borderBottomColor: theme.primary }]}
                      onPress={() => setMediaTab('voice')}
                    >
                      <Ionicons name={mediaTab === 'voice' ? "mic" : "mic-outline"} size={22} color={mediaTab === 'voice' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.mediaTabText, { color: mediaTab === 'voice' ? theme.primary : theme.textSecondary }]}>
                        ГС
                      </Text>
                      {profileMedia.voice.length > 0 && (
                        <View style={[styles.mediaTabBadge, { backgroundColor: theme.primary }]}>
                          <Text style={styles.mediaTabBadgeText}>{profileMedia.voice.length}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                  
                  {/* Контент вкладки */}
                  <View style={styles.mediaContent}>
                      {profileMediaLoading ? (
                        <View style={styles.mediaLoadingContainer}>
                          <ActivityIndicator size="large" color={theme.primary} />
                          <Text style={[styles.mediaLoadingText, { color: theme.textSecondary }]}>Загрузка...</Text>
                        </View>
                      ) : (
                        <>
                          {/* Фото */}
                          {mediaTab === 'photos' && (
                            profileMedia.photos.length > 0 ? (
                              <View style={styles.mediaGrid}>
                                {profileMedia.photos.map((item, index) => (
                                  <TouchableOpacity 
                                    key={`photo-${item.id || index}`}
                                    style={styles.mediaGridItem}
                                    onPress={() => {
                                      setSelectedPhotoUri(item.media_url);
                                      setFullscreenPhotoVisible(true);
                                    }}
                                  >
                                    <Image source={{ uri: item.media_url }} style={styles.mediaGridImage} />
                                  </TouchableOpacity>
                                ))}
                              </View>
                            ) : (
                              <View style={styles.mediaEmptyContainer}>
                                <Ionicons name="images-outline" size={48} color={theme.textSecondary} />
                                <Text style={[styles.mediaEmptyText, { color: theme.textSecondary }]}>Нет фото</Text>
                              </View>
                            )
                          )}
                          
                          {/* Видео */}
                          {mediaTab === 'videos' && (
                            profileMedia.videos.length > 0 ? (
                              <View style={styles.mediaGrid}>
                                {profileMedia.videos.map((item, index) => (
                                  <TouchableOpacity 
                                    key={`video-${item.id || index}`}
                                    style={styles.mediaGridItem}
                                    onPress={() => {
                                      setSelectedVideo(item);
                                      setVideoPlayerVisible(true);
                                    }}
                                  >
                                    {/* Видео превью с обложкой */}
                                    <Video
                                      source={{ uri: item.media_url }}
                                      style={styles.mediaGridImage}
                                      resizeMode="cover"
                                      shouldPlay={false}
                                      isMuted={true}
                                      positionMillis={1000}
                                      onLoad={(status) => {
                                        if (status.durationMillis) {
                                          setVideoDurations(prev => ({
                                            ...prev,
                                            [item.id]: status.durationMillis
                                          }));
                                        }
                                      }}
                                    />
                                    {/* Иконка play поверх */}
                                    <View style={styles.videoPlayOverlay}>
                                      <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.9)" />
                                    </View>
                                    {/* Длительность видео */}
                                    {videoDurations[item.id] && (
                                      <View style={styles.videoDurationBadge}>
                                        <Text style={styles.videoDurationText}>
                                          {Math.floor(videoDurations[item.id] / 60000)}:{String(Math.floor((videoDurations[item.id] % 60000) / 1000)).padStart(2, '0')}
                                        </Text>
                                      </View>
                                    )}
                                  </TouchableOpacity>
                                ))}
                              </View>
                            ) : (
                              <View style={styles.mediaEmptyContainer}>
                                <Ionicons name="videocam-outline" size={48} color={theme.textSecondary} />
                                <Text style={[styles.mediaEmptyText, { color: theme.textSecondary }]}>Нет видео</Text>
                              </View>
                            )
                          )}
                          
                          {/* Ссылки */}
                          {mediaTab === 'links' && (
                            profileMedia.links.length > 0 ? (
                              <ScrollView style={styles.mediaListScroll}>
                                {profileMedia.links.map((item, index) => (
                                  <TouchableOpacity 
                                    key={`link-${item.id || index}`}
                                    style={[styles.mediaLinkItem, { borderBottomColor: theme.border }]}
                                    onPress={() => {
                                      // Открыть ссылку
                                    }}
                                  >
                                    <View style={[styles.mediaLinkIcon, { backgroundColor: theme.primary + '15' }]}>
                                      <Ionicons name="link" size={20} color={theme.primary} />
                                    </View>
                                    <View style={styles.mediaLinkContent}>
                                      <Text style={[styles.mediaLinkText, { color: theme.primary }]} numberOfLines={1}>
                                        {item.url || item.message}
                                      </Text>
                                      <Text style={[styles.mediaLinkDate, { color: theme.textSecondary }]}>
                                        {new Date(item.created_at).toLocaleDateString('ru-RU')}
                                      </Text>
                                    </View>
                                    <Ionicons name="open-outline" size={18} color={theme.textSecondary} />
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            ) : (
                              <View style={styles.mediaEmptyContainer}>
                                <Ionicons name="link-outline" size={48} color={theme.textSecondary} />
                                <Text style={[styles.mediaEmptyText, { color: theme.textSecondary }]}>Нет ссылок</Text>
                              </View>
                            )
                          )}
                          
                          {/* Голосовые сообщения */}
                          {mediaTab === 'voice' && (
                            profileMedia.voice.length > 0 ? (
                              <ScrollView style={styles.mediaListScroll}>
                                {profileMedia.voice.map((item, index) => (
                                  <View 
                                    key={`voice-${item.id || index}`}
                                    style={[styles.mediaVoiceItem, { borderBottomColor: theme.border }]}
                                  >
                                    <View style={[styles.mediaVoiceIcon, { backgroundColor: theme.primary + '15' }]}>
                                      <Ionicons name="mic" size={20} color={theme.primary} />
                                    </View>
                                    <View style={styles.mediaVoiceContent}>
                                      <Text style={[styles.mediaVoiceDuration, { color: theme.text }]}>
                                        Голосовое сообщение
                                      </Text>
                                      <Text style={[styles.mediaVoiceDate, { color: theme.textSecondary }]}>
                                        {new Date(item.created_at).toLocaleDateString('ru-RU')}
                                      </Text>
                                    </View>
                                    <TouchableOpacity style={[styles.mediaVoicePlay, { backgroundColor: theme.primary }]}>
                                      <Ionicons name="play" size={16} color="#fff" />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                              </ScrollView>
                            ) : (
                              <View style={styles.mediaEmptyContainer}>
                                <Ionicons name="mic-outline" size={48} color={theme.textSecondary} />
                                <Text style={[styles.mediaEmptyText, { color: theme.textSecondary }]}>Нет голосовых</Text>
                              </View>
                            )
                          )}
                        </>
                      )}
                  </View>
                </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal
          visible={addMembersModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeAddMembersModal}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
              <TouchableOpacity onPress={closeAddMembersModal}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Добавить участников</Text>
              <View style={{ width: 24 }} />
            </View>
            <View style={styles.modalContent}>
              <View style={[styles.searchInputContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="search" size={18} color={theme.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Поиск по друзьям..."
                  placeholderTextColor={theme.textSecondary}
                  value={addMembersQuery}
                  onChangeText={setAddMembersQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {addMembersQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setAddMembersQuery('')}>
                    <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {addMembersLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.primary} />
                </View>
              ) : (
                <FlatList
                  data={filteredAvailableMembers}
                  renderItem={renderAvailableMemberItem}
                  keyExtractor={(item) => `candidate-${item.id}`}
                  contentContainerStyle={styles.membersList}
                  keyboardShouldPersistTaps="handled"
                  ListHeaderComponent={
                    <View style={styles.addMembersHint}>
                      <Ionicons name="information-circle" size={16} color={theme.textSecondary} />
                      <Text style={[styles.addMembersHintText, { color: theme.textSecondary }]}>
                        Нажмите «Добавить», чтобы сразу пригласить друга в группу.
                      </Text>
                    </View>
                  }
                  ListEmptyComponent={
                    <View style={styles.modalEmptyState}>
                      <Ionicons name={availableMembers.length === 0 ? 'person-add-outline' : 'search'} size={48} color={theme.textSecondary} />
                      <Text style={[styles.modalEmptyText, { color: theme.textSecondary }]}>
                        {availableMembers.length === 0
                          ? 'Нет друзей, которых можно добавить в эту группу'
                          : 'Не найдено участников по вашему запросу'}
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          </SafeAreaView>
        </Modal>

        <Modal
          visible={callModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleEndCall}
        >
          <LinearGradient
            colors={callGradient}
            style={styles.callModalBackdrop}
          >
            <View style={[styles.callModalCard, { backgroundColor: callCardBackground }]}>
              <View style={styles.callModalHeaderRow}>
                <View />
                <TouchableOpacity onPress={handleEndCall} activeOpacity={0.7}>
                  <Ionicons name="close" size={24} color={callPrimaryText} />
                </TouchableOpacity>
              </View>
              {displayAvatar ? (
                <Image source={{ uri: displayAvatar }} style={styles.callModalAvatarImage} />
              ) : (
                <View style={styles.callModalAvatarPlaceholder}>
                  <Text style={styles.callModalAvatarText}>{displayInitial}</Text>
                </View>
              )}
              <Text style={[styles.callModalName, { color: callPrimaryText }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[styles.callModalStatus, { color: callSecondaryText }]}>
                {callStatusLabel}
              </Text>
              {callStatus === 'connected' ? (
                <Text style={[styles.callModalTimer, { color: callPrimaryText }]}>
                  {formatCallDuration(callDuration)}
                </Text>
              ) : (
                <Text style={[styles.callModalHint, { color: callSecondaryText }]}>
                  {callType === 'video' ? 'Видео вызов' : 'Голосовой вызов'}
                </Text>
              )}

              <View style={styles.callControlsRow}>
                <TouchableOpacity
                  style={[
                    styles.callControlButton,
                    isMuted && styles.callControlButtonActive,
                    callControlsDisabled && styles.callControlDisabled,
                  ]}
                  onPress={toggleMute}
                  activeOpacity={0.85}
                  disabled={callControlsDisabled}
                >
                  <Ionicons
                    name={isMuted ? 'mic-off' : 'mic'}
                    size={24}
                    color="#ffffff"
                  />
                  <Text style={styles.callControlLabel}>
                    {isMuted ? 'Микрофон выкл.' : 'Микрофон'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.callControlButton,
                    isSpeakerOn && styles.callControlButtonActive,
                    callControlsDisabled && styles.callControlDisabled,
                  ]}
                  onPress={toggleSpeaker}
                  activeOpacity={0.85}
                  disabled={callControlsDisabled}
                >
                  <Ionicons
                    name={isSpeakerOn ? 'volume-high' : 'volume-medium'}
                    size={24}
                    color="#ffffff"
                  />
                  <Text style={styles.callControlLabel}>
                    {isSpeakerOn ? 'Громкая связь' : 'Динамик'}
                  </Text>
                </TouchableOpacity>

                {callType === 'video' && (
                  <TouchableOpacity
                    style={[
                      styles.callControlButton,
                      !isCameraOn && styles.callControlButtonActive,
                      callControlsDisabled && styles.callControlDisabled,
                    ]}
                    onPress={toggleCamera}
                    activeOpacity={0.85}
                    disabled={callControlsDisabled}
                  >
                    <Ionicons
                      name={isCameraOn ? 'videocam' : 'videocam-off'}
                      size={24}
                      color="#ffffff"
                    />
                    <Text style={styles.callControlLabel}>
                      {isCameraOn ? 'Камера' : 'Камера выкл.'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.callEndButton}
                onPress={handleEndCall}
                activeOpacity={0.85}
              >
                <Ionicons name="call" size={28} color="#fff" style={styles.callEndIcon} />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Modal>

        <MediaCaptionModal
          visible={mediaCaptionModalVisible}
          onClose={() => {
            setMediaCaptionModalVisible(false);
            setPendingMediaUri(null);
            setPendingMediaType(null);
          }}
          onSend={handleMediaCaptionSend}
          mediaUri={pendingMediaUri}
          mediaType={pendingMediaType}
          theme={theme}
        />

        <VoiceRecorderModal
          visible={voiceRecorderModalVisible}
          onCancel={() => setVoiceRecorderModalVisible(false)}
          onSend={handleVoiceMessageSend}
          theme={theme}
        />

        <VideoCircleRecorder
          visible={videoCircleRecorderVisible}
          onClose={() => setVideoCircleRecorderVisible(false)}
          onVideoRecorded={handleVideoCircleRecorded}
          theme={theme}
        />

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

        {/* Модаль полноэкранного просмотра фото */}
        <Modal
          visible={fullscreenPhotoVisible}
          animationType="fade"
          transparent={false}
          onRequestClose={() => setFullscreenPhotoVisible(false)}
        >
          <View style={styles.fullscreenPhotoContainer}>
            {/* Кнопка закрытия */}
            <TouchableOpacity 
              onPress={() => setFullscreenPhotoVisible(false)}
              style={styles.fullscreenCloseButtonFloat}
            >
              <Ionicons name="close" size={28} color={'#FF9500'} />
            </TouchableOpacity>

            {/* Фото по центру */}
            {selectedPhotoUri && (
              <Image 
                source={{ uri: selectedPhotoUri }}
                style={styles.fullscreenPhoto}
                resizeMode="contain"
              />
            )}

            {/* Нижняя панель с функциями */}
            <View style={styles.fullscreenButtonsPanel}>
              <TouchableOpacity 
                style={styles.fullscreenActionButton}
                onPress={() => {
                  Share.share({
                    url: selectedPhotoUri,
                    message: 'Посмотрите это фото!'
                  }).catch(err => console.error(err));
                }}
              >
                <Ionicons name="share-social" size={24} color={'#FF9500'} />
                <Text style={styles.fullscreenActionButtonText}>Поделиться</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.fullscreenActionButton}
                onPress={async () => {
                    try {
                      await navigator.clipboard.writeText(selectedPhotoUri);
                      success('Скопировано', 'URL фото скопирован в буфер обмена');
                    } catch (err) {
                      console.error('Ошибка копирования:', err);
                    }
                  }}
                >
                  <Ionicons name="copy" size={24} color={'#FF9500'} />
                  <Text style={styles.fullscreenActionButtonText}>Копировать URL</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.fullscreenActionButton}
                  onPress={async () => {
                    try {
                      const permissions = await MediaLibrary.requestPermissionsAsync();
                      if (permissions.granted) {
                        await MediaLibrary.saveToLibraryAsync(selectedPhotoUri);
                        success('Сохранено', 'Фото сохранено в галерею');
                      }
                    } catch (err) {
                      console.error('Ошибка сохранения:', err);
                    }
                  }}
                >
                  <Ionicons name="download" size={24} color={'#FF9500'} />
                  <Text style={styles.fullscreenActionButtonText}>Сохранить</Text>
                </TouchableOpacity>
              </View>
          </View>
        </Modal>

        {/* Модаль редактирования сообщения */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setEditModalVisible(false);
            setEditingMessage(null);
            setEditingText('');
          }}
        >
          <TouchableOpacity 
            style={styles.editModalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setEditModalVisible(false);
              setEditingMessage(null);
              setEditingText('');
            }}
          >
            <View style={[styles.editModalCard, { backgroundColor: theme.surface }]}>
              <View style={styles.editModalHeader}>
                <Text style={[styles.editModalTitle, { color: theme.text }]}>
                  Редактировать сообщение
                </Text>
                <TouchableOpacity 
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingMessage(null);
                    setEditingText('');
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              {editingMessage && (
                <>
                  <View style={[styles.editMessagePreview, { backgroundColor: theme.background }]}>
                    <Text style={[styles.editPreviewLabel, { color: theme.textSecondary }]}>
                      Исходное сообщение:
                    </Text>
                    <Text 
                      style={[styles.editPreviewText, { color: theme.text }]}
                      numberOfLines={3}
                    >
                      {editingMessage.message}
                    </Text>
                  </View>

                  <TextInput
                    style={[styles.editMessageInput, { 
                      color: theme.text,
                      borderColor: theme.primary
                    }]}
                    value={editingText}
                    onChangeText={setEditingText}
                    placeholder="Новое сообщение..."
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    maxLength={1000}
                  />

                  <Text style={[styles.editCharCount, { color: theme.textSecondary }]}>
                    {editingText.length}/1000
                  </Text>

                  <View style={styles.editModalButtons}>
                    <TouchableOpacity
                      style={[styles.editCancelBtn, { backgroundColor: theme.background + '80' }]}
                      onPress={() => {
                        setEditModalVisible(false);
                        setEditingMessage(null);
                        setEditingText('');
                      }}
                    >
                      <Text style={[styles.editCancelBtnText, { color: theme.text }]}>
                        Отмена
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.editSaveBtn, { backgroundColor: theme.primary }]}
                      onPress={() => editMessage(editingMessage.id, editingText)}
                    >
                      <Ionicons name="checkmark" size={20} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.editSaveBtnText}>Сохранить</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* 📤 МОДАЛЬНОЕ ОКНО ПЕРЕСЫЛКИ СООБЩЕНИЯ */}
        <Modal
          visible={forwardModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => {
            setForwardModalVisible(false);
            setMessageToForward(null);
            setForwardSearchQuery('');
          }}
        >
          <View style={styles.forwardModalOverlay}>
            <View style={[styles.forwardModalContent, { backgroundColor: theme.surface }]}>
              {/* Заголовок */}
              <View style={[styles.forwardModalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.forwardModalTitle, { color: theme.text }]}>Переслать сообщение</Text>
                <TouchableOpacity onPress={() => {
                  setForwardModalVisible(false);
                  setMessageToForward(null);
                  setForwardSearchQuery('');
                }}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              {/* Поиск */}
              <View style={[styles.forwardSearchContainer, { backgroundColor: theme.background }]}>
                <Ionicons name="search" size={20} color={theme.textSecondary} />
                <TextInput
                  style={[styles.forwardSearchInput, { color: theme.text }]}
                  placeholder="Поиск..."
                  value={forwardSearchQuery}
                  onChangeText={setForwardSearchQuery}
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              
              {/* Превью пересылаемого сообщения */}
              {messageToForward && (
                <View style={[styles.forwardPreview, { backgroundColor: isDark ? 'rgba(102,126,234,0.1)' : '#f0f8ff' }]}>
                  <Text style={[styles.forwardPreviewLabel, { color: theme.textSecondary }]}>Пересылаемое сообщение:</Text>
                  <Text style={[styles.forwardPreviewText, { color: theme.text }]} numberOfLines={2}>
                    {messageToForward.message || '[Медиа]'}
                  </Text>
                </View>
              )}
              
              {/* Список получателей */}
              {forwardLoading ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={{ color: theme.textSecondary, marginTop: 12 }}>Загрузка...</Text>
                </View>
              ) : (
                <FlatList
                  data={forwardRecipients.filter(r => 
                    r.name.toLowerCase().includes(forwardSearchQuery.toLowerCase())
                  )}
                  keyExtractor={(item) => `${item.type}_${item.id}`}
                  renderItem={({ item: recipient }) => (
                    <TouchableOpacity
                      style={[styles.forwardRecipientItem, { borderBottomColor: theme.border }]}
                      onPress={() => forwardMessage(recipient)}
                    >
                      {recipient.avatar ? (
                        <Image
                          source={{ uri: normalizeMediaUrl(recipient.avatar) }}
                          style={styles.forwardRecipientAvatar}
                        />
                      ) : (
                        <View style={[styles.forwardRecipientAvatar, { backgroundColor: theme.primary + '30', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ color: theme.primary, fontSize: 20, fontWeight: '600' }}>
                            {recipient.name?.charAt(0)?.toUpperCase() || '?'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.forwardRecipientInfo}>
                        <Text style={[styles.forwardRecipientName, { color: theme.text }]}>{recipient.name}</Text>
                        <Text style={[styles.forwardRecipientType, { color: theme.textSecondary }]}>
                          {recipient.type === 'group' ? 'Группа' : 'Личный чат'}
                        </Text>
                      </View>
                      <Ionicons name="send" size={20} color={theme.primary} />
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={[styles.forwardEmptyText, { color: theme.textSecondary }]}>
                      {forwardSearchQuery ? 'Ничего не найдено' : 'Нет доступных получателей'}
                    </Text>
                  }
                />
              )}
            </View>
          </View>
        </Modal>

        {/* 🎬 МОДАЛЬНОЕ ОКНО ПРОСМОТРА ВИДЕО */}
        <Modal
          visible={videoPlayerVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setVideoPlayerVisible(false);
            setSelectedVideo(null);
          }}
        >
          <View style={styles.videoPlayerOverlay}>
            {/* Кнопка закрытия */}
            <TouchableOpacity 
              style={styles.videoPlayerCloseBtn}
              onPress={() => {
                setVideoPlayerVisible(false);
                setSelectedVideo(null);
              }}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            
            {/* Видео плеер */}
            {selectedVideo && (
              <Video
                source={{ uri: selectedVideo.media_url }}
                style={styles.fullscreenVideo}
                useNativeControls={true}
                resizeMode="contain"
                shouldPlay={true}
                isLooping={false}
                onError={(error) => {
                  console.error('Ошибка воспроизведения видео:', error);
                  Alert.alert('Ошибка', 'Не удалось воспроизвести видео');
                }}
              />
            )}
            
            {/* Информация о видео */}
            {selectedVideo && (
              <View style={styles.videoInfoBar}>
                <Text style={styles.videoInfoDate}>
                  {selectedVideo.created_at 
                    ? new Date(selectedVideo.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })
                    : ''
                  }
                </Text>
                {videoDurations[selectedVideo.id] && (
                  <Text style={styles.videoInfoDuration}>
                    {Math.floor(videoDurations[selectedVideo.id] / 60000)}:{String(Math.floor((videoDurations[selectedVideo.id] % 60000) / 1000)).padStart(2, '0')}
                  </Text>
                )}
              </View>
            )}
          </View>
        </Modal>

        {/* 🎨 МОДАЛЬНОЕ ОКНО ВЫБОРА ФОНА */}
        <Modal
          visible={backgroundModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setBackgroundModalVisible(false)}
        >
          <View style={styles.backgroundModalOverlay}>
            <View style={[styles.backgroundModalContent, { backgroundColor: theme.surface }]}>
              {/* Заголовок */}
              <View style={[styles.backgroundModalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.backgroundModalTitle, { color: theme.text }]}>Выбрать фон чата</Text>
                <TouchableOpacity onPress={() => setBackgroundModalVisible(false)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              {/* Индикатор загрузки */}
              {backgroundLoading && (
                <View style={[styles.backgroundLoadingOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)' }]}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={{ color: theme.text, marginTop: 12 }}>Загрузка...</Text>
                </View>
              )}
              
              <ScrollView style={styles.backgroundModalScroll} showsVerticalScrollIndicator={false}>
                {/* Кнопка загрузки своего фото */}
                <TouchableOpacity 
                  style={[styles.customBackgroundButton, { borderColor: theme.primary }]}
                  onPress={pickCustomBackground}
                  disabled={backgroundLoading}
                >
                  <View style={[styles.customBackgroundIcon, { backgroundColor: theme.primary + '20' }]}>
                    <Ionicons name="camera" size={28} color={theme.primary} />
                  </View>
                  <View style={styles.customBackgroundInfo}>
                    <Text style={[styles.customBackgroundTitle, { color: theme.text }]}>Загрузить своё фото</Text>
                    <Text style={[styles.customBackgroundSubtitle, { color: theme.textSecondary }]}>
                      Выберите изображение из галереи
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                
                {/* Предустановленные фоны */}
                <Text style={[styles.backgroundSectionTitle, { color: theme.textSecondary }]}>
                  Предустановленные фоны
                </Text>
                
                <View style={styles.backgroundGrid}>
                  {/* Default */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: theme.background, borderColor: chatBackground === 'default' ? theme.primary : theme.border }
                    ]}
                    onPress={() => selectBackground('default')}
                  >
                    <Text style={[styles.backgroundOptionLabel, { color: theme.text }]}>По умолчанию</Text>
                    {chatBackground === 'default' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Light Blue */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: '#E3F2FD', borderColor: chatBackground === 'light-blue' ? theme.primary : '#E3F2FD' }
                    ]}
                    onPress={() => selectBackground('light-blue')}
                  >
                    <Text style={styles.backgroundOptionLabel}>Голубой</Text>
                    {chatBackground === 'light-blue' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Light Green */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: '#E8F5E9', borderColor: chatBackground === 'light-green' ? theme.primary : '#E8F5E9' }
                    ]}
                    onPress={() => selectBackground('light-green')}
                  >
                    <Text style={styles.backgroundOptionLabel}>Зелёный</Text>
                    {chatBackground === 'light-green' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Light Pink */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: '#FCE4EC', borderColor: chatBackground === 'light-pink' ? theme.primary : '#FCE4EC' }
                    ]}
                    onPress={() => selectBackground('light-pink')}
                  >
                    <Text style={styles.backgroundOptionLabel}>Розовый</Text>
                    {chatBackground === 'light-pink' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Light Purple */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: '#F3E5F5', borderColor: chatBackground === 'light-purple' ? theme.primary : '#F3E5F5' }
                    ]}
                    onPress={() => selectBackground('light-purple')}
                  >
                    <Text style={styles.backgroundOptionLabel}>Фиолетовый</Text>
                    {chatBackground === 'light-purple' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Light Orange */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: '#FFF3E0', borderColor: chatBackground === 'light-orange' ? theme.primary : '#FFF3E0' }
                    ]}
                    onPress={() => selectBackground('light-orange')}
                  >
                    <Text style={styles.backgroundOptionLabel}>Оранжевый</Text>
                    {chatBackground === 'light-orange' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Dark Blue */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: '#1E3A8A', borderColor: chatBackground === 'dark-blue' ? theme.primary : '#1E3A8A' }
                    ]}
                    onPress={() => selectBackground('dark-blue')}
                  >
                    <Text style={[styles.backgroundOptionLabel, { color: '#fff' }]}>Тёмно-синий</Text>
                    {chatBackground === 'dark-blue' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: '#fff' }]}>
                        <Ionicons name="checkmark" size={14} color={theme.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Dark Green */}
                  <TouchableOpacity 
                    style={[
                      styles.backgroundOption, 
                      { backgroundColor: '#1B4332', borderColor: chatBackground === 'dark-green' ? theme.primary : '#1B4332' }
                    ]}
                    onPress={() => selectBackground('dark-green')}
                  >
                    <Text style={[styles.backgroundOptionLabel, { color: '#fff' }]}>Тёмно-зелёный</Text>
                    {chatBackground === 'dark-green' && (
                      <View style={[styles.backgroundCheckmark, { backgroundColor: '#fff' }]}>
                        <Ionicons name="checkmark" size={14} color={theme.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
                
                {/* Кнопка сброса */}
                {chatBackground !== 'default' && (
                  <TouchableOpacity 
                    style={[styles.resetBackgroundButton, { borderColor: '#EF4444' }]}
                    onPress={resetBackground}
                    disabled={backgroundLoading}
                  >
                    <Ionicons name="refresh" size={20} color="#EF4444" />
                    <Text style={[styles.resetBackgroundText, { color: '#EF4444' }]}>
                      Сбросить на стандартный
                    </Text>
                  </TouchableOpacity>
                )}
                
                {/* Превью текущего кастомного фона */}
                {chatBackground === 'custom' && customBackgroundImage && (
                  <View style={styles.currentCustomPreview}>
                    <Text style={[styles.backgroundSectionTitle, { color: theme.textSecondary }]}>
                      Текущий кастомный фон
                    </Text>
                    <Image 
                      source={{ uri: customBackgroundImage }}
                      style={styles.customPreviewImage}
                      resizeMode="cover"
                    />
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
    </GestureHandlerRootView>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  dateSeparatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
    paddingHorizontal: 15,
  },
  groupMembersTextBlock: {
    marginLeft: 10,
  },
  notificationRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  notificationTextBlock: {
    marginLeft: 12,
    flex: 1,
  },
  notificationSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(102, 126, 234, 0.15)',
  },
  dateSeparatorBadge: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    borderRadius: 20,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.25)',
  },
  dateSeparatorText: {
    fontSize: 12,
    color: '#667eea',
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: '#1a2e4a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 149, 0, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  headerButton: {
    padding: 10,
    marginHorizontal: 6,
    borderRadius: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    gap: 12,
  },
  backButton: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  userInfoText: {
    flex: 1,
    marginLeft: 14,
  },
  groupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
    gap: 12,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 0,
    borderWidth: 2,
    borderColor: 'rgba(255, 149, 0, 0.3)',
  },
  groupAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 0,
  },
  avatarNew: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholderNew: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 149, 0, 0.3)',
  },
  avatarTextNew: {
    color: '#FF9500',
    fontSize: 18,
    fontWeight: '700',
  },
  headerTitleNew: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  onlineStatusNew: {
    fontSize: 12,
    color: '#c5d0e0',
  },
  memberCount: {
    fontSize: 12,
    color: '#c5d0e0',
  },
  statusRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  statusIndicatorNew: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
  },
  typingContainerHeader: {
    marginTop: 2,
    minHeight: 12,
    justifyContent: 'flex-start',
  },
  moreButton: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 149, 0, 0.3)',
    shadowColor: '#FF9500',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  avatarText: {
    color: '#FF9500',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  onlineStatus: {
    fontSize: 13,
    color: '#c5d0e0',
    marginTop: 2,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
    backgroundColor: '#4CAF50',
  },
  unreadBadgeSmall: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    paddingHorizontal: 6,
    backgroundColor: '#FF9500',
  },
  unreadTextSmall: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  moreButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
  },
  chatContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 12,
  },
  messagesContainer: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
    position: 'relative',
  },
  sentRow: {
    justifyContent: 'flex-end',
  },
  receivedRow: {
    justifyContent: 'flex-start',
  },
  groupMessageRow: {
    alignItems: 'flex-start',
    width: '100%',
    paddingLeft: 44,
  },
  senderAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  senderAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  groupAvatarWrapper: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  groupAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarInitial: {
    fontSize: 13,
    fontWeight: '700',
  },
  messageContainer: {
    maxWidth: width * 0.82,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    marginHorizontal: 2,
    flexShrink: 1,
  },
  sentContainer: {
    alignSelf: 'flex-end',
    maxWidth: width * 0.78,
  },
  receivedContainer: {
    alignSelf: 'flex-start',
    maxWidth: width * 0.68,
  },
  sentMessage: {
    borderBottomRightRadius: 6,
    borderTopLeftRadius: 24,
    backgroundColor: '#667eea',
  },
  receivedMessage: {
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 24,
    backgroundColor: '#f0f2f7',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  groupMessageContent: {
    flexShrink: 1,
    maxWidth: width * 0.85,
  },
  groupMessageContentWithAvatar: {
    flex: 1,
  },
  sentText: {
    color: '#fff',
    fontWeight: '500',
  },
  receivedText: {
    color: '#1a202c',
    fontWeight: '500',
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  sentTime: {
    color: 'rgba(255,255,255,0.75)',
  },
  receivedTime: {
    color: '#718096',
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
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f7f8fc',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    marginHorizontal: 12,
    marginVertical: 0,
    marginBottom: 12,
    gap: 4,
    shadowColor: '#667eea',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a202c',
    maxHeight: 90,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    lineHeight: 20,
    fontWeight: '400',
    backgroundColor: 'transparent',
    borderRadius: 20,
    borderWidth: 0,
    paddingLeft: 8,
  },
  voiceButton: {
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  videoCircleButton: {
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  voiceRecordingIndicator: {
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    flexDirection: 'row',
    gap: 4,
  },
  recordingPulse: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingTime: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 18,
  },
  sendButton: {
    backgroundColor: '#667eea',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginRight: 0,
    shadowColor: '#667eea',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  mediaButton: {
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  profileContent: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  profileAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  profileAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileAvatarText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  statusBadge: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  profileActionsCard: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  profileActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  profileInfo: {
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  infoBio: {
    fontSize: 12,
    marginTop: 2,
  },
  infoSubtext: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  infoText: {
    fontSize: 16,
    flex: 1,
  },
  replyContainer: {
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#667eea',
    opacity: 0.9,
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
  voiceRecordingPanel: {
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
  recordingIndicatorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    flexShrink: 0,
  },
  recordingStatusText: {
    flex: 1,
  },
  recordingTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    color: '#1a202c',
  },
  recordingSubtext: {
    fontSize: 12,
    fontWeight: '500',
    color: '#718096',
  },
  recordingCancelBtn: {
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    backgroundColor: '#f7f8fc',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
    color: '#667eea',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  replyPreviewText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#4a5568',
    fontWeight: '500',
  },
  messageImage: {
    width: width * 0.7,
    height: width * 0.6,
    borderRadius: 14,
    marginBottom: 8,
  },
  captionText: {
    fontSize: 14,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 4,
    fontWeight: '400',
  },
  groupSenderLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  groupSenderLabelSent: {
    color: 'rgba(255,255,255,0.85)',
  },
  messageVideo: {
    width: width * 0.7,
    height: width * 0.6,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#000',
  },
  videoContainer: {
    width: width * 0.7,
    height: width * 0.6,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a202c',
  },
  videoText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  mediaButton: {
    padding: 8,
    marginLeft: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  groupMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  groupMembersSection: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  addMembersFloatingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  addMembersFloatingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  groupMembersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  groupMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  memberCardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
  },
  memberCardPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberCardInitial: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  memberCardContent: {
    flex: 1,
  },
  memberCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  memberCardName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  memberBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  memberBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  memberCardStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  memberRemoveButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  emptyMembersContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyMembersText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 12,
  },
  groupMembersTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupMembersTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  groupMembersSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  groupMembersRefreshButton: {
    padding: 6,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
  },
  groupMembersScroll: {
    maxHeight: 320,
  },
  groupMembersScrollContent: {
    paddingVertical: 2,
  },
  groupMemberAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
  },
  groupMemberPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupMemberInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  groupMemberInfo: {
    flex: 1,
  },
  groupMemberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  groupMemberRole: {
    fontSize: 13,
  },
  groupMemberMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberRoleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  memberRoleChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  memberOnlineBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginLeft: 4,
  },
  memberOnlineText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  membersList: {
    paddingVertical: 8,
  },
  modalEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalEmptyText: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    marginHorizontal: 8,
  },
  addMembersHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  addMembersHintText: {
    fontSize: 13,
    flex: 1,
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#667eea',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  addMemberButtonDisabled: {
    opacity: 0.6,
  },
  addMemberButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  callModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  callModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.88)',
  },
  callModalHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  callModalAvatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginTop: 12,
    marginBottom: 18,
  },
  callModalAvatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginTop: 12,
    marginBottom: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  callModalAvatarText: {
    fontSize: 38,
    fontWeight: '700',
    color: '#ffffff',
  },
  callModalName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  callModalStatus: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  callModalTimer: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  callModalHint: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 20,
    textAlign: 'center',
  },
  callControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 24,
  },
  callControlButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  callControlButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  callControlDisabled: {
    opacity: 0.45,
  },
  callControlLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  callEndButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callEndIcon: {
    transform: [{ rotate: '135deg' }],
    color: '#ffffff',
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 10,
  },
  chatMenu: {
    borderRadius: 12,
    width: 220,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  menuItemDanger: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchResultText: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  searchResultTime: {
    fontSize: 12,
    marginTop: 4,
  },
  emptySearchState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptySearchText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  contextMenuBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  contextMenu: {
    borderRadius: 16,
    overflow: 'hidden',
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  contextMenuItemDanger: {
    borderBottomWidth: 0,
  },
  contextMenuItemText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 14,
    letterSpacing: 0.1,
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
  // Стили для полноэкранного просмотра фото
  fullscreenPhotoContainer: {
    flex: 1,
    backgroundColor: '#0a1428',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenCloseButtonFloat: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 46, 74, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  fullscreenPhoto: {
    width: '100%',
    height: '80%',
  },
  fullscreenButtonsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#1a2e4a',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 149, 0, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 14,
    paddingBottom: 20,
    gap: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fullscreenActionButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 149, 0, 0.08)',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  fullscreenActionButtonText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
    letterSpacing: 0.2,
    color: '#FF9500',
  },
  
  // ✏️ Стили для редактирования сообщений
  editModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 20,
  },
  editModalCard: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  editMessagePreview: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  editPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editPreviewText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  editMessageInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 100,
    maxHeight: 200,
    marginBottom: 8,
    textAlignVertical: 'top',
  },
  editCharCount: {
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 16,
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  editCancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  editSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  editSaveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // ✏️ Индикатор редактирования сообщения
  editedIndicator: {
    fontSize: 10,
    marginLeft: 4,
    fontWeight: '500',
    marginRight: 2,
  },
  editedIndicatorSent: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  editedIndicatorReceived: {
    color: '#999999',
  },
  
  // 🎥 Ошибка загрузки видео
  videoErrorContainer: {
    width: width * 0.7,
    height: width * 0.6,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#f0f2f7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FF6B6B',
    borderStyle: 'dashed',
    padding: 12,
  },
  videoErrorText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
    color: '#FF6B6B',
  },
  videoErrorUrl: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'monospace',
    color: '#999',
  },
  
  // 📤 ПЕРЕСЫЛКА СООБЩЕНИЙ
  forwardedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  forwardedFromText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 4,
  },
  forwardModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  forwardModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  forwardModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  forwardModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  forwardSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  forwardSearchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  forwardPreview: {
    margin: 12,
    marginTop: 0,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#667eea',
  },
  forwardPreviewLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  forwardPreviewText: {
    fontSize: 14,
  },
  forwardRecipientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  forwardRecipientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ddd',
  },
  forwardRecipientInfo: {
    flex: 1,
    marginLeft: 12,
  },
  forwardRecipientName: {
    fontSize: 16,
    fontWeight: '500',
  },
  forwardRecipientType: {
    fontSize: 12,
    marginTop: 2,
  },
  forwardEmptyText: {
    textAlign: 'center',
    padding: 40,
    fontSize: 16,
  },
  forwardSendingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // 🖼️ МЕДИА В ПРОФИЛЕ
  profileMediaSection: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mediaTabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  mediaTab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    position: 'relative',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  mediaTabActive: {
    borderBottomWidth: 2,
  },
  mediaTabText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
  },
  mediaTabBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  mediaTabBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
  },
  mediaContent: {
    minHeight: 160,
    padding: 6,
  },
  mediaLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  mediaLoadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  mediaGridItem: {
    width: (width - 56) / 3,
    aspectRatio: 1,
    margin: 1.5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  mediaGridImage: {
    width: '100%',
    height: '100%',
  },
  mediaGridVideo: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  mediaEmptyText: {
    marginTop: 12,
    fontSize: 14,
  },
  mediaListScroll: {
    maxHeight: 300,
  },
  mediaLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  mediaLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaLinkContent: {
    flex: 1,
    marginLeft: 12,
  },
  mediaLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  mediaLinkDate: {
    fontSize: 12,
    marginTop: 2,
  },
  mediaVoiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  mediaVoiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaVoiceContent: {
    flex: 1,
    marginLeft: 12,
  },
  mediaVoiceDuration: {
    fontSize: 14,
    fontWeight: '500',
  },
  mediaVoiceDate: {
    fontSize: 12,
    marginTop: 2,
  },
  mediaVoicePlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // 🎬 ВИДЕО ПЛЕЕР
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  videoPlayerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenVideo: {
    width: width,
    height: height * 0.8,
  },
  videoInfoBar: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  videoInfoDate: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginRight: 16,
  },
  videoInfoDuration: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // 🎨 ФОН ЧАТА
  chatBackgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  chatContentOverlay: {
    flex: 1,
  },
  
  // Модальное окно выбора фона
  backgroundModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backgroundModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  backgroundModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  backgroundModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backgroundModalScroll: {
    padding: 16,
  },
  backgroundLoadingOverlay: {
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
  
  // Кнопка загрузки своего фото
  customBackgroundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  customBackgroundIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customBackgroundInfo: {
    flex: 1,
    marginLeft: 14,
  },
  customBackgroundTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  customBackgroundSubtitle: {
    fontSize: 13,
  },
  
  // Секция с предустановленными фонами
  backgroundSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  backgroundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  backgroundOption: {
    width: '46%',
    aspectRatio: 1.3,
    margin: '2%',
    borderRadius: 16,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  backgroundOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  backgroundCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Кнопка сброса
  resetBackgroundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 20,
    gap: 8,
  },
  resetBackgroundText: {
    fontSize: 15,
    fontWeight: '600',
  },
  
  // Превью текущего кастомного фона
  currentCustomPreview: {
    marginTop: 20,
  },
  customPreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
  },
});

export default ChatScreen;