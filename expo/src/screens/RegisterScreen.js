import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';

const RegisterScreen = ({ navigation }) => {
  const { theme, isDark } = useTheme();
  const { error: showError, warning: showWarning, success: showSuccess } = useModalAlert();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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

  const showSuccessModal = useCallback((title, message, onConfirm) => {
    showSuccess(title, message, {
      autoClose: false,
      buttons: [
        {
          text: 'Отлично',
          color: theme.primary,
          onPress: onConfirm,
        },
      ],
    });
  }, [showSuccess, theme.primary]);

  const handleRegister = async () => {
    // ВАЛИДАЦИЯ
    if (!username.trim()) {
      showValidationModal('Проверка данных', 'Введите имя пользователя');
      return;
    }
    if (username.length < 3) {
      showValidationModal('Проверка данных', 'Имя должно быть минимум 3 символа');
      return;
    }
    if (!email.trim()) {
      showValidationModal('Проверка данных', 'Введите email');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      showValidationModal('Проверка данных', 'Введите корректный email');
      return;
    }
    if (!phone.trim()) {
      showValidationModal('Проверка данных', 'Введите номер телефона');
      return;
    }
    if (phone.length < 10) {
      showValidationModal('Проверка данных', 'Номер должен быть минимум 10 цифр');
      return;
    }
    if (!password.trim()) {
      showValidationModal('Проверка данных', 'Введите пароль');
      return;
    }
    if (password.length < 6) {
      showValidationModal('Проверка данных', 'Пароль должен быть минимум 6 символов');
      return;
    }
    
    setLoading(true);
    
    try {
      // ОТПРАВЛЯЕМ ЗАПРОС РЕГИСТРАЦИИ БЕЗ ВЕРИФИКАЦИИ
      const response = await authAPI.register({ 
        username, 
        email, 
        phone: phone.replace(/\D/g, ''),
        password 
      });
      
      // СОХРАНЯЕМ ТОКЕН
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
        await AsyncStorage.setItem('token', response.data.token);
        if (response.data.user) {
          await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
        }
        
        // ПОКАЗЫВАЕМ СООБЩЕНИЕ УСПЕХА И ПЕРЕХОДИМ НА ГЛАВНЫЙ ЭКРАН
        showSuccessModal('Успешно', 'Добро пожаловать!', () => {
          navigation.replace('Main');
        });
      }
    } catch (err) {
      console.log('Ошибка регистрации:', err.response?.data);
      const errorMessage = err.response?.data?.error || 'Ошибка подключения к серверу';
      showErrorModal('Ошибка регистрации', errorMessage);
    } finally {
      setLoading(false);
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
            {/* ЛОГОТИП И НАЗВАНИЕ */}
            <View style={styles.logoSection}>
              <View style={[styles.logoContainer, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name="sparkles" size={44} color={theme.primary} />
              </View>
              <Text style={[styles.brandName, { color: theme.text }]}>Connect</Text>
            </View>

            {/* ЗАГОЛОВОК */}
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.text }]}>Присоединиться</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Начните новые знакомства прямо сейчас
              </Text>
            </View>

            {/* ФОРМА */}
            <View style={styles.formSection}>
              {/* USERNAME */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>👤 Имя</Text>
                <View style={[styles.inputWrapper, { 
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border
                }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="example_user"
                    placeholderTextColor={theme.textSecondary + '60'}
                    value={username}
                    onChangeText={setUsername}
                    editable={!loading}
                  />
                </View>
              </View>

              {/* EMAIL */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>📧 Email</Text>
                <View style={[styles.inputWrapper, { 
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border
                }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="your@email.com"
                    placeholderTextColor={theme.textSecondary + '60'}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* PHONE */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>📱 Телефон</Text>
                <View style={[styles.inputWrapper, { 
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border
                }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="+7 999 999-99-99"
                    placeholderTextColor={theme.textSecondary + '60'}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* PASSWORD */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>🔐 Пароль</Text>
                <View style={[styles.inputWrapper, { 
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border
                }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Минимум 6 символов"
                    placeholderTextColor={theme.textSecondary + '60'}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!loading}
                  />
                </View>
              </View>

              {/* КНОПКА РЕГИСТРАЦИИ */}
              <TouchableOpacity 
                style={[styles.registerButton, { 
                  backgroundColor: theme.primary, 
                  opacity: loading ? 0.65 : 1 
                }]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginRight: 10 }} />
                <Text style={styles.registerButtonText}>
                  {loading ? 'Загрузка...' : 'Зарегистрироваться'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ССЫЛКА НА ВХОД */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Уже зарегистрированы?
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={[styles.footerLink, { color: theme.primary }]}>
                  {' '}Войти
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
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
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  // ✨ ЛОГО И ЗАГОЛОВОК
  logoSection: {
    alignItems: 'center',
    marginBottom: 48,
    marginTop: 12,
  },
  logoContainer: {
    width: 90,
    height: 90,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  brandName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerText: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  // ✨ ФОРМА
  formSection: {
    marginBottom: 28,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    letterSpacing: 0.3,
    height: '100%',
    fontWeight: '500',
  },
  // ✨ ПАЗЛ КАПЧА
  puzzleWrapper: {
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    marginTop: 16,
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  puzzleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  puzzleTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#4CAF50' + '20',
  },
  verifiedText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  puzzleTrack: {
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
    position: 'relative',
  },
  puzzlePiece: {
    width: 60,
    height: 60,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  puzzleTarget: {
    width: 60,
    height: 60,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  puzzleHint: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '600',
    alignSelf: 'center',
    width: '100%',
    textAlign: 'center',
    bottom: 5,
  },
  refreshButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'center',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // ✨ КНОПКА
  registerButton: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  registerButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  // ✨ НИЖНЯЯ ССЫЛКА
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 14,
    letterSpacing: 0.2,
    fontWeight: '500',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginLeft: 4,
  },
});

export default RegisterScreen;