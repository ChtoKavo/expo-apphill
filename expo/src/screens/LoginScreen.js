import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { useTheme } from '../contexts/ThemeContext';
import BannedAccountModal from '../components/BannedAccountModal';
import { resendPushTokenAfterLogin } from '../services/notifications';
import { resetSocket } from '../services/globalSocket';

WebBrowser.maybeCompleteAuthSession();

const { width } = Dimensions.get('window');

// Анимированный инпут компонент с иконкой
const AnimatedInput = ({ placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, editable, icon }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleAnim, {
      toValue: 1.02,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.inputWrapper,
        {
          transform: [{ scale: scaleAnim }],
          borderColor: isFocused ? '#3B82F6' : '#E5E7EB',
        },
        isFocused && styles.inputWrapperFocused,
      ]}
    >
      {icon && (
        <Ionicons 
          name={icon} 
          size={20} 
          color={isFocused ? '#3B82F6' : '#9CA3AF'} 
          style={styles.inputIcon}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#D1D5DB"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </Animated.View>
  );
};

const LoginScreen = ({ navigation }) => {
  const { error: showError, warning: showWarning } = useModalAlert();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showBannedModal, setShowBannedModal] = useState(false);
  const [bannedInfo, setBannedInfo] = useState({ reason: '', bannedAt: null, unbanAt: null });
  
  // Анимации для успешного входа
  const successAnim = useRef(new Animated.Value(0)).current;
  const screenFadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  
  const [request, response, promptAsync] = Google.useAuthRequest({
    // Android Client ID для production сборки
    androidClientId: "95571551481-g6kuqjkh23eja996jrifah4unc6d1fcd.apps.googleusercontent.com",
    // Web Client ID для Expo Go
    webClientId: "95571551481-8mvkqnto58mv6hr0395ct75cs56gfbus.apps.googleusercontent.com",
    // Expo Client ID (тот же что и Web)
    expoClientId: "95571551481-8mvkqnto58mv6hr0395ct75cs56gfbus.apps.googleusercontent.com",
  });

  // Выведем реальный redirectUri в консоль
  useEffect(() => {
    if (request) {
      console.log('🔥 REDIRECT URI:', request.redirectUri);
    }
  }, [request]);

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      handleGoogleLogin(authentication.accessToken);
    }
  }, [response]);

  useEffect(() => {
    checkSavedCredentials();
  }, []);

  const checkSavedCredentials = async () => {
    try {
      const savedEmail = await AsyncStorage.getItem('savedEmail');
      const savedPassword = await AsyncStorage.getItem('savedPassword');
      if (savedEmail && savedPassword) {
        setEmail(savedEmail);
        setPassword(savedPassword);
        setRememberMe(true);
      }
    } catch (error) {
      console.error('Ошибка при загрузке сохраненных данных:', error);
    }
  };

  // Функция для анимации успешного входа
  const playSuccessAnimation = (callback) => {
    setShowSuccessOverlay(true);
    
    // Запускаем все анимации параллельно
    Animated.parallel([
      // Основной круг с галочкой
      Animated.spring(successAnim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
      // Пульсация
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 2 }
      ),
      // Первое кольцо
      Animated.timing(ring1Anim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      // Второе кольцо с задержкой
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(ring2Anim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      // Конфетти
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ]).start();

    // Переход на следующий экран после анимации
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(screenFadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        callback();
      });
    }, 1200);
  };

  const showValidationModal = useCallback((title, message) => {
    showWarning(title, message, {
      autoClose: false,
      buttons: [
        {
          text: 'Понятно',
          color: theme.primary,
        },
      ],
    });
  }, [showWarning, theme.primary]);

  const showErrorModal = useCallback((title, message) => {
    showError(title, message, {
      autoClose: false,
      buttons: [
        {
          text: 'Хорошо',
          color: theme.primary,
        },
      ],
    });
  }, [showError, theme.primary]);

  const handleGoogleLogin = async (accessToken) => {
    try {
      // ⭐ КРИТИЧНО: Сбрасываем старый socket перед входом нового пользователя
      try {
        await resetSocket();
        console.log('✅ Старый socket сброшен перед входом через Google');
      } catch (err) {
        console.error('⚠️ Ошибка при сбросе socket:', err);
      }
      
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/userinfo/v2/me",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      
      const userData = await userInfoResponse.json();
      
      const response = await authAPI.googleLogin({
        googleId: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture
      });
      
      await AsyncStorage.setItem('token', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      
      const { registerBackgroundFetch } = require('../services/backgroundTasks');
      await registerBackgroundFetch();
      
      const { registerForPushNotificationsAsync } = require('../services/notifications');
      await registerForPushNotificationsAsync();
      
      // Пересылаем push токен на сервер после успешного входа через Google
      await resendPushTokenAfterLogin();
      
      playSuccessAnimation(() => {
        navigation.replace('Main');
      });
    } catch (err) {
      console.error('Ошибка входа через Google:', err);
      showErrorModal('Ошибка', 'Не удалось войти через Google');
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      showValidationModal('Проверка данных', 'Введите email');
      return;
    }
    if (!password.trim()) {
      showValidationModal('Проверка данных', 'Введите пароль');
      return;
    }
    if (!email.includes('@')) {
      showValidationModal('Проверка данных', 'Введите корректный email');
      return;
    }
    if (password.trim().length < 6) {
      showValidationModal('Проверка данных', 'Пароль должен содержать минимум 6 символов');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // ⭐ КРИТИЧНО: Сбрасываем старый socket перед входом нового пользователя
      try {
        await resetSocket();
        console.log('✅ Старый socket сброшен перед входом');
      } catch (err) {
        console.error('⚠️ Ошибка при сбросе socket:', err);
      }
      
      const response = await authAPI.login({ email, password });
      
      // ✅ НОВОЕ: Проверяем, не забанен ли пользователь
      if (response.data.user?.is_banned) {
        setIsLoading(false);
        setBannedInfo({
          reason: response.data.user.ban_reason || 'Нарушение правил сообщества',
          bannedAt: response.data.user.banned_at,
          unbanAt: response.data.user.banned_until
        });
        setShowBannedModal(true);
        return;
      }
      
      if (rememberMe) {
        await AsyncStorage.setItem('savedEmail', email);
        await AsyncStorage.setItem('savedPassword', password);
      } else {
        await AsyncStorage.multiRemove(['savedEmail', 'savedPassword']);
      }

      await AsyncStorage.setItem('authToken', response.data.token);
      await AsyncStorage.setItem('token', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Сохраняем флаг администратора
      const isAdmin = response.data.user?.is_admin || false;
      await AsyncStorage.setItem('isAdmin', isAdmin.toString());
      
      // Если администратор - показываем админ-панель
      if (isAdmin) {
        setIsLoading(false);
        playSuccessAnimation(() => {
          navigation.replace('AdminPanel');
        });
        return;
      }
      
      // Регистрируем фоновые задачи и push-уведомления ПОСЛЕ успешного логина
      try {
        const { registerBackgroundFetch } = require('../services/backgroundTasks');
        await registerBackgroundFetch();
        
        const { registerForPushNotificationsAsync } = require('../services/notifications');
        await registerForPushNotificationsAsync();
        
        // Пересылаем push токен на сервер после успешного входа
        await resendPushTokenAfterLogin();
      } catch (bgError) {
        console.error('Ошибка при регистрации фоновых задач:', bgError);
        // Продолжаем даже если ошибка
      }
      
      setIsLoading(false);
      playSuccessAnimation(() => {
        navigation.replace('Main');
      });
    } catch (err) {
      console.log('Ошибка входа:', err);
      
      // ✅ НОВОЕ: Специальная обработка для забаненных пользователей
      if (err.response?.status === 403 && err.response?.data?.error?.includes('заблокирован')) {
        setIsLoading(false);
        setBannedInfo({
          reason: err.response.data.reason || 'Нарушение правил сообщества',
          bannedAt: err.response.data.banned_at || null,
          unbanAt: err.response.data.banned_until || null
        });
        setShowBannedModal(true);
        return;
      }
      
      const errorMessage = err.response?.data?.error || err.message || 'Ошибка подключения к серверу';
      const isValidationError = err.response?.status === 400 || err.response?.status === 401;
      if (isValidationError) {
        showValidationModal('Неверные данные', errorMessage || 'Проверьте корректность логина и пароля');
      } else {
        showErrorModal('Ошибка входа', errorMessage);
      }
      setIsLoading(false);
    }
  };

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          opacity: screenFadeAnim,
          transform: [{ scale: scaleAnim }]
        }
      ]}
    >
      {/* Декоративные круги */}
      <View style={styles.orangeCircle} />
      <View style={styles.orangeCircleSmall} />
      <View style={styles.purpleCircle} />
      
      {/* Заголовок */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Вход</Text>
        <Text style={styles.headerSubtitle}>Добро пожаловать!</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.centerContainer}>
          {/* Светлый контейнер с формой */}
          <LinearGradient
            colors={['#1A1F3A', '#1E2340']}
            locations={[0, 1]}
            style={styles.formCard}
          >
            {/* Декоративная линия сверху */}
            <View style={styles.formCardAccent} />
            
            <AnimatedInput
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isLoading}
              icon="mail-outline"
            />

            <AnimatedInput
              placeholder="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              editable={!isLoading}
              icon="lock-closed-outline"
            />

            <TouchableOpacity 
              style={[styles.loginButton, { opacity: isLoading ? 0.7 : 1 }]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#3B82F6', '#60A5FA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.loginButtonText}>Войти</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>или</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Нет аккаунта? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.footerLink}>Зарегистрироваться</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Кнопки социальных сетей */}
          <View style={styles.socialContainer}>
            <TouchableOpacity 
              style={styles.socialButton}
              onPress={() => promptAsync()}
              disabled={!request || isLoading}
              activeOpacity={0.8}
            >
              <View style={styles.socialIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              <Text style={styles.socialButtonText}>Войти с Google</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.socialButton, styles.yandexButton]}
              onPress={() => {}}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <View style={[styles.socialIconContainer, styles.yandexIconContainer]}>
                <Text style={styles.yandexIcon}>Я</Text>
              </View>
              <Text style={styles.socialButtonText}>Войти с Яндекс</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Модалка для заблокированного аккаунта */}
      <BannedAccountModal
        visible={showBannedModal}
        onClose={() => setShowBannedModal(false)}
        reason={bannedInfo.reason}
        bannedAt={bannedInfo.bannedAt}
        unbanAt={bannedInfo.unbanAt}
      />

      {/* Оверлей успешного входа */}
      {showSuccessOverlay && (
        <View style={styles.successOverlay}>
          {/* Контейнер для центральной анимации */}
          <View style={styles.successAnimationContainer}>
            {/* Декоративные частицы/конфетти */}
            {[...Array(12)].map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.confettiParticle,
                  {
                    backgroundColor: ['#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'][i % 6],
                    transform: [
                      { translateX: confettiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.cos(i * 30 * Math.PI / 180) * 150],
                      })},
                      { translateY: confettiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.sin(i * 30 * Math.PI / 180) * 150],
                      })},
                      { rotate: confettiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', `${360 + i * 30}deg`],
                      })},
                      { scale: confettiAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0.5],
                      })},
                    ],
                    opacity: confettiAnim.interpolate({
                      inputRange: [0, 0.2, 0.8, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                  },
                ]}
              />
            ))}

            {/* Расширяющиеся кольца */}
            <Animated.View
              style={[
                styles.successRing,
                {
                  transform: [{ scale: ring1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 2.5],
                  })}],
                  opacity: ring1Anim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0, 0.6, 0],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.successRing,
                styles.successRing2,
                {
                  transform: [{ scale: ring2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 2],
                  })}],
                  opacity: ring2Anim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0, 0.4, 0],
                  }),
                },
              ]}
            />

            {/* Основной круг с галочкой */}
            <Animated.View 
              style={[
                styles.successCircleOuter,
                {
                  transform: [{ scale: successAnim }],
                  opacity: successAnim,
                }
              ]}
            >
            <LinearGradient
              colors={['#3B82F6', '#60A5FA']}
              style={styles.successCircle}
            >
              {/* Пульсирующий блик */}
              <Animated.View
                style={[
                  styles.successPulse,
                  {
                    opacity: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 0],
                    }),
                    transform: [{ scale: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.5],
                    })}],
                  },
                ]}
              />
              <Ionicons name="checkmark" size={70} color="#fff" />
            </LinearGradient>
          </Animated.View>
          </View>

          {/* Текст */}
          <Animated.View
            style={[
              styles.successTextContainer,
              { 
                opacity: successAnim,
                transform: [{ translateY: successAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                })}],
              }
            ]}
          >
            <Text style={styles.successText}>Добро пожаловать!</Text>
            <Text style={styles.successSubtext}>Вход выполнен успешно</Text>
          </Animated.View>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  orangeCircle: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    shadowColor: 'rgba(99, 102, 241, 0.2)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 5,
  },
  orangeCircleSmall: {
    position: 'absolute',
    top: 150,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    opacity: 1,
  },
  purpleCircle: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    opacity: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: 50,
    left: 24,
    alignItems: 'flex-start',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    marginTop: 8,
    fontWeight: '500',
  },
  keyboardView: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  formCard: {
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    overflow: 'hidden',
    backgroundColor: '#1A1F3A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#2D3447',
  },
  formCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'linear-gradient(90deg, #818CF8, #60A5FA)',
  },
  inputWrapper: {
    backgroundColor: '#2D3447',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#3D4456',
  },
  inputWrapperFocused: {
    borderColor: '#60A5FA',
    backgroundColor: '#353F52',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    height: '100%',
    fontWeight: '500',
  },
  loginButton: {
    height: 54,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 24,
    marginBottom: 20,
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  loginButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#3D4456',
  },
  dividerText: {
    color: '#6B7280',
    fontSize: 13,
    marginHorizontal: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#60A5FA',
  },
  socialContainer: {
    marginTop: 28,
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F3A',
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#2D3447',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 2,
  },
  yandexButton: {
    backgroundColor: '#FFCC00',
    borderColor: '#FFB800',
  },
  socialIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#2D3447',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  yandexIconContainer: {
    backgroundColor: '#FF0000',
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  yandexIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  socialButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Стили для анимации успешного входа
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  confettiParticle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  successAnimationContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 280,
    height: 280,
  },
  successRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#818CF8',
  },
  successRing2: {
    borderColor: '#60A5FA',
    borderWidth: 2,
  },
  successCircleOuter: {
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
    elevation: 25,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  successPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
  },
  successTextContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  successText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  successSubtext: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
});

export default LoginScreen;