import React, { useState, useCallback, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { useTheme } from '../contexts/ThemeContext';
import { resetSocket } from '../services/globalSocket';

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

const RegisterScreen = ({ navigation }) => {
  const { error: showError, warning: showWarning, success: showSuccess } = useModalAlert();
  const theme = useTheme();
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
      // ⭐ КРИТИЧНО: Сбрасываем старый socket перед регистрацией нового пользователя
      try {
        await resetSocket();
        console.log('✅ Старый socket сброшен перед регистрацией');
      } catch (err) {
        console.error('⚠️ Ошибка при сбросе socket:', err);
      }
      
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
        // Показываем красивый оверлей с выбором категорий
        playSuccessAnimation();
      }
    } catch (err) {
      console.log('Ошибка регистрации:', err.response?.data);
      const errorMessage = err.response?.data?.error || 'Ошибка подключения к серверу';
      showErrorModal('Ошибка регистрации', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Анимации для успешной регистрации
  const successAnim = useRef(new Animated.Value(0)).current;
  const screenFadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const categoriesAnim = useRef(new Animated.Value(0)).current;
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [continueLoading, setContinueLoading] = useState(false);

  const categories = [
    { key: 'news', label: 'Новости' },
    { key: 'memes', label: 'Мемы' },
    { key: 'chat', label: 'Общение' },
    { key: 'tech', label: 'Технологии' },
    { key: 'sport', label: 'Спорт' },
    { key: 'music', label: 'Музыка' },
  ];

  // Запуск анимации категорий после основной анимации
  const playSuccessAnimation = () => {
    setShowSuccessOverlay(true);
    Animated.parallel([
      Animated.spring(successAnim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
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
      Animated.timing(ring1Anim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(ring2Anim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ]).start();
    // Анимация категорий через 700мс после старта
    setTimeout(() => {
      Animated.timing(categoriesAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 700);
  };

  const handleCategoryToggle = (key) => {
    setSelectedCategories((prev) =>
      prev.includes(key)
        ? prev.filter((c) => c !== key)
        : [...prev, key]
    );
  };

  const handleContinue = async () => {
    if (!selectedCategories.length) return;
    setContinueLoading(true);
    // Здесь можно отправить выбранные категории на сервер, если нужно
    setTimeout(() => {
      setContinueLoading(false);
      setShowSuccessOverlay(false);
      navigation.replace('Main');
    }, 700);
  };

  return (
    <View style={styles.container}>
      {/* Декоративные круги */}
      <View style={styles.orangeCircle} />
      <View style={styles.orangeCircleSmall} />
      <View style={styles.purpleCircle} />
      
      {/* Заголовок */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Регистрация</Text>
        <Text style={styles.headerSubtitle}>Создайте аккаунт</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Светлый контейнер с формой */}
          <LinearGradient
            colors={['#1A1F3A', '#1E2340']}
            locations={[0, 1]}
            style={styles.formCard}
          >
            {/* Декоративная линия сверху */}
            <View style={styles.formCardAccent} />

            <AnimatedInput
              placeholder="Имя пользователя"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!loading}
              icon="person-outline"
            />

            <AnimatedInput
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
              icon="mail-outline"
            />

            <AnimatedInput
              placeholder="Телефон"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
              icon="call-outline"
            />

            <AnimatedInput
              placeholder="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              editable={!loading}
              icon="lock-closed-outline"
            />

            <TouchableOpacity 
              style={[styles.registerButton, { opacity: loading ? 0.7 : 1 }]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#3B82F6', '#60A5FA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.registerButtonGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.registerButtonText}>Создать аккаунт</Text>
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
              <Text style={styles.footerText}>Уже есть аккаунт? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.footerLink}>Войти</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Оверлей успешной регистрации */}
      {showSuccessOverlay && (
        <Animated.View style={[styles.successOverlay, { opacity: screenFadeAnim }]}>
          <View style={styles.successContainer}>
            <Animated.View style={{ transform: [{ scale: successAnim }] }}>
              <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            </Animated.View>
            <Text style={styles.successTitle}>Регистрация успешна!</Text>
            <Text style={styles.successSubtitle}>Выберите категории интересов</Text>
            
            {/* Список категорий */}
            <Animated.View
              style={{
                opacity: categoriesAnim,
                transform: [{
                  translateY: categoriesAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  })
                }],
              }}
            >
              <View style={styles.categoriesList}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.categoryButton,
                      selectedCategories.includes(cat.key) && styles.categoryButtonSelected
                    ]}
                    onPress={() => handleCategoryToggle(cat.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      selectedCategories.includes(cat.key) && styles.categoryButtonTextSelected
                    ]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>

            <TouchableOpacity 
              style={[styles.continueButton, { opacity: continueLoading ? 0.7 : 1 }]}
              onPress={handleContinue}
              disabled={continueLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
              colors={['#3B82F6', '#60A5FA', '#93C5FD']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.continueButtonGradient}
              >
                {continueLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.continueButtonText}>Продолжить</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Оверлей успешной регистрации с выбором категорий */}
      {showSuccessOverlay && (
        <View style={styles.successOverlay}>
          <View style={styles.successAnimationContainer}>
            {/* Конфетти вокруг круга */}
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
            {/* Кольца */}
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
            {/* Оранжевый круг с галочкой */}
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
          {/* Текст и категории */}
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
            <Text style={styles.successSubtext}>Выберите интересные категории постов:</Text>
            <View style={styles.categoriesList}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryButton,
                    selectedCategories.includes(cat.key) && styles.categoryButtonSelected
                  ]}
                  onPress={() => handleCategoryToggle(cat.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.categoryButtonText,
                    selectedCategories.includes(cat.key) && styles.categoryButtonTextSelected
                  ]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[
                styles.continueButton,
                { opacity: selectedCategories.length ? 1 : 0.5 }
              ]}
              onPress={handleContinue}
              disabled={!selectedCategories.length || continueLoading}
              activeOpacity={0.8}
            >
              {continueLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.continueButtonText}>Продолжить</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
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
    fontSize: 30,
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
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  formCard: {
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    backgroundColor: '#1A1F3A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2D3447',
  },
  formCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
  },
  inputWrapper: {
    backgroundColor: '#2D3447',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#3D4456',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputWrapperFocused: {
    borderColor: '#60A5FA',
    backgroundColor: '#353F52',
    shadowColor: '#60A5FA',
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
    fontSize: 15,
    color: '#FFFFFF',
    height: '100%',
    fontWeight: '500',
  },
  registerButton: {
    height: 54,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
    marginBottom: 20,
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  registerButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerButtonText: {
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
  // Стили для анимации успешной регистрации
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successAnimationContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 280,
    height: 280,
  },
  confettiParticle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  successRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#6366F1',
  },
  successRing2: {
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  successCircleOuter: {
    shadowColor: '#6366F1',
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
    marginBottom: 18,
  },
  categoriesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 18,
    gap: 10,
  },
  categoryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    margin: 4,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  categoryButtonSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  categoryButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryButtonTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginTop: 8,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  continueButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default RegisterScreen;