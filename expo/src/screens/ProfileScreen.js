import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import { Gyroscope, Accelerometer } from 'expo-sensors';
import { profileAPI, adminAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { disconnectSocket } from '../services/globalSocket';

const ProfileScreen = ({ navigation }) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { error, success, warning, info } = useModalAlert();

  const [profile, setProfile] = useState({
    username: '',
    email: '',
    bio: '',
    status: '',
    avatar: '',
    is_admin: false,
    cardColor: '#FF6B6B', // Цвет карточки профиля
  });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminGroups, setAdminGroups] = useState([]);
  const [adminChats, setAdminChats] = useState([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [chatBackground, setChatBackground] = useState('default');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  
  // RGB управление цветом - ВРЕМЕННЫЕ значения (для предпросмотра)
  const [rgbRed, setRgbRed] = useState(255);
  const [rgbGreen, setRgbGreen] = useState(165);
  const [rgbBlue, setRgbBlue] = useState(0);
  const [brightness, setBrightness] = useState(1);
  
  // Сохраняем начальные значения цвета при открытии модала
  const [initialColor, setInitialColor] = useState('#FFA705'); // 0 (чёрный) до 1 (яркий)
  
  // 🎮 Гироскоп для parallax эффекта карточки профиля
  const cardRotateX = useRef(new Animated.Value(0)).current;
  const cardRotateY = useRef(new Animated.Value(0)).current;
  const [gyroData, setGyroData] = useState({ x: 0, y: 0, z: 0 });
  
  // Палитра цветов
  const cardColors = [
    '#FFA705', // Основной оранжевый
    '#FF8C00', // Темный оранжевый
    '#FF7B00', // Доп оранжевый
    '#FFD93D', // Жёлтый
    '#6BCB77', // Зелёный
    '#4D96FF', // Синий
    '#A78BFA', // Фиолетовый
    '#F472B6', // Розовый
    '#EC4899', // Малиновый
    '#06B6D4', // Голубой
    '#8B5CF6', // Сиреневый
    '#14B8A6', // Бирюзовый
    '#F59E0B', // Янтарный
    '#EF4444', // Красно-оранжевый
    '#6366F1', // Индиго
    '#D946EF', // Фуксия
    '#00D9FF', // Кибер-голубой
    '#22C55E', // Светло-зелёный
    '#FB923C', // Светло-оранжевый
    // Тёмные оттенки
    '#991B1B', // Тёмно-красный
    '#7C2D12', // Тёмно-оранжевый
    '#713F12', // Тёмно-жёлтый
    '#166534', // Тёмно-зелёный
    '#1E3A8A', // Тёмно-синий
    '#4C1D95', // Тёмно-фиолетовый
    '#831843', // Тёмно-розовый
    '#500724', // Тёмно-малиновый
    '#164E63', // Тёмно-голубой
    '#312E81', // Тёмно-сиреневый
    '#134E4A', // Тёмно-бирюзовый
    '#78350F', // Тёмно-янтарный
    '#7F1D1D', // Тёмный красно-оранжевый
    '#3730A3', // Тёмное индиго
    '#6B21A8', // Тёмная фуксия
    '#0C4A6E', // Тёмный кибер-голубой
    '#15803D', // Очень тёмно-зелёный
    '#92400E', // Очень тёмно-оранжевый
  ];

  useEffect(() => {
    loadProfile();
    checkAdminStatus();
    loadChatBackground();
  }, []);

  // 📌 ИСПРАВЛЕНИЕ: Перезагружаем профиль при фокусе экрана
  // Это решает проблему со старым cardColor при смене пользователя
  useFocusEffect(
    React.useCallback(() => {
      console.log('👁️ ProfileScreen получил фокус - перезагружаем профиль');
      loadProfile();
      return () => {
        // Cleanup при потере фокуса
      };
    }, [])
  );

  // 🎮 Подписка на данные акселерометра для наклона карточки
  useEffect(() => {
    try {
      // Устанавливаем частоту обновления
      Accelerometer.setUpdateInterval(50); // Более частые обновления для плавности
      
      let subscription = null;
      let smoothRotateX = 0;
      let smoothRotateY = 0;
      const smoothingFactor = 0.15; // Коэффициент сглаживания (чем меньше, тем плавнее)
      
      const setupAccelerometer = async () => {
        try {
          subscription = Accelerometer.addListener(data => {
            const maxRotation = 22; // Немного увеличено
            const amplificationFactor = 1.0; // Небольшое увеличение
            
            // Целевые углы с усилением
            const targetRotateY = Math.max(-maxRotation, Math.min(maxRotation, (data.x || 0) * maxRotation * amplificationFactor));
            const targetRotateX = Math.max(-maxRotation, Math.min(maxRotation, (data.y || 0) * maxRotation * amplificationFactor * -1));
            
            // Сглаживание: постепенное приближение к целевому значению
            smoothRotateX += (targetRotateX - smoothRotateX) * smoothingFactor;
            smoothRotateY += (targetRotateY - smoothRotateY) * smoothingFactor;
            
            // Прямое обновление с плавностью
            cardRotateX.setValue(smoothRotateX);
            cardRotateY.setValue(smoothRotateY);
          });
        } catch (error) {
          console.warn('Ошибка при подписке на акселерометр:', error);
        }
      };
      
      setupAccelerometer();
      
      return () => {
        if (subscription) {
          subscription.remove();
        }
      };
    } catch (error) {
      console.warn('Акселерометр недоступен:', error);
    }
  }, []);

  const checkAdminStatus = async () => {
    try {
      const response = await adminAPI.checkAdminStatus();
      setIsAdmin(response.data.is_admin);
    } catch (err) {
      console.log('Пользователь не администратор');
    }
  };

  const loadAdminGroups = async () => {
    try {
      const response = await adminAPI.getAdminGroups();
      setAdminGroups(response.data);
    } catch (err) {
      error('Ошибка', 'Не удалось загрузить группы');
    }
  };

  const loadAdminChats = async () => {
    try {
      const response = await adminAPI.getAdminChats();
      setAdminChats(response.data);
    } catch (err) {
      error('Ошибка', 'Не удалось загрузить чаты');
    }
  };

  const handleDeleteGroup = (groupId, groupName) => {
    info('Удалить группу', `Вы уверены что хотите удалить группу "${groupName}"?`, {
      buttons: [
        { text: 'Отмена', color: '#ccc', textColor: '#333' },
        {
          text: 'Удалить',
          color: '#FF3B30',
          onPress: async () => {
            try {
              await adminAPI.deleteGroup(groupId);
              success('Успех', 'Группа удалена');
              loadAdminGroups();
            } catch (err) {
              error('Ошибка', 'Не удалось удалить группу');
            }
          },
        },
      ],
      autoClose: false,
    });
  };

  const handleDeleteChat = (user1, user2) => {
    const chatName = `${user1.username} - ${user2.username}`;
    info('Удалить чат', `Вы уверены что хотите удалить чат "${chatName}"?`, {
      buttons: [
        { text: 'Отмена', color: '#ccc', textColor: '#333' },
        {
          text: 'Удалить',
          color: '#FF3B30',
          onPress: async () => {
            try {
              await adminAPI.deleteChat(user1.id, user2.id);
              success('Успех', 'Чат удален');
              loadAdminChats();
            } catch (err) {
              error('Ошибка', 'Не удалось удалить чат');
            }
          },
        },
      ],
      autoClose: false,
    });
  };

  // 🎨 Функции для RGB конвертации
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : { r: 255, g: 107, b: 107 };
  };

  const rgbToHex = (r, g, b, bright = 1) => {
    // Применяем яркость к значениям RGB
    const br = Math.round(r * bright);
    const bg = Math.round(g * bright);
    const bb = Math.round(b * bright);
    return "#" + ((1 << 24) + (br << 16) + (bg << 8) + bb).toString(16).slice(1).toUpperCase();
  };

  const openColorPicker = () => {
    const rgb = hexToRgb(profile.cardColor);
    setRgbRed(rgb.r);
    setRgbGreen(rgb.g);
    setRgbBlue(rgb.b);
    setBrightness(1);
    // Сохраняем начальный цвет для возможности отмены
    setInitialColor(profile.cardColor);
    setShowColorPicker(true);
  };

  // 🎨 Обновление цвета для предпросмотра (БЕЗ сохранения)
  const handleRgbChange = (r, g, b) => {
    setRgbRed(r);
    setRgbGreen(g);
    setRgbBlue(b);
    // Только обновляем состояние для предпросмотра, НЕ сохраняем
  };

  const handleBrightnessChange = (value) => {
    setBrightness(value);
    // Только обновляем состояние для предпросмотра, НЕ сохраняем
  };

  // 🎨 Функция для сохранения цвета (вызывается при нажатии "Готово")
  const handleDoneColor = () => {
    const hexColor = rgbToHex(rgbRed, rgbGreen, rgbBlue, brightness);
    handleChangeCardColor(hexColor);
  };

  // 🎨 Функция для отмены выбора цвета (восстановление начального)
  const handleCancelColor = () => {
    const rgb = hexToRgb(initialColor);
    setRgbRed(rgb.r);
    setRgbGreen(rgb.g);
    setRgbBlue(rgb.b);
    setBrightness(1);
    setShowColorPicker(false);
  };

  const loadProfile = async () => {
    try {
      console.log('🔄 ProfileScreen: Загружаем профиль...');
      const response = await profileAPI.getProfile();
      console.log('✅ ProfileScreen: Профиль получен, пользователь:', response.data.username);
      console.log('📦 ProfileScreen: Полные данные профиля:', JSON.stringify(response.data, null, 2));
      
      // 📌 Приоритет загрузки цвета: 1) БД → 2) AsyncStorage → 3) Default
      let cardColor = response.data.cardColor;
      console.log('🎨 ProfileScreen: cardColor из БД:', cardColor);
      
      if (cardColor) {
        console.log('✅ Цвет загружен из БД:', cardColor);
        // Сохраняем в локальное хранилище для быстрого доступа
        try {
          await AsyncStorage.setItem('profileCardColor', cardColor);
        } catch (err) {
          console.warn('Не удалось сохранить цвет локально:', err);
        }
      } else {
        // Цвета нет в БД - ищем в локальном хранилище
        try {
          const savedColor = await AsyncStorage.getItem('profileCardColor');
          if (savedColor) {
            cardColor = savedColor;
            console.log('✅ Цвет загружен из AsyncStorage:', cardColor);
          } else {
            cardColor = '#FF6B6B';
            console.log('ℹ️ Используется цвет по умолчанию (NOT в БД, NOT в AsyncStorage)');
          }
        } catch (err) {
          cardColor = '#FF6B6B';
          console.error('Ошибка чтения AsyncStorage:', err);
        }
      }
      
      setProfile({
        ...response.data,
        cardColor: cardColor,
      });
    } catch (err) {
      console.error('Ошибка загрузки профиля:', err);
      error('Ошибка', 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  };



  // 🎨 Функция для смены цвета карточки
  const handleChangeCardColor = async (newColor) => {
    console.log('🎨 Меняем цвет на:', newColor);
    setProfile({ ...profile, cardColor: newColor });
    setShowColorPicker(false);
    
    try {
      // 📌 ГЛАВНОЕ: Сохраняем цвет на сервер в БД
      console.log('📤 Отправляем на сервер:', { cardColor: newColor });
      const response = await profileAPI.updateProfile({ cardColor: newColor });
      console.log('📦 Ответ от сервера:', JSON.stringify(response.data, null, 2));
      console.log('✅ Цвет карточки сохранен в БД:', newColor);
      
      // Сохраняем локально для быстрого доступа
      await AsyncStorage.setItem('profileCardColor', newColor);
    } catch (err) {
      console.error('❌ Ошибка сохранения цвета:', err.message);
      // Сохраняем локально даже если сервер не ответил
      try {
        await AsyncStorage.setItem('profileCardColor', newColor);
      } catch (localErr) {
        console.log('Ошибка локального сохранения:', localErr);
      }
    }
  };

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

  const saveChatBackground = async (background) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch('http://151.247.196.66:3001/api/user/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ chat_background: background })
      });
      
      if (!response.ok) {
        throw new Error('Ошибка сохранения');
      }
      
      setChatBackground(background);
    } catch (err) {
      error('Ошибка', 'Не удалось сохранить фон');
    }
  };

  const pickImage = async () => {
    try {
      setImageLoading(true);
      
      // Запрашиваем разрешение
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permission.granted) {
        error('Ошибка', 'Нужно разрешение для доступа к галерее');
        return;
      }
      
      // Открываем галерею
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      
      if (result.canceled) {
        return;
      }
      
      if (!result.assets || result.assets.length === 0) {
        error('Ошибка', 'Не удалось получить изображение');
        return;
      }
      
      const selectedAsset = result.assets[0];
      
      if (!selectedAsset.base64) {
        warning('Ошибка', 'Не удалось получить фото в нужном формате');
        return;
      }
      
      const base64Image = `data:image/jpeg;base64,${selectedAsset.base64}`;
      
      // ✅ ГЛАВНОЕ: Обновляем аватар в профиле
      const updatedProfile = { ...profile, avatar: base64Image };
      setProfile(updatedProfile);
      
      // Загружаем на сервер
      await profileAPI.updateProfile({ avatar: base64Image });
      
      // Сохраняем локально
      await AsyncStorage.setItem('user', JSON.stringify(updatedProfile));
      
      success('Успех', 'Аватар обновлен');
      
    } catch (error) {
      console.error('Ошибка при выборе изображения:', error);
      error('Ошибка', 'Не удалось обновить аватар');
    } finally {
      setImageLoading(false);
    }
  };





  const handleSave = async () => {
    if (!profile.username.trim()) {
      warning('Ошибка', 'Введите имя пользователя');
      return;
    }
    if (profile.username.length < 3) {
      warning('Ошибка', 'Имя должно быть минимум 3 символа');
      return;
    }

    try {
      await profileAPI.updateProfile(profile);
      await AsyncStorage.setItem('user', JSON.stringify(profile));
      success('Успех', 'Профиль обновлен');
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Не удалось обновить профиль';
      error('Ошибка', errorMessage);
    }
  };

  const getAvatarSource = () => {
    if (profile.avatar) {
      return { uri: profile.avatar };
    }
    return null;
  };

  const renderAvatar = () => {
    const avatarSource = getAvatarSource();
    if (avatarSource) {
      return (
        <Image 
          source={avatarSource} 
          style={styles.avatarLarge}
          resizeMode="cover"
        />
      );
    }
    return (
      <View style={[styles.avatarPlaceholderLarge, { backgroundColor: theme.primary }]}>
        <Text style={styles.avatarTextLarge}>
          {profile.username ? profile.username[0].toUpperCase() : '?'}
        </Text>
      </View>
    );
  };

  // 🎨 Генерируем градиент на основе выбранного цвета карточки
  const getGradientColors = () => {
    const baseColor = profile.cardColor || '#FF8C00';
    // Светлый оттенок (для начала градиента)
    const lightColor = baseColor + 'E6'; // Добавляем прозрачность
    // Темный оттенок (для конца градиента)
    return [lightColor, baseColor];
  };

  const gradientColors = getGradientColors();

  const chatBackgrounds = [
    { id: 'default', name: 'Стандартный', color: theme.background },
    { id: 'light-blue', name: 'Светло-синий', color: '#E3F2FD' },
    { id: 'light-green', name: 'Светло-зелёный', color: '#E8F5E9' },
    { id: 'light-pink', name: 'Светло-розовый', color: '#FCE4EC' },
    { id: 'light-purple', name: 'Светло-фиолетовый', color: '#F3E5F5' },
    { id: 'light-orange', name: 'Светло-оранжевый', color: '#FFF3E0' },
    { id: 'dark-blue', name: 'Тёмно-синий', color: '#1E3A8A' },
    { id: 'dark-green', name: 'Тёмно-зелёный', color: '#1B4332' },
  ];

  const actionItems = [
    {
      key: 'notifications',
      icon: 'notifications',
      label: 'Уведомления',
      description: 'Настройки push и звуковых оповещений',
      tint: theme.primary,
      onPress: () => navigation.navigate('NotificationSettings'),
    },
  ];

  if (isAdmin) {
    actionItems.push({
      key: 'admin',
      icon: 'shield',
      label: 'Админ панель',
      description: 'Управление группами и чатами',
      tint: '#FF9500',
      onPress: () => {
        loadAdminGroups();
        loadAdminChats();
        setShowAdminPanel(true);
      },
    });
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}> 
        <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}> 
          <Text style={{ color: theme.text }}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}> 
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={[styles.header, { backgroundColor: theme.surface }]}> 
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Профиль</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* БАННЕР В СТИЛЕ ВК */}
          <View style={styles.bannerContainer}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              {/* Кнопки управления баннером в углу */}
              <View style={styles.bannerControls}>
                <TouchableOpacity
                  style={[styles.bannerButton, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
                  onPress={openColorPicker}
                  activeOpacity={0.7}
                >
                  <Ionicons name="color-palette" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* АВАТАР НАЛОЖЕН НА БАННЕР */}
            <View style={styles.avatarOverlay}>
              <View style={[styles.avatarContainer, { borderColor: theme.surface }]}>
                {imageLoading && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="large" color={theme.primary} />
                  </View>
                )}
                {renderAvatar()}
                <TouchableOpacity
                  style={[
                    styles.avatarEditButton,
                    { backgroundColor: theme.primary },
                  ]}
                  onPress={pickImage}
                  disabled={imageLoading}
                  activeOpacity={0.72}
                >
                  {imageLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.contentWrapper}>
            {/* ИНФОРМАЦИЯ ПРОФИЛЯ */}
            <View style={[styles.profileInfoCard, { backgroundColor: theme.surface }]}>
              <View style={styles.profileHeader}>
                <View style={styles.profileHeaderText}>
                  <Text style={[styles.profileName, { color: theme.text }]}>
                    {profile.username || 'Без имени'}
                  </Text>
                  <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                    {profile.email}
                  </Text>
                  {profile.status ? (
                    <Text style={[styles.statusText, { color: theme.primary }]}>
                      {profile.status}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* КНОПКИ ДЕЙСТВИЙ */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  onPress={handleSave}
                  style={[
                    styles.actionButton,
                    styles.primaryActionButton,
                    { backgroundColor: theme.primary },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-done" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Сохранить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Settings')}
                  style={[
                    styles.actionButton,
                    styles.secondaryActionButton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="settings-outline" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* О СЕБЕ И ЛИЧНЫЕ ДАННЫЕ */}
            <View style={[styles.card, styles.cardShadow, { backgroundColor: theme.surface }]}> 
              <Text style={[styles.cardTitle, { color: theme.text }]}>Личная информация</Text>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Имя пользователя</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  value={profile.username}
                  onChangeText={(text) => setProfile({ ...profile, username: text })}
                  placeholder="Введите имя"
                  placeholderTextColor={theme.textLight}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.disabledInput,
                    {
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.border,
                      color: theme.textLight,
                    },
                  ]}
                  value={profile.email}
                  editable={false}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Статус</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  value={profile.status || ''}
                  onChangeText={(text) => setProfile({ ...profile, status: text })}
                  placeholder="Ваш статус"
                  placeholderTextColor={theme.textLight}
                  maxLength={50}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>О себе</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.bioInput,
                    {
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  value={profile.bio || ''}
                  onChangeText={(text) => setProfile({ ...profile, bio: text })}
                  placeholder="Расскажите о себе..."
                  placeholderTextColor={theme.textLight}
                  multiline
                  numberOfLines={4}
                  maxLength={200}
                />
              </View>
            </View>

            <View style={[styles.card, styles.cardShadow, { backgroundColor: theme.surface }]}> 
              <View style={styles.cardRow}>
                <View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Тема приложения</Text>
                  <Text style={[styles.actionDescription, { color: theme.textSecondary }]}>Переключение между светлой и тёмной темой</Text>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: '#D1D5DB', true: theme.primary }}
                  thumbColor="#fff"
                  style={styles.switch}
                />
              </View>
            </View>



            <View style={[styles.card, styles.cardShadow, styles.actionsCard, { backgroundColor: theme.surface }]}> 
              {actionItems.map((action, index) => (
                <TouchableOpacity
                  key={action.key}
                  style={[
                    styles.actionItem,
                    index !== 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  ]}
                  onPress={action.onPress}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionItemLeft}>
                    <View style={[styles.actionIcon, { backgroundColor: `${action.tint}22` }]}> 
                      <Ionicons name={action.icon} size={20} color={action.tint} />
                    </View>
                    <View>
                      <Text style={[styles.actionItemText, { color: theme.text }]}>{action.label}</Text>
                      {action.description ? (
                        <Text style={[styles.actionDescription, { color: theme.textSecondary }]}> 
                          {action.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.logoutButton, styles.cardShadow]}
              onPress={async () => {
                // 📌 ВАЖНО: Цвет карточки теперь всегда сохраняется в БД
                // Поэтому при выходе мы просто очищаем AsyncStorage
                // При следующем входе цвет будет загружен с сервера
                
                console.log('🚪 Выход из аккаунта');
                console.log('ℹ️ Цвет карточки сохранен в БД - будет восстановлен при входе');
                console.log('🧹 Очищаем AsyncStorage...');
                
                // ⭐ КРИТИЧНО: Отключаем socket и отправляем офлайн статус перед logout
                try {
                  await disconnectSocket();
                  console.log('✅ Socket отключен, офлайн статус отправлен');
                } catch (err) {
                  console.error('⚠️ Ошибка при отключении socket:', err);
                }
                
                // Очищаем все данные аккаунта
                const keysToDelete = await AsyncStorage.getAllKeys();
                console.log('🧹 AsyncStorage ключи перед очисткой:', keysToDelete);
                await AsyncStorage.clear();
                
                const keysAfter = await AsyncStorage.getAllKeys();
                console.log('✅ AsyncStorage очищен. Остало ключей:', keysAfter.length);
                
                navigation.replace('Login');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out" size={18} color="#fff" style={styles.logoutIcon} />
              <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showAdminPanel}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAdminPanel(false)}
      >
        <SafeAreaView edges={['top', 'bottom']} style={[styles.adminContainer, { backgroundColor: theme.background }]}> 
          <View style={[styles.adminHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}> 
            <TouchableOpacity onPress={() => setShowAdminPanel(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.adminTitle, { color: theme.text }]}>Админ панель</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.adminSection}>
              <Text style={[styles.adminSectionTitle, { color: theme.text }]}>Все группы ({adminGroups.length})</Text>
              {adminGroups.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Групп не найдено</Text>
              ) : (
                adminGroups.map((group) => (
                  <View
                    key={group.id}
                    style={[styles.adminItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <View style={styles.adminItemContent}>
                      <Text style={[styles.adminItemTitle, { color: theme.text }]}>{group.name}</Text>
                      <Text style={[styles.adminItemSubtitle, { color: theme.textSecondary }]}> 
                        Участников: {group.member_count} | Создатель: {group.creator_name}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteGroup(group.id, group.name)}>
                      <Ionicons name="trash" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            <View style={styles.adminSection}>
              <Text style={[styles.adminSectionTitle, { color: theme.text }]}>Все чаты ({adminChats.length})</Text>
              {adminChats.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Чатов не найдено</Text>
              ) : (
                adminChats.map((chat, index) => (
                  <View
                    key={index}
                    style={[styles.adminItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <View style={styles.adminItemContent}>
                      <Text style={[styles.adminItemTitle, { color: theme.text }]}>
                        {chat.user1.username} ↔ {chat.user2.username}
                      </Text>
                      <Text style={[styles.adminItemSubtitle, { color: theme.textSecondary }]}>Сообщений: {chat.message_count}</Text>
                    </View>
                    <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteChat(chat.user1, chat.user2)}>
                      <Ionicons name="trash" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 🎨 Модальное окно выбора цвета карточки */}
      <Modal
        visible={showColorPicker}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowColorPicker(false)}
      >
        <View style={styles.colorPickerOverlay}>
          <View style={[styles.colorPickerModal, { backgroundColor: theme.surface }]}>
            <View style={styles.colorPickerHeader}>
              <Text style={[styles.colorPickerTitle, { color: theme.text }]}>Выберите цвет карточки</Text>
              <TouchableOpacity onPress={handleCancelColor}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.rgbContainer} showsVerticalScrollIndicator={false}>
              {/* Предпросмотр цвета */}
              <View style={styles.colorPreviewContainer}>
                <View
                  style={[
                    styles.colorPreview,
                    { backgroundColor: rgbToHex(rgbRed, rgbGreen, rgbBlue) },
                  ]}
                />
                <Text style={[styles.colorHexText, { color: theme.text }]}>
                  {rgbToHex(rgbRed, rgbGreen, rgbBlue)}
                </Text>
              </View>

              {/* Red слайдер */}
              <View style={styles.rgbSliderGroup}>
                <View style={styles.rgbLabelRow}>
                  <Text style={[styles.rgbLabel, { color: theme.text }]}>Красный</Text>
                  <Text style={[styles.rgbValue, { color: '#FF6B6B' }]}>{Math.round(rgbRed)}</Text>
                </View>
                <Slider
                  style={styles.rgbSlider}
                  minimumValue={0}
                  maximumValue={255}
                  step={1}
                  value={rgbRed}
                  onValueChange={(value) => setRgbRed(value)}
                  minimumTrackTintColor="#FF6B6B"
                  maximumTrackTintColor={theme.textLight}
                  thumbTintColor="#FF6B6B"
                />
              </View>

              {/* Green слайдер */}
              <View style={styles.rgbSliderGroup}>
                <View style={styles.rgbLabelRow}>
                  <Text style={[styles.rgbLabel, { color: theme.text }]}>Зелёный</Text>
                  <Text style={[styles.rgbValue, { color: '#6BCB77' }]}>{Math.round(rgbGreen)}</Text>
                </View>
                <Slider
                  style={styles.rgbSlider}
                  minimumValue={0}
                  maximumValue={255}
                  step={1}
                  value={rgbGreen}
                  onValueChange={(value) => setRgbGreen(value)}
                  minimumTrackTintColor="#6BCB77"
                  maximumTrackTintColor={theme.textLight}
                  thumbTintColor="#6BCB77"
                />
              </View>

              {/* Blue слайдер */}
              <View style={styles.rgbSliderGroup}>
                <View style={styles.rgbLabelRow}>
                  <Text style={[styles.rgbLabel, { color: theme.text }]}>Синий</Text>
                  <Text style={[styles.rgbValue, { color: '#4D96FF' }]}>{Math.round(rgbBlue)}</Text>
                </View>
                <Slider
                  style={styles.rgbSlider}
                  minimumValue={0}
                  maximumValue={255}
                  step={1}
                  value={rgbBlue}
                  onValueChange={(value) => setRgbBlue(value)}
                  minimumTrackTintColor="#4D96FF"
                  maximumTrackTintColor={theme.textLight}
                  thumbTintColor="#4D96FF"
                />
              </View>

              {/* Яркость слайдер */}
              <View style={styles.rgbSliderGroup}>
                <View style={styles.rgbLabelRow}>
                  <Text style={[styles.rgbLabel, { color: theme.text }]}>Яркость</Text>
                  <Text style={[styles.rgbValue, { color: theme.text }]}>{Math.round(brightness * 100)}%</Text>
                </View>
                <Slider
                  style={styles.rgbSlider}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.01}
                  value={brightness}
                  onValueChange={(value) => setBrightness(value)}
                  minimumTrackTintColor="#000"
                  maximumTrackTintColor="#fff"
                  thumbTintColor={theme.primary}
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.colorPickerCloseButton, { backgroundColor: theme.primary }]}
              onPress={handleDoneColor}
              activeOpacity={0.8}
            >
              <Text style={styles.colorPickerCloseText}>Готово</Text>
            </TouchableOpacity>
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
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 36,
  },
  contentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  // ВК-СТИЛЬ БАННЕР
  bannerContainer: {
    marginBottom: 16,
    marginHorizontal: -16,
  },
  banner: {
    height: 140,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 12,
  },
  bannerControls: {
    flexDirection: 'row',
    gap: 8,
  },
  bannerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // АВАТАР НАЛОЖЕН НА БАННЕР
  avatarOverlay: {
    paddingHorizontal: 16,
    marginTop: -55,
    marginBottom: 20,
    zIndex: 10,
  },
  avatarContainer: {
    position: 'relative',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 5,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
    borderRadius: 55,
  },
  avatarEditButton: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 10,
  },
  // КАРТОЧКА ПРОФИЛЯ
  profileInfoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(99, 102, 241, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  profileHeader: {
    marginBottom: 16,
  },
  profileHeaderText: {
    gap: 6,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  profileEmail: {
    fontSize: 13,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  primaryActionButton: {
    flex: 1,
  },
  secondaryActionButton: {
    borderWidth: 1.5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(99, 102, 241, 0.08)',
  },
  cardShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: '500',
  },
  bioInput: {
    minHeight: 110,
    textAlignVertical: 'top',
    borderRadius: 10,
  },
  disabledInput: {
    opacity: 0.6,
  },
  primaryButton: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switch: {
    transform: [{ scale: 1.05 }],
  },
  actionsCard: {
    paddingVertical: 0,
  },
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  actionItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionDescription: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 20,
  },
  logoutIcon: {
    marginRight: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  utilityCardContent: {
    marginTop: 8,
  },
  adminContainer: {
    flex: 1,
  },
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  adminTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  adminSection: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  adminSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  adminItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 11,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  adminItemContent: {
    flex: 1,
  },
  adminItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  adminItemSubtitle: {
    fontSize: 12,
    fontWeight: '400',
  },
  deleteButton: {
    padding: 9,
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 22,
    fontWeight: '500',
  },
  backgroundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    gap: 7,
    justifyContent: 'space-between',
  },
  backgroundOption: {
    width: '31%',
    paddingVertical: 9,
    paddingHorizontal: 7,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 3,
  },
  backgroundLabel: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  // ЦВЕТОВОЙ ВЫБОР
  editColorButton: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorPickerModal: {
    borderRadius: 16,
    padding: 12,
    width: '90%',
    maxHeight: '85%',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  colorPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  colorPickerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  rgbContainer: {
    marginBottom: 12,
    maxHeight: 400,
  },
  colorPreviewContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  colorPreview: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  colorHexText: {
    fontSize: 14,
    fontWeight: '700',
  },
  rgbSliderGroup: {
    marginBottom: 14,
  },
  rgbLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  rgbLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  rgbValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  rgbSlider: {
    height: 36,
    borderRadius: 6,
  },
  colorPickerCloseButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  colorPickerCloseText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // АВАТАР СТИЛИ
  avatarLarge: {
    width: 110,
    height: 110,
    borderRadius: 55,
    resizeMode: 'cover',
  },
  avatarPlaceholderLarge: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTextLarge: {
    color: '#fff',
    fontSize: 45,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});

export default ProfileScreen;