import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import BannedAccountModal from '../components/BannedAccountModal';
import { resendPushTokenAfterLogin } from '../services/notifications';

WebBrowser.maybeCompleteAuthSession();

const LoginScreen = ({ navigation }) => {
  const { theme, isDark } = useTheme();
  const { error: showError, warning: showWarning } = useModalAlert();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showBannedModal, setShowBannedModal] = useState(false);
  const [bannedInfo, setBannedInfo] = useState({ reason: '', bannedAt: null, unbanAt: null });

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: "YOUR_ANDROID_CLIENT_ID",
    iosClientId: "YOUR_IOS_CLIENT_ID",
    expoClientId: "YOUR_EXPO_CLIENT_ID",
    webClientId: "YOUR_WEB_CLIENT_ID",
  });

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
      
      navigation.replace('Main');
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
        navigation.replace('AdminPanel');
        setIsLoading(false);
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
      
      navigation.replace('Main');
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
    <SafeAreaView edges={["top", "bottom"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.gradient, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoSection}>
              <View style={[styles.logoContainer, { backgroundColor: theme.primary + '15' }]}>
                <Text style={[styles.logoText, { color: theme.primary }]}>M</Text>
              </View>
              <Text style={[styles.brandName, { color: theme.text }]}>Connect</Text>
            </View>

            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.text }]}>Добро пожаловать!</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Войдите в аккаунт и начните общение
              </Text>
            </View>

            <View style={styles.formSection}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Email</Text>
                <View style={[styles.inputWrapper, { 
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border
                }]}>
                  <Ionicons name="mail" size={18} color={theme.primary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="your@email.com"
                    placeholderTextColor={theme.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Пароль</Text>
                <View style={[styles.inputWrapper, { 
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border
                }]}>
                  <Ionicons name="lock-closed" size={18} color={theme.primary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!isLoading}
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={styles.rememberMe}
                onPress={() => setRememberMe(!rememberMe)}
              >
                <View style={[styles.checkbox, { 
                  backgroundColor: rememberMe ? theme.primary : 'transparent',
                  borderColor: rememberMe ? theme.primary : theme.border
                }]}>
                  {rememberMe && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.rememberMeText, { color: theme.textSecondary }]}>
                  Запомнить меня
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: theme.primary, opacity: isLoading ? 0.6 : 1 }]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.loginButtonText}>Войти</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>или</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <TouchableOpacity 
              style={[styles.googleButton, { 
                backgroundColor: theme.surface,
                borderColor: theme.border
              }]}
              onPress={() => promptAsync()}
              disabled={!request || isLoading}
              activeOpacity={0.8}
            >
              <Image 
                source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg' }}
                style={styles.googleIcon}
              />
              <Text style={[styles.googleButtonText, { color: theme.text }]}>
                Google
              </Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Нет аккаунта?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={[styles.footerLink, { color: theme.primary }]}>
                  Зарегистрироваться
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Модалка для заблокированного аккаунта */}
      <BannedAccountModal
        visible={showBannedModal}
        onClose={() => setShowBannedModal(false)}
        reason={bannedInfo.reason}
        bannedAt={bannedInfo.bannedAt}
        unbanAt={bannedInfo.unbanAt}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerText: {
    marginBottom: 36,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  formSection: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    letterSpacing: 0.2,
    height: '100%',
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rememberMeText: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
  loginButton: {
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 12,
  },
  googleButton: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1.5,
    marginBottom: 24,
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  googleButtonText: {
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default LoginScreen;