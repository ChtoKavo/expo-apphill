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
          borderColor: isFocused ? '#FFA500' : '#2A2A3C',
        },
        isFocused && styles.inputWrapperFocused,
      ]}
    >
      {icon && (
        <Ionicons 
          name={icon} 
          size={20} 
          color={isFocused ? '#FFA500' : 'rgba(255,255,255,0.4)'} 
          style={styles.inputIcon}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="rgba(255, 255, 255, 0.4)"
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
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Цвета темы (оранжевый)
  const theme = { primary: '#FFA500' };

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
          {/* Тёмный контейнер с формой */}
          <LinearGradient
            colors={['#3D3D54', '#2E2E42', '#222230']}
            locations={[0, 0.4, 1]}
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
                colors={['#FFB347', '#FFA500', '#FF8C00']}
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
                colors={['#FFB347', '#FFA500', '#FF8C00']}
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
                colors={['#FFB347', '#FFA500', '#FF8C00']}
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
    backgroundColor: '#6B6B8D',
  },
  orangeCircle: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFA500',
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 15,
  },
  orangeCircleSmall: {
    position: 'absolute',
    top: 90,
    left: 70,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFA500',
    opacity: 0.6,
  },
  purpleCircle: {
    position: 'absolute',
    bottom: 60,
    right: -40,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#5A5A7A',
    opacity: 0.5,
  },
  headerContainer: {
    position: 'absolute',
    top: 50,
    right: 24,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFA500',
    textShadowColor: 'rgba(255, 165, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  formCard: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  formCardAccent: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 3,
    backgroundColor: '#FFA500',
    borderRadius: 2,
  },
  inputWrapper: {
    backgroundColor: '#1A1A28',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  inputWrapperFocused: {
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    height: '100%',
  },
  registerButton: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
    marginBottom: 20,
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    marginHorizontal: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFA500',
  },
  // Стили для анимации успешной регистрации
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1E1E2E', // полностью непрозрачный
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successAnimationContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 300,
    height: 300,
  },
  confettiParticle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  successRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    borderColor: '#FFA500',
  },
  successRing2: {
    borderColor: '#FF6B6B',
    borderWidth: 2,
  },
  successCircleOuter: {
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 25,
  },
  successCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  successPulse: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
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
    textShadowColor: 'rgba(255, 165, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    letterSpacing: 0.5,
  },
  successSubtext: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
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
    backgroundColor: '#222230',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
    margin: 4,
    borderWidth: 2,
    borderColor: '#2A2A3C',
  },
  categoryButtonSelected: {
    backgroundColor: '#FFA500',
    borderColor: '#FFA500',
  },
  categoryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  categoryButtonTextSelected: {
    color: '#222230',
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: '#FFA500',
    borderRadius: 22,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginTop: 8,
    alignItems: 'center',
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default RegisterScreen;