import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';

const VerificationScreen = ({ navigation, route }) => {
  const { theme, isDark } = useTheme();
  const { error: showError, warning: showWarning, success: showSuccess } = useModalAlert();
  const { email, phone, userData } = route.params;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 минут
  const [canResend, setCanResend] = useState(false);
  const codeInputRef = useRef(null);

  // Таймер обратного отсчета
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) {
      showWarning('Ошибка', 'Пожалуйста, введите код подтверждения');
      return;
    }

    if (code.length !== 6) {
      showWarning('Ошибка', 'Код должен содержать 6 цифр');
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.verifyCode({
        email,
        phone,
        code: code.trim(),
        ...userData,
      });

      console.log('✅ Аккаунт успешно подтвержден!');
      
      // ✅ Сразу переходим на Login (без модали)
      setTimeout(() => {
        navigation.navigate('Login');
      }, 500);
      
    } catch (err) {
      console.log('Ошибка верификации:', err.response?.data);
      const errorMessage = err.response?.data?.error || 'Ошибка верификации кода';
      showError('Ошибка', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      await authAPI.resendVerificationCode({ email, phone });
      showSuccess('Успех', 'Новый код отправлен на ваш email');
      setTimeLeft(300);
      setCanResend(false);
      setCode('');
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Ошибка при отправке кода';
      showError('Ошибка', errorMessage);
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
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons 
                  name="shield-checkmark" 
                  size={44} 
                  color="#4A90E2"
                  style={{ opacity: 0.9 }}
                />
              </View>
              <Text style={styles.title}>
                Подтверждение аккаунта
              </Text>
              <Text style={[
                styles.subtitle,
                { color: isDark ? 'rgba(255, 255, 255, 0.8)' : theme.textSecondary }
              ]}>
                Мы отправили код подтверждения на email
              </Text>
              <Text style={[
                styles.phoneNumber,
                { color: theme.primary }
              ]}>
                {email}
              </Text>
            </View>

            <View style={[
              styles.formContainer,
              {
                backgroundColor: isDark ? 'rgba(36, 37, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(74, 144, 226, 0.15)'
              }
            ]}>
              <Text style={[
                styles.label,
                { color: isDark ? 'rgba(255, 255, 255, 0.7)' : theme.textSecondary }
              ]}>
                Введите 6-значный код
              </Text>

              <View style={[
                styles.codeInputContainer,
                {
                  backgroundColor: isDark ? theme.inputBackground : '#FFFFFF',
                  borderColor: isDark ? theme.border : 'rgba(74, 144, 226, 0.2)'
                }
              ]}>
                <Ionicons 
                  name="lock-closed"
                  size={20}
                  color={theme.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={codeInputRef}
                  style={[
                    styles.codeInput,
                    { color: theme.text }
                  ]}
                  placeholder="000000"
                  placeholderTextColor={isDark 
                    ? 'rgba(255,255,255,0.4)' 
                    : 'rgba(0,0,0,0.4)'}
                  value={code}
                  onChangeText={(text) => {
                    // Разрешаем только цифры
                    const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
                    setCode(numericText);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                />
              </View>

              {/* Таймер */}
              <View style={styles.timerContainer}>
                {timeLeft > 0 ? (
                  <Text style={[
                    styles.timerText,
                    { color: timeLeft < 60 ? '#FF6B6B' : theme.primary }
                  ]}>
                    ⏱ Код действует: {formatTime(timeLeft)}
                  </Text>
                ) : (
                  <Text style={[styles.timerText, { color: '#FF6B6B' }]}>
                    ⚠ Код истек
                  </Text>
                )}
              </View>

              {/* Кнопка подтверждения */}
              <TouchableOpacity 
                style={[
                  styles.button,
                  { opacity: loading || !code || code.length !== 6 ? 0.6 : 1 }
                ]}
                onPress={handleVerifyCode}
                disabled={loading || !code || code.length !== 6}
                activeOpacity={0.8}
              >
                <View style={[styles.buttonGradient, { backgroundColor: theme.primary }]}>
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>
                      Подтвердить код
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Кнопка повторной отправки */}
              <TouchableOpacity 
                style={[
                  styles.resendButton,
                  { opacity: canResend && !loading ? 1 : 0.5 }
                ]}
                onPress={handleResendCode}
                disabled={!canResend || loading}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.resendText,
                  { color: canResend ? theme.primary : theme.textSecondary }
                ]}>
                  {canResend ? 'Отправить код заново' : 'Отправить код снова'}
                </Text>
              </TouchableOpacity>

              {/* Справка */}
              <View style={styles.helpContainer}>
                <Ionicons 
                  name="information-circle-outline"
                  size={16}
                  color={theme.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={[
                  styles.helpText,
                  { color: isDark ? 'rgba(255, 255, 255, 0.6)' : theme.textSecondary }
                ]}>
                  Не получили код? Проверьте папку СПАМа или попросите новый
                </Text>
              </View>

              {/* Кнопка "Назад" */}
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name="chevron-back"
                  size={20}
                  color={theme.primary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[
                  styles.backText,
                  { color: theme.primary }
                ]}>
                  Вернуться к регистрации
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
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    backgroundColor: '#fff',
    borderColor: 'rgba(74,144,226,0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.5,
    color: '#4A90E2',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.2,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  formContainer: {
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  codeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    marginBottom: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    height: 56,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  inputIcon: {
    marginRight: 10,
  },
  codeInput: {
    flex: 1,
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: '700',
    textAlign: 'center',
    height: '100%',
    paddingVertical: 8,
  },
  timerContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  button: {
    marginBottom: 16,
    overflow: 'hidden',
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#4A90E2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    borderRadius: 16,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  resendButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  helpContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
  },
  helpText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  backButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default VerificationScreen;
