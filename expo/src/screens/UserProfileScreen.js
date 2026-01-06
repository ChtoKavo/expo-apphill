import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Accelerometer } from 'expo-sensors';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { profileAPI, postAPI } from '../services/api';

const { width: screenWidth } = Dimensions.get('window');

const UserProfileScreen = ({ route, navigation }) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { error } = useModalAlert();
  const userParam = route?.params?.user ?? null;
  const userId = userParam?.id;

  // Состояние для полных данных пользователя
  const [fullUserData, setFullUserData] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);

  // 🎮 Акселерометр для параллакса карточки
  const cardRotateX = useRef(new Animated.Value(0)).current;
  const cardRotateY = useRef(new Animated.Value(0)).current;

  const user = useMemo(() => {
    if (!userParam || typeof userParam !== 'object') return null;
    return {
      id: userParam.id,
      username: (userParam.username || userParam.name || 'Пользователь').toString(),
      email: userParam.email || 'E-mail не указан',
      avatar: userParam.avatar || null,
      status: userParam.status || 'Статус не указан',
      bio: userParam.bio || '',
      cardColor: userParam.cardColor || '#FF6B6B',
    };
  }, [userParam]);

  // Загрузка полных данных пользователя
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Сначала используем данные из route.params
        if (user) {
          console.log('📌 UserProfileScreen: Получены данные пользователя из route.params, cardColor:', user.cardColor);
          setFullUserData({
            id: user.id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            status: user.status,
            bio: user.bio,
            cardColor: user.cardColor || '#FF6B6B',
          });
        }

        // Если есть userId, попытаемся получить дополнительные данные с сервера
        if (userId) {
          try {
            console.log('🔄 UserProfileScreen: Загружаем полные данные для userId:', userId);
            const response = await profileAPI.getUserProfile(userId);
            console.log('📦 UserProfileScreen: Ответ с сервера:', JSON.stringify(response.data, null, 2));
            
            if (response?.data) {
              const cardColorFromAPI = response.data.cardColor || user?.cardColor || '#FF6B6B';
              console.log('🎨 UserProfileScreen: cardColor из API:', response.data.cardColor);
              console.log('✅ UserProfileScreen: Загружены данные с сервера, cardColor:', cardColorFromAPI);
              setFullUserData({
                ...response.data,
                cardColor: cardColorFromAPI,
              });
            }
          } catch (apiErr) {
            console.error('⚠️ UserProfileScreen: Ошибка загрузки данных с сервера:', apiErr.message);
            console.log('⚠️ UserProfileScreen: Используем локальные данные');
            // Продолжаем использовать локальные данные
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки данных пользователя:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [userId, user]);

  // Загрузка постов пользователя
  useEffect(() => {
    if (!userId) return;

    const loadUserPosts = async () => {
      setPostsLoading(true);
      try {
        const response = await postAPI.getAuthorPosts(userId);
        setUserPosts(Array.isArray(response?.data) ? response.data : []);
      } catch (err) {
        console.error('Ошибка загрузки постов:', err);
        setUserPosts([]);
      } finally {
        setPostsLoading(false);
      }
    };

    loadUserPosts();
  }, [userId]);

  // 🎮 Подписка на акселерометр для параллакса карточки
  useEffect(() => {
    try {
      Accelerometer.setUpdateInterval(50);

      let subscription = null;
      let smoothRotateX = 0;
      let smoothRotateY = 0;
      const smoothingFactor = 0.15;

      const setupAccelerometer = async () => {
        try {
          subscription = Accelerometer.addListener((data) => {
            const maxRotation = 22;
            const amplificationFactor = 1.0;

            // Целевые углы с усилением
            const targetRotateY = Math.max(
              -maxRotation,
              Math.min(maxRotation, (data.x || 0) * maxRotation * amplificationFactor)
            );
            const targetRotateX = Math.max(
              -maxRotation,
              Math.min(maxRotation, (data.y || 0) * maxRotation * amplificationFactor * -1)
            );

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
  }, [cardRotateX, cardRotateY]);

  const displayUser = fullUserData || user;

  if (!displayUser) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={styles.fallbackContainer}>
          <Ionicons name="person-circle-outline" size={72} color={theme.textSecondary} />
          <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
            Не удалось загрузить данные пользователя
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.primaryButtonText}>Вернуться назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const rotateXInterpolation = cardRotateX.interpolate({
    inputRange: [-35, -20, 0, 20, 35],
    outputRange: ['-35deg', '-20deg', '0deg', '20deg', '35deg'],
    extrapolate: 'clamp',
  });

  const rotateYInterpolation = cardRotateY.interpolate({
    inputRange: [-35, -20, 0, 20, 35],
    outputRange: ['-35deg', '-20deg', '0deg', '20deg', '35deg'],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Фиксированная шапка */}
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
            colors={[displayUser.cardColor + 'E6', displayUser.cardColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          />
        </View>

        {/* АВАТАР НАЛОЖЕН НА БАННЕР */}
        <View style={styles.avatarOverlay}>
          <View style={[styles.avatarContainer, { borderColor: theme.surface }]}>
            {displayUser.avatar ? (
              <Image 
                source={{ uri: displayUser.avatar }} 
                style={styles.avatarLarge}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.avatarPlaceholderLarge, { backgroundColor: displayUser.cardColor }]}>
                <Text style={styles.avatarTextLarge}>
                  {displayUser.username ? displayUser.username[0].toUpperCase() : '?'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.contentWrapper}>
          {/* ИНФОРМАЦИЯ ПРОФИЛЯ */}
          <View style={[styles.profileInfoCard, { backgroundColor: theme.surface }]}>
            <View style={styles.profileHeader}>
              <View style={styles.profileHeaderText}>
                <Text style={[styles.profileName, { color: theme.text }]}>
                  {displayUser.username || 'Без имени'}
                </Text>
                <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                  {displayUser.email}
                </Text>
                {displayUser.status ? (
                  <Text style={[styles.statusText, { color: displayUser.cardColor }]}>
                    {displayUser.status}
                  </Text>
                ) : null}
              </View>
            </View>

            {displayUser.bio && (
              <View style={styles.bioContainer}>
                <Text style={[styles.bioLabel, { color: theme.textSecondary }]}>О себе</Text>
                <Text style={[styles.bioContent, { color: theme.text }]}>
                  {displayUser.bio}
                </Text>
              </View>
            )}
          </View>

        {/* Посты пользователя */}
        {postsLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : userPosts.length > 0 ? (
          <View style={[styles.card, styles.cardShadow, { backgroundColor: theme.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Посты ({userPosts.length})
            </Text>
            {userPosts.map((post) => (
              <View key={post.id} style={[styles.postCard, { backgroundColor: theme.surfaceLight, borderBottomColor: theme.border }]}>
                <View style={styles.postHeader}>
                  <Text style={[styles.postUsername, { color: theme.text }]} numberOfLines={1}>
                    {post.author?.username || displayUser.username}
                  </Text>
                  {post.createdAt && (
                    <Text style={[styles.postDate, { color: theme.textSecondary }]}>
                      {new Date(post.createdAt).toLocaleDateString('ru-RU')}
                    </Text>
                  )}
                </View>

                {post.content && (
                  <Text style={[styles.postContent, { color: theme.text }]} numberOfLines={3}>
                    {post.content}
                  </Text>
                )}

                {post.image && (
                  <Image
                    source={{ uri: post.image }}
                    style={styles.postImage}
                  />
                )}

                <View style={styles.postStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="heart" size={14} color={theme.primary} />
                    <Text style={[styles.statText, { color: theme.textSecondary }]}>
                      {post.likesCount || 0}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="chatbubble" size={14} color={theme.primary} />
                    <Text style={[styles.statText, { color: theme.textSecondary }]}>
                      {post.commentsCount || 0}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.cardShadow, { backgroundColor: theme.surface }]}>
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Пока нет постов
              </Text>
            </View>
          </View>
        )}

        {/* Кнопка закрытия */}
        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: theme.primary }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Ionicons name="close" size={18} color="#fff" style={styles.closeButtonIcon} />
          <Text style={styles.closeButtonText}>Закрыть профиль</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
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
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },

  // === HEADER ===
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

  // === ВК-СТИЛЬ БАННЕР ===
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

  // === АВАТАР НАЛОЖЕН НА БАННЕР ===
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

  // === ПРОФИЛЬ ИНФОРМАЦИЯ ===
  profileInfoCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
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
    marginBottom: 12,
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

  // === О СЕБЕ ===
  bioContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
  bioLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bioContent: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 19,
  },

  // === КАРТОЧКИ ===
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
    marginBottom: 14,
  },

  // === ПОСТЫ ===
  postCard: {
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  postUsername: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  postDate: {
    fontSize: 11,
    marginLeft: 8,
  },
  postContent: {
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 19,
  },
  postImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 10,
  },
  postStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // === ПУСТОЕ СОСТОЯНИЕ ===
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 15,
    marginTop: 12,
    fontWeight: '500',
  },

  // === КНОПКА ЗАКРЫТИЯ ===
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 13,
    marginBottom: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  closeButtonIcon: {
    marginRight: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // === АВАТАР СТИЛИ ===
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

export default UserProfileScreen;

