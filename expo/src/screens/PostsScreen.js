import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  Modal,
  Animated,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Share,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { postAPI, groupAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';

const { width } = Dimensions.get('window');
const postImageHeight = width * 0.5625; // 16:9 aspect ratio

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

// Вспомогательная функция для безопасной обработки URI
const getImageUri = (uri) => {
  if (!uri) return null;
  if (typeof uri === 'string') return uri;
  if (typeof uri === 'object' && uri.uri && typeof uri.uri === 'string') return uri.uri;
  return null;
};

// Вспомогательная функция для форматирования времени
const formatTimeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'только что';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} мин. назад`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ч. назад`;
  return `${Math.floor(diffInSeconds / 86400)} дн. назад`;
};

// Вспомогательная функция для шаринга
const sharePost = async (post) => {
  try {
    await Share.share({
      message: post.content || 'Посмотрите этот пост!',
      url: post.image,
    });
  } catch (error) {
    console.error('Ошибка при шаринге:', error);
  }
};

const PostsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const { error, warning, success, info } = useModalAlert();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImage, setNewPostImage] = useState('');
  const [newPostImages, setNewPostImages] = useState([]); // Множественные изображения
  const [newPostHashtags, setNewPostHashtags] = useState([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editText, setEditText] = useState('');
  const [editImage, setEditImage] = useState('');
  const [isEditingLoading, setIsEditingLoading] = useState(false);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelConfirmAnim] = useState(new Animated.Value(0));
  const [showActionModal, setShowActionModal] = useState(false);
  const [currentPost, setCurrentPost] = useState(null);
  const [actionModalAnim] = useState(new Animated.Value(0));
  const [selectedHashtag, setSelectedHashtag] = useState(null);
  const [allHashtags, setAllHashtags] = useState([]);
  const [showHashtagFilter, setShowHashtagFilter] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportText, setSupportText] = useState('');
  const [supportCategory, setSupportCategory] = useState('general');
  const [supportLoading, setSupportLoading] = useState(false);
  const [showMyTicketsModal, setShowMyTicketsModal] = useState(false);
  const [myTickets, setMyTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketReplies, setTicketReplies] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const drawerAnim = new Animated.Value(0);
  
  // ✨ НОВЫЕ СОСТОЯНИЯ ДЛЯ ФУНКЦИЙ ПОСТОВ
  const [sortType, setSortType] = useState('newest'); // newest, trending, popular
  const [filterType, setFilterType] = useState('all'); // all, friends
  const [searchText, setSearchText] = useState('');
  const [showSortModal, setShowSortModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const [bookmarkedPosts, setBookmarkedPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  // ✨ СОСТОЯНИЯ ДЛЯ ПОЛНОЭКРАННОГО ПРОСМОТРА ГАЛЕРЕИ
  const [showFullscreenGallery, setShowFullscreenGallery] = useState(false);
  const [currentGalleryImages, setCurrentGalleryImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // ✨ DEBOUNCE для поиска (не искать при каждом символе)
  const searchTimeoutRef = React.useRef(null);

  const scrollY = new Animated.Value(0);
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPosts();
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, []);

  // Анимация открытия/закрытия бокового меню
  const menuAnimValue = React.useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: showHeaderMenu ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // Анимация для бургер меню
    Animated.timing(menuAnimValue, {
      toValue: showHeaderMenu ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [showHeaderMenu, menuAnimValue]);

  // ✨ НОВАЯ ФУНКЦИЯ: Загрузка постов с сортировкой и фильтрацией
  const fetchPosts = async (newSort = sortType, newFilter = filterType, searchQuery = '') => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      
      // ВРЕМЕННО: используем старый эндпоинт, пока новые не добавлены на сервер
      const response = await postAPI.getPosts();
      
      // DEBUG: Проверяем структуру данных одного поста
      if (response.data && response.data.length > 0) {
        console.log('🔍 DEBUG - First post structure:', JSON.stringify(response.data[0], null, 2));
      }
      
      const postsData = response.data.map(post => {
        let processedPost = { ...post };
        
        // Если images это строка JSON, парсим её
        if (processedPost.images && typeof processedPost.images === 'string') {
          try {
            processedPost.images = JSON.parse(processedPost.images);
          } catch (e) {
            processedPost.images = null;
          }
        }
        
        // Если у поста есть изображение в поле image, но нет images массива
        // добавляем его в images для совместимости
        if (processedPost.image && (!processedPost.images || processedPost.images.length === 0)) {
          processedPost.images = [processedPost.image];
        }
        
        return processedPost;
      });
      
      // DEBUG: Проверяем трансформированные данные
      console.log('🔍 DEBUG - Processed posts:', postsData.map(p => ({ 
        id: p.id, 
        has_image: !!p.image, 
        images_array: p.images ? `Array(${p.images.length})` : 'null' 
      })));
      
      setPosts(postsData);
      
      // Когда эндпоинты будут готовы, раскомментируйте:
      /*
      let url = 'http://151.247.196.66:3001/api/posts/feed';
      const params = {
        sort: newSort,
        filter: newFilter,
        search: searchQuery,
        page: 1,
        limit: 20,
      };
      
      const queryString = new URLSearchParams(params).toString();
      
      const response = await axios.get(`${url}?${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setPosts(response.data.posts || response.data || []);
      */
    } catch (err) {
      console.error('Ошибка загрузки постов:', err);
      error('Ошибка', 'Не удалось загрузить посты');
    } finally {
      setLoading(false);
    }
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Поиск постов (Real-time с фильтрацией)
  const handleSearch = async (query) => {
    setSearchText(query);
    
    // Отменяем предыдущий таймер поиска
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!query.trim()) {
      // Если поле пусто - показываем все посты
      loadPosts();
      return;
    }
    
    // REAL-TIME поиск с минимальной задержкой
    searchTimeoutRef.current = setTimeout(() => {
      try {
        const lowerQuery = query.toLowerCase().trim();
        
        // Локальный поиск по всем полям
        const filtered = posts.filter(post => {
          // Поиск в содержании поста
          const contentMatch = post.content?.toLowerCase().includes(lowerQuery);
          
          // Поиск по имени автора
          const usernameMatch = post.username?.toLowerCase().includes(lowerQuery);
          
          // Извлекаем и ищем хештеги
          const hashtags = post.content?.match(/#[\w\p{L}]+/gu) || [];
          const hashtagsMatch = hashtags.some(tag => 
            tag.toLowerCase().includes(lowerQuery)
          );
          
          // Возвращаем true если совпадение найдено в любом из полей
          return contentMatch || usernameMatch || hashtagsMatch;
        });
        
        setPosts(filtered);
      } catch (err) {
        console.error('Ошибка поиска:', err);
      }
    }, 200); // Задержка 200ms для плавного поиска
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Управление закладками
  const handleBookmark = async (postId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      const post = posts.find(p => p.id === postId);
      
      // ВРЕМЕННО: только меняем статус локально
      setPosts(posts.map(p => 
        p.id === postId ? { ...p, is_bookmarked: !p.is_bookmarked } : p
      ));
      success('Успешно', post?.is_bookmarked ? 'Пост удален из закладок' : 'Пост добавлен в закладки');
      
      // Когда эндпоинты будут готовы, раскомментируйте:
      /*
      if (!post.is_bookmarked) {
        await axios.post(
          `http://151.247.196.66:3001/api/posts/${postId}/bookmark`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        success('Успешно', 'Пост добавлен в закладки');
      } else {
        await axios.delete(
          `http://151.247.196.66:3001/api/posts/${postId}/bookmark`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        success('Успешно', 'Пост удален из закладки');
      }
      
      setPosts(posts.map(p => 
        p.id === postId ? { ...p, is_bookmarked: !p.is_bookmarked } : p
      ));
      */
    } catch (err) {
      console.error('Ошибка закладки:', err);
      error('Ошибка', 'Не удалось изменить закладку');
    }
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Загрузка закладок
  const loadBookmarks = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      // ВРЕМЕННО: показываем посты с is_bookmarked = true
      const bookmarked = posts.filter(p => p.is_bookmarked);
      setBookmarkedPosts(bookmarked);
      setShowBookmarksModal(true);
      
      // Когда эндпоинты будут готовы, раскомментируйте:
      /*
      const response = await axios.get('http://151.247.196.66:3001/api/posts/bookmarks/my', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setBookmarkedPosts(response.data.posts || response.data || []);
      setShowBookmarksModal(true);
      */
    } catch (err) {
      console.error('Ошибка загрузки закладок:', err);
      error('Ошибка', 'Не удалось загрузить закладки');
    }
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Загрузка всех постов (Главная)
  const loadAllPosts = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      
      const response = await postAPI.getPosts();
      setPosts(response.data);
      setSortType('newest');
      setShowHeaderMenu(false);
      
      // Когда эндпоинты будут готовы, раскомментируйте:
      /*
      const response = await axios.get(
        'http://151.247.196.66:3001/api/posts/feed?sort=newest&limit=50',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setPosts(response.data.data || response.data || []);
      setSortType('newest');
      setShowHeaderMenu(false);
      success('Успешно', 'Главная лента загружена');
      */
    } catch (err) {
      console.error('Ошибка загрузки постов:', err);
      error('Ошибка', 'Не удалось загрузить посты');
    } finally {
      setLoading(false);
    }
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Загрузка рекомендаций
  const loadRecommendations = async (postId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      // ВРЕМЕННО: показываем популярные посты
      const sorted = [...posts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
      setPosts(sorted);
      setShowRecommendations(true);
      
      // Когда эндпоинты будут готовы, раскомментируйте:
      /*
      const response = await axios.get(
        `http://151.247.196.66:3001/api/posts/${postId}/recommendations`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setPosts(response.data.posts || response.data || []);
      setShowRecommendations(true);
      */
    } catch (err) {
      console.error('Ошибка загрузки рекомендаций:', err);
      error('Ошибка', 'Не удалось загрузить рекомендации');
    }
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Загрузка популярных постов
  const loadPopularPosts = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      
      // Сортируем посты по количеству лайков
      const sorted = [...posts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
      setPosts(sorted);
      setSortType('popular');
      setShowHeaderMenu(false);
      
      // Когда эндпоинты будут готовы, раскомментируйте:
      /*
      const response = await axios.get(
        'http://151.247.196.66:3001/api/posts/feed?sort=popular&limit=50',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setPosts(response.data.data || response.data || []);
      setSortType('popular');
      setShowHeaderMenu(false);
      success('Успешно', 'Популярные посты загружены');
      */
    } catch (err) {
      console.error('Ошибка загрузки популярных постов:', err);
      error('Ошибка', 'Не удалось загрузить популярные посты');
    } finally {
      setLoading(false);
    }
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Загрузка трендовых постов
  const loadTrendingPosts = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      
      // Сортируем посты по лайкам за последнее время (постам старше 3 дней даем меньший вес)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const sorted = [...posts].sort((a, b) => {
        const aDate = new Date(a.created_at);
        const bDate = new Date(b.created_at);
        const aWeight = (aDate > threeDaysAgo ? 1.5 : 0.5) * (a.likes_count || 0);
        const bWeight = (bDate > threeDaysAgo ? 1.5 : 0.5) * (b.likes_count || 0);
        return bWeight - aWeight;
      });
      
      setPosts(sorted);
      setSortType('trending');
      setShowHeaderMenu(false);
      
      // Когда эндпоинты будут готовы, раскомментируйте:
      /*
      const response = await axios.get(
        'http://151.247.196.66:3001/api/posts/feed?sort=trending&limit=50',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setPosts(response.data.data || response.data || []);
      setSortType('trending');
      setShowHeaderMenu(false);
      success('Успешно', 'Трендовые посты загружены');
      */
    } catch (err) {
      console.error('Ошибка загрузки трендовых постов:', err);
      error('Ошибка', 'Не удалось загрузить трендовые посты');
    } finally {
      setLoading(false);
    }
  };

  const loadPosts = async () => {
    try {
      const response = await postAPI.getPosts();
      console.log('Posts loaded:', response.data.length, 'posts');
      
      // ✨ КРИТИЧНО: Трансформируем данные как в fetchPosts
      const postsData = response.data.map(post => {
        let processedPost = { ...post };
        
        // Если images это строка JSON, парсим её
        if (processedPost.images && typeof processedPost.images === 'string') {
          try {
            processedPost.images = JSON.parse(processedPost.images);
          } catch (e) {
            console.warn('Не удалось парсить JSON images:', e);
            processedPost.images = null;
          }
        }
        
        // Если у поста есть изображение в поле image, но нет images массива
        // добавляем его в images для совместимости
        if (processedPost.image && (!processedPost.images || processedPost.images.length === 0)) {
          processedPost.images = [processedPost.image];
        }
        
        return processedPost;
      });
      
      // DEBUG: Проверяем трансформированные данные
      console.log('🔍 loadPosts - Processed posts:', postsData.map(p => ({ 
        id: p.id, 
        has_image: !!p.image, 
        images_array: p.images ? `Array(${p.images.length})` : 'null' 
      })));
      
      setPosts(postsData);
      
      // Извлекаем все уникальные хештеги из постов
      const hashtags = new Set();
      postsData.forEach(post => {
        console.log('Post content:', post.content);
        // ✨ ИСПРАВЛЕНО: Regex теперь поддерживает Unicode
        const matches = post.content?.match(/#[\p{L}\p{N}_-]+/gu) || [];
        console.log('Hashtags found in post:', matches);
        matches.forEach(tag => hashtags.add(tag));
      });
      const hashtagsArray = Array.from(hashtags).sort();
      console.log('All unique hashtags:', hashtagsArray);
      setAllHashtags(hashtagsArray);
    } catch (err) {
      console.error('Ошибка загрузки постов:', err);
      error('Ошибка', 'Не удалось загрузить посты');
    }
  };

  const createPost = async () => {
    if (!newPostText.trim() && newPostImages.length === 0) {
      warning('Ошибка', 'Добавьте текст или изображение');
      return;
    }

    setLoading(true);
    try {
      // Формируем текст поста с хештегами
      let contentWithHashtags = newPostText.trim();
      if (newPostHashtags.length > 0) {
        contentWithHashtags += ' ' + newPostHashtags.join(' ');
      }

      const postData = {
        content: contentWithHashtags,
      };

      // Отправляем первое изображение как основное для совместимости
      if (newPostImages.length > 0) {
        postData.image = newPostImages[0];
        postData.images = newPostImages;
        
        // DEBUG: Логируем отправляемые данные
        console.log('📤 Creating post with images:', {
          imageCount: newPostImages.length,
          hasImage: !!postData.image,
          hasImagesArray: !!postData.images,
          imagesArrayLength: postData.images?.length
        });
      }

      await postAPI.createPost(postData);
      setNewPostText('');
      setNewPostImages([]);
      setNewPostHashtags([]);
      setHashtagInput('');
      setShowCreateModal(false);
      loadPosts();
    } catch (err) {
      error('Ошибка', 'Не удалось создать пост');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      warning('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultiple: true,
      quality: 0.3,
      base64: true,
    });

    if (!result.canceled) {
      const maxImages = 5;
      const selectedImages = result.assets.slice(0, maxImages).map(asset => 
        `data:image/jpeg;base64,${asset.base64}`
      );
      
      setNewPostImages([...newPostImages, ...selectedImages].slice(0, maxImages));
      
      if (selectedImages.length > 0) {
        success('Успешно', `Добавлено ${selectedImages.length} изображений`);
      }
    }
  };

  const removeImage = (index) => {
    setNewPostImages(newPostImages.filter((_, i) => i !== index));
  };

  const toggleLike = async (postId) => {
    try {
      await postAPI.likePost(postId);
      loadPosts();
    } catch (err) {
      error('Ошибка', 'Не удалось поставить лайк');
    }
  };

  const openEditModal = (post) => {
    setEditingPost(post);
    setEditText(post.content || '');
    setEditImage(post.image || '');
    setShowEditModal(true);
  };

  const updatePost = async () => {
    if (!editText.trim() && !editImage) {
      warning('Ошибка', 'Добавьте текст или изображение');
      return;
    }

    setIsEditingLoading(true);
    try {
      await postAPI.updatePost(editingPost.id, {
        content: editText.trim(),
        image: editImage || null,
      });
      success('Успешно', 'Пост обновлен');
      setShowEditModal(false);
      loadPosts();
    } catch (err) {
      error('Ошибка', 'Не удалось обновить пост');
    } finally {
      setIsEditingLoading(false);
    }
  };

  const deletePost = async (postId) => {
    Alert.alert(
      'Удалить пост',
      'Вы уверены? Это действие необратимо.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await postAPI.deletePost(postId);
              success('Успешно', 'Пост удален');
              loadPosts();
            } catch (err) {
              error('Ошибка', 'Не удалось удалить пост');
            }
          },
        },
      ]
    );
  };

  const openActionModal = (post) => {
    setCurrentPost(post);
    setShowActionModal(true);
    Animated.spring(actionModalAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeActionModal = () => {
    Animated.timing(actionModalAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowActionModal(false);
      setCurrentPost(null);
    });
  };

  // ✨ НОВАЯ ФУНКЦИЯ: Открыть полноэкранную галерею
  const openFullscreenGallery = (images, index = 0) => {
    setCurrentGalleryImages(images);
    setCurrentImageIndex(index);
    setShowFullscreenGallery(true);
  };

  const submitSupportTicket = async () => {
    if (!supportText.trim()) {
      warning('Ошибка', 'Пожалуйста, опишите вашу проблему');
      return;
    }

    setSupportLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        warning('Ошибка', 'Необходима авторизация');
        return;
      }
      
      await axios.post(
        'http://151.247.196.66:3001/api/support/tickets',
        {
          subject: 'Обращение в поддержку',
          message: supportText,
          category: supportCategory,
          priority: 'medium',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      success('Успешно', 'Ваше обращение отправлено. Спасибо за обращение!');
      setSupportText('');
      setSupportCategory('general');
      setShowSupportModal(false);
    } catch (err) {
      console.error('Support ticket error:', err);
      error('Ошибка', err.response?.data?.error || 'Не удалось отправить обращение');
    } finally {
      setSupportLoading(false);
    }
  };

  const loadMyTickets = async () => {
    setTicketsLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        warning('Ошибка', 'Необходима авторизация');
        return;
      }

      const response = await axios.get(
        'http://151.247.196.66:3001/api/support/tickets',
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setMyTickets(response.data?.data || response.data || []);
    } catch (err) {
      console.error('Error loading tickets:', err);
      error('Ошибка', 'Не удалось загрузить обращения');
    } finally {
      setTicketsLoading(false);
    }
  };

  const loadTicketReplies = async (ticketId) => {
    setTicketsLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        warning('Ошибка', 'Необходима авторизация');
        return;
      }

      const response = await axios.get(
        `http://151.247.196.66:3001/api/support/tickets/${ticketId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Ticket detail response:', response.data);
      
      // Правильно обрабатываем структуру данных
      const ticketData = response.data?.data || response.data;
      setSelectedTicket(ticketData);
      
      // Загружаем ответы (replies или messages)
      const replies = response.data?.replies || response.data?.messages || [];
      setTicketReplies(replies);
    } catch (err) {
      console.error('Error loading ticket replies:', err);
      error('Ошибка', 'Не удалось загрузить ответы');
    } finally {
      setTicketsLoading(false);
    }
  };

  const pickEditImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      warning('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.cancelled) {
      setEditImage(result.assets[0].uri);
    }
  };

  const addHashtag = () => {
    const tag = hashtagInput.trim();
    if (!tag) {
      warning('Ошибка', 'Введите хештег');
      return;
    }
    
    // Добавляем # если его нет
    const formattedTag = tag.startsWith('#') ? tag : '#' + tag;
    
    if (newPostHashtags.includes(formattedTag)) {
      warning('Ошибка', 'Этот хештег уже добавлен');
      return;
    }
    
    setNewPostHashtags([...newPostHashtags, formattedTag]);
    setHashtagInput('');
  };

  const removeHashtag = (index) => {
    setNewPostHashtags(newPostHashtags.filter((_, i) => i !== index));
  };

  const PostCard = React.memo(({ item }) => {
    // Извлекаем хештеги и очищаем текст
    // ✨ ИСПРАВЛЕНО: Regex теперь поддерживает Unicode (кириллица, эмодзи и т.д.)
    const hashtags = (item.content?.match(/#[\p{L}\p{N}_-]+/gu) || []);
    const contentWithoutHashtags = item.content
      ?.replace(/#[\p{L}\p{N}_-]+/gu, '')
      .trim() || '';
    
    // Анимация для изображений в галерее
    const imageScaleAnimations = React.useRef(
      item.images?.map(() => new Animated.Value(1)) || []
    ).current;
    
    const handleImagePressIn = (idx) => {
      Animated.spring(imageScaleAnimations[idx], {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 100,
        friction: 7,
      }).start();
    };
    
    const handleImagePressOut = (idx) => {
      Animated.spring(imageScaleAnimations[idx], {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 7,
      }).start();
    };
    
    return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
    >
      <Animated.View style={[styles.postContainer, { backgroundColor: theme.surface }]}>
        <View style={styles.postHeader}>
          <View style={styles.headerLeft}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.userInfo}>
              <Text style={[styles.username, { color: theme.text }]}>{item.username}</Text>
              <Text style={[styles.postTime, { color: theme.textSecondary }]}>
                {formatTimeAgo(item.created_at)}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.moreButton}
            onPress={() => openActionModal(item)}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        {contentWithoutHashtags && (
          <Text style={[styles.postContent, { color: theme.text }]}>
            {contentWithoutHashtags}
          </Text>
        )}

        {/* Показываем одно изображение если нет массива images */}
        {item.image && (!item.images || item.images.length === 0) ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setSelectedPost(item)}
          >
            <Image
              source={{ uri: getImageUri(item.image) }}
              style={styles.postImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : null}

        {/* Галерея изображений поста */}
        {item.images && item.images.length > 0 ? (
          <>
            <View style={styles.imagesGalleryContainer}>
              {/* Первое большое изображение */}
              <TouchableOpacity
                activeOpacity={1}
                onPressIn={() => handleImagePressIn(0)}
                onPressOut={() => handleImagePressOut(0)}
                onPress={() => openFullscreenGallery(item.images, 0)}
              >
                <Animated.View
                  style={[
                    styles.mainImageContainer,
                    {
                      transform: [{ scale: imageScaleAnimations[0] }],
                    }
                  ]}
                >
                  <Animated.Image
                    source={{ uri: getImageUri(item.images[0]) }}
                    style={styles.mainImage}
                    resizeMode="cover"
                  />
                </Animated.View>
              </TouchableOpacity>

              {/* Остальные изображения внизу */}
              {item.images.length > 1 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbnailsScroll}
                  contentContainerStyle={styles.thumbnailsContainer}
                >
                  {item.images.slice(1).map((image, idx) => (
                    <TouchableOpacity
                      key={idx + 1}
                      activeOpacity={1}
                      onPressIn={() => handleImagePressIn(idx + 1)}
                      onPressOut={() => handleImagePressOut(idx + 1)}
                      onPress={() => openFullscreenGallery(item.images, idx + 1)}
                    >
                      <Animated.View
                        style={[
                          styles.thumbnailContainer,
                          {
                            transform: [{ scale: imageScaleAnimations[idx + 1] }],
                          }
                        ]}
                      >
                        <Animated.Image
                          source={{ uri: getImageUri(image) }}
                          style={styles.thumbnail}
                          resizeMode="cover"
                        />
                      </Animated.View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </>
        ) : null}

        {/* Хештеги под постом */}
        {hashtags.length > 0 && (
          <View style={styles.hashtagsContainer}>
            {hashtags.map((tag, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setSelectedHashtag(selectedHashtag === tag ? null : tag)}
              >
                <Text style={[
                  styles.hashtagText,
                  { color: theme.primary }
                ]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.postActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => toggleLike(item.id)}
          >
            <Ionicons
              name={item.is_liked ? 'heart' : 'heart-outline'}
              size={24}
              color={item.is_liked ? '#FF3B30' : theme.textSecondary}
            />
            <Text style={[
              styles.actionText,
              { color: item.is_liked ? '#FF3B30' : theme.textSecondary }
            ]}>
              {item.likes_count}
            </Text>
          </TouchableOpacity>

          {/* ✨ НОВАЯ КНОПКА: Закладка */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleBookmark(item.id)}
          >
            <Ionicons
              name={item.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={item.is_bookmarked ? theme.primary : theme.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => sharePost(item)}
          >
            <Ionicons name="share-outline" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </TouchableOpacity>
    );
  });

  const renderSidebar = () => (
    <Animated.View style={[
      styles.sidebar,
      {
        backgroundColor: theme.surface,
        borderRightColor: theme.border,
        transform: [{
          translateX: drawerAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [-280, 0],
          }),
        }],
      }
    ]}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.sidebarContent}>
        {/* ДЕЙСТВИЯ СЕКЦИЯ - ВВЕРХУ */}
        <View style={[styles.sidebarSection, { marginBottom: 24 }]}>
          {/* Создать пост */}
          <TouchableOpacity 
            style={[styles.sidebarItem, { 
              backgroundColor: theme.primary,
              borderRadius: 14,
              marginBottom: 0,
              marginHorizontal: 10,
              paddingHorizontal: 16,
              paddingVertical: 14,
              elevation: 4,
              shadowColor: theme.primary,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
            }]}
            onPress={() => {
              setShowCreateModal(true);
              setShowHeaderMenu(false);
            }}
          >
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={[styles.sidebarItemText, { color: '#fff', fontWeight: '700', marginLeft: 8 }]}>
              Новый пост
            </Text>
          </TouchableOpacity>
        </View>

        {/* ЛЕНТЫ СЕКЦИЯ */}
        <View style={styles.sidebarSection}>
          <View style={styles.sidebarSectionHeader}>
            <Text style={[styles.sidebarSectionTitle, { color: theme.textSecondary }]}>ЛЕНТЫ</Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.sidebarItem, sortType === 'newest' && { backgroundColor: theme.primary + '15' }]}
            onPress={loadAllPosts}
          >
            <Ionicons name="home" size={20} color={sortType === 'newest' ? theme.primary : theme.textSecondary} />
            <Text style={[styles.sidebarItemText, { color: sortType === 'newest' ? theme.text : theme.textSecondary, fontWeight: sortType === 'newest' ? '700' : '600', marginLeft: 8 }]}>Главная</Text>
            {sortType === 'newest' && <Ionicons name="checkmark-circle" size={18} color={theme.primary} style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.sidebarItem, sortType === 'popular' && { backgroundColor: '#FF4500' + '15' }]}
            onPress={loadPopularPosts}
          >
            <Ionicons name="flame" size={20} color={sortType === 'popular' ? '#FF4500' : theme.textSecondary} />
            <Text style={[styles.sidebarItemText, { color: sortType === 'popular' ? theme.text : theme.textSecondary, fontWeight: sortType === 'popular' ? '700' : '600', marginLeft: 8 }]}>Популярное</Text>
            {sortType === 'popular' && <Ionicons name="checkmark-circle" size={18} color="#FF4500" style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.sidebarItem, sortType === 'trending' && { backgroundColor: '#3B82F6' + '15' }]}
            onPress={loadTrendingPosts}
          >
            <Ionicons name="trending-up" size={20} color={sortType === 'trending' ? '#3B82F6' : theme.textSecondary} />
            <Text style={[styles.sidebarItemText, { color: sortType === 'trending' ? theme.text : theme.textSecondary, fontWeight: sortType === 'trending' ? '700' : '600', marginLeft: 8 }]}>Тренды</Text>
            {sortType === 'trending' && <Ionicons name="checkmark-circle" size={18} color="#3B82F6" style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
        </View>

        {/* ИНСТРУМЕНТЫ СЕКЦИЯ */}
        <View style={[styles.sidebarSection, { marginTop: 16 }]}>
          <View style={styles.sidebarSectionHeader}>
            <Text style={[styles.sidebarSectionTitle, { color: theme.textSecondary }]}>ИНСТРУМЕНТЫ</Text>
          </View>
          
          {/* Сортировка */}
          <TouchableOpacity 
            style={styles.sidebarItem}
            onPress={() => {
              setShowSortModal(true);
              setShowHeaderMenu(false);
            }}
          >
            <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="swap-vertical" size={20} color={theme.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.sidebarItemText, { color: theme.text, fontWeight: '600' }]}>Сортировка</Text>
              <Text style={[styles.sidebarItemText, { color: theme.textSecondary, fontSize: 12, marginTop: 2 }]}>
                {sortType === 'newest' && 'Новые'}
                {sortType === 'trending' && 'Тренды'}
                {sortType === 'popular' && 'Популярные'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
          
          {/* Фильтр */}
          <TouchableOpacity 
            style={styles.sidebarItem}
            onPress={() => {
              setShowFilterModal(true);
              setShowHeaderMenu(false);
            }}
          >
            <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="funnel" size={20} color={theme.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.sidebarItemText, { color: theme.text, fontWeight: '600' }]}>Фильтр</Text>
              <Text style={[styles.sidebarItemText, { color: theme.textSecondary, fontSize: 12, marginTop: 2 }]}>
                {filterType === 'all' && 'Все посты'}
                {filterType === 'friends' && 'От друзей'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
          
          {/* Закладки */}
          <TouchableOpacity 
            style={styles.sidebarItem}
            onPress={() => {
              loadBookmarks();
              setShowHeaderMenu(false);
            }}
          >
            <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="bookmark" size={20} color="#f59e0b" />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.sidebarItemText, { color: theme.text, fontWeight: '600' }]}>Закладки</Text>
              <Text style={[styles.sidebarItemText, { color: theme.textSecondary, fontSize: 12, marginTop: 2 }]}>
                Ваши сохраненные
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* СООБЩЕСТВА СЕКЦИЯ */}
        <View style={[styles.sidebarSection, { marginTop: 16 }]}>
          <View style={styles.sidebarSectionHeader}>
            <Text style={[styles.sidebarSectionTitle, { color: theme.textSecondary }]}>СООБЩЕСТВА</Text>
            <TouchableOpacity 
              onPress={() => {
                navigation.navigate('Communities');
                setShowHeaderMenu(false);
              }}
              style={{ 
                padding: 6,
                borderRadius: 8,
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {/* Кнопка "Все сообщества" */}
          <TouchableOpacity 
            style={[styles.sidebarItem, { marginBottom: 10 }]}
            onPress={() => {
              navigation.navigate('Communities');
              setShowHeaderMenu(false);
            }}
          >
            <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="globe" size={20} color={theme.primary} />
            </View>
            <Text style={[styles.sidebarItemText, { color: theme.text, marginLeft: 8, fontWeight: '600' }]}>
              Все сообщества
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.sidebarItem}>
            <View style={[styles.sidebarCommunityIcon, { backgroundColor: '#FF4500' }]}>
              <Text style={[styles.sidebarCommunityText, { color: '#fff' }]}>р/</Text>
            </View>
            <Text style={[styles.sidebarItemText, { color: theme.text, marginLeft: 8 }]}>р/Популярное</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.sidebarItem}>
            <View style={[styles.sidebarCommunityIcon, { backgroundColor: '#3B82F6' }]}>
              <Text style={[styles.sidebarCommunityText, { color: '#fff' }]}>р/</Text>
            </View>
            <Text style={[styles.sidebarItemText, { color: theme.text, marginLeft: 8 }]}>р/Вопросы</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.sidebarItem}>
            <View style={[styles.sidebarCommunityIcon, { backgroundColor: '#10B981' }]}>
              <Text style={[styles.sidebarCommunityText, { color: '#fff' }]}>р/</Text>
            </View>
            <Text style={[styles.sidebarItemText, { color: theme.text, marginLeft: 8 }]}>р/Развлечение</Text>
          </TouchableOpacity>
        </View>

        {/* ДЕЙСТВИЯ СЕКЦИЯ */}
        <View style={[styles.sidebarSection, { marginTop: 16, marginBottom: 20 }]}>
          <TouchableOpacity 
            style={styles.sidebarItem}
            onPress={() => {
              setShowSupportModal(true);
              setShowHeaderMenu(false);
            }}
          >
            <View style={[styles.sidebarActionIcon, { backgroundColor: '#8B5CF6' }]}>
              <Ionicons name="headset" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.sidebarItemText, { color: theme.text, fontWeight: '600' }]}>Поддержка</Text>
              <Text style={[styles.sidebarItemText, { color: theme.textSecondary, fontSize: 12, marginTop: 2 }]}>Написать в поддержку</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.sidebarItem}
            onPress={() => {
              setShowMyTicketsModal(true);
              loadMyTickets();
              setShowHeaderMenu(false);
            }}
          >
            <View style={[styles.sidebarActionIcon, { backgroundColor: '#06B6D4' }]}>
              <Ionicons name="chatbubbles" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.sidebarItemText, { color: theme.text, fontWeight: '600' }]}>Мои обращения</Text>
              <Text style={[styles.sidebarItemText, { color: theme.textSecondary, fontSize: 12, marginTop: 2 }]}>Просмотреть ответы</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderHeader = () => (
    <Animated.View style={[
      styles.header,
      {
        backgroundColor: '#0F2A4D',
        borderBottomColor: '#1E4976',
      }
    ]}>
      {/* Верхняя часть header с поиском и меню */}
      <View style={[styles.headerTop]}>
        {/* Бургер меню кнопка СЛЕВА */}
        <TouchableOpacity
          style={[styles.burgerButton, { borderColor: theme.border }]}
          onPress={() => setShowHeaderMenu(!showHeaderMenu)}
        >
          <Ionicons 
            name={showHeaderMenu ? "close" : "menu"} 
            size={20} 
            color={'#3B82F6'} 
          />
        </TouchableOpacity>
        
        {/* Поиск в центре */}
        <View style={[styles.searchBox, { 
          flex: 1,
          marginHorizontal: 12,
          borderColor: 'rgba(99, 102, 241, 0.2)',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
        }]}>
          <Ionicons name="search" size={14} color={'#6366F1'} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Поиск постов..."
            placeholderTextColor={theme.textSecondary}
            value={searchText}
            onChangeText={handleSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchText ? (
            <TouchableOpacity onPress={() => {
              setSearchText('');
              loadPosts();
            }}>
              <Ionicons name="close-circle" size={14} color={'#6366F1'} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Счетчик результатов поиска */}
      {searchText && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={[styles.searchResultsCount, { color: theme.textSecondary, fontSize: 12 }]}>
            Найдено: {posts.length}
          </Text>
        </View>
      )}

      {/* Фильтр по хештегам - улучшенная версия */}
      {showHashtagFilter && allHashtags.length > 0 && (
        <>
          <View style={[styles.hashtagsFilterDivider, { backgroundColor: theme.border }]} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hashtagsFilterContainer}
            contentContainerStyle={styles.hashtagsFilterContent}
          >
            <TouchableOpacity
              style={[
                styles.hashtagFilter,
                {
                  backgroundColor: selectedHashtag === null ? theme.primary : theme.background,
                  borderColor: theme.primary,
                  borderWidth: 1,
                }
              ]}
              onPress={() => setSelectedHashtag(null)}
            >
              <Text style={[
                styles.hashtagFilterText,
                { color: selectedHashtag === null ? '#fff' : theme.primary }
              ]}>
                Все
              </Text>
            </TouchableOpacity>
            {allHashtags.map(tag => (
              <TouchableOpacity
                key={tag}
                style={[
                  styles.hashtagFilter,
                  {
                    backgroundColor: selectedHashtag === tag ? theme.primary : theme.background,
                    borderColor: theme.primary,
                    borderWidth: 1,
                  }
                ]}
                onPress={() => setSelectedHashtag(selectedHashtag === tag ? null : tag)}
              >
                <Text style={[
                  styles.hashtagFilterText,
                  { color: selectedHashtag === tag ? '#fff' : theme.primary }
                ]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </Animated.View>
  );

  // Функция для фильтрации постов
  const getFilteredPosts = () => {
    if (!selectedHashtag) return posts;
    return posts.filter(post => 
      post.content?.includes(selectedHashtag)
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Боковое меню СЛЕВА */}
      {renderSidebar()}
      
      {/* Фон при открытом меню */}
      {showHeaderMenu && (
        <TouchableOpacity 
          activeOpacity={1}
          style={styles.sidebarBackdrop}
          onPress={() => setShowHeaderMenu(false)}
        />
      )}

      {/* Основной контент */}
      <View style={styles.mainContent}>
        {renderHeader()}
        
        <AnimatedFlatList
          data={getFilteredPosts()}
          renderItem={({ item }) => <PostCard item={item} />}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.postsList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="inbox-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchText 
                  ? `Постов с "${searchText}" не найдено` 
                  : selectedHashtag 
                    ? 'Постов с этим хештегом не найдено' 
                    : 'Нет постов'}
              </Text>
            </View>
          }
        />
      </View>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              onPress={() => {
                if (newPostText.trim() || newPostImages.length > 0) {
                  Alert.alert(
                    'Отменить создание',
                    'Вы уверены? Введенный текст будет утерян.',
                    [
                      { text: 'Продолжить', style: 'cancel' },
                      { text: 'Отменить создание', style: 'destructive', onPress: () => {
                        setShowCreateModal(false);
                        setNewPostText('');
                        setNewPostImages([]);
                      }},
                    ]
                  );
                } else {
                  setShowCreateModal(false);
                }
              }}
            >
              <Text style={[styles.modalButton, { color: theme.danger }]}>Отмена</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Новый пост</Text>
            <TouchableOpacity
              onPress={createPost}
              disabled={loading || (!newPostText.trim() && newPostImages.length === 0)}
            >
              <Text style={[
                styles.modalButton,
                { color: theme.primary },
                (loading || (!newPostText.trim() && newPostImages.length === 0)) && { opacity: 0.5 }
              ]}>
                {loading ? 'Публикация...' : 'Опубликовать'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.createContent}>
            <TextInput
              style={[styles.postInput, { color: theme.text }]}
              value={newPostText}
              onChangeText={setNewPostText}
              placeholder="Что у вас нового?"
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={2000}
              autoFocus
            />

            {/* Раздел хештегов */}
            <View style={styles.hashtagsSection}>
              <View style={styles.hashtagInputContainer}>
                <TextInput
                  style={[styles.hashtagInput, { color: theme.text, borderColor: theme.border }]}
                  value={hashtagInput}
                  onChangeText={setHashtagInput}
                  placeholder="Добавить хештег..."
                  placeholderTextColor={theme.textSecondary}
                  onSubmitEditing={addHashtag}
                />
                <TouchableOpacity
                  style={[styles.addHashtagButton, { backgroundColor: theme.primary }]}
                  onPress={addHashtag}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {newPostHashtags.length > 0 && (
                <View style={styles.hashtagsList}>
                  {newPostHashtags.map((tag, index) => (
                    <View
                      key={index}
                      style={[styles.hashtagBadge, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}
                    >
                      <Text style={[styles.hashtagBadgeText, { color: theme.primary }]}>
                        {tag}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeHashtag(index)}
                        style={styles.removeHashtagButton}
                      >
                        <Ionicons name="close" size={16} color={theme.primary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Галерея изображений */}
            {newPostImages.length > 0 ? (
              <View style={styles.modalImagesContainer}>
                <ScrollView 
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  style={styles.modalImagesGallery}
                >
                  {newPostImages.map((image, index) => (
                    <View key={index} style={styles.modalImagePreview}>
                      <Image 
                        source={{ uri: getImageUri(image) }} 
                        style={styles.modalPreviewImage} 
                      />
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => removeImage(index)}
                      >
                        <View style={[styles.removeImageContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                          <Ionicons name="close" size={20} color="#fff" />
                        </View>
                      </TouchableOpacity>
                      <View style={styles.imageCounter}>
                        <Text style={styles.imageCounterText}>{index + 1}/{newPostImages.length}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                
                {newPostImages.length < 5 && (
                  <TouchableOpacity
                    style={[
                      styles.addImageButton,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.primary
                      }
                    ]}
                    onPress={pickImage}
                  >
                    <Ionicons name="add-circle-outline" size={24} color={theme.primary} />
                    <Text style={[styles.addImageText, { color: theme.primary }]}>
                      Добавить ещё ({newPostImages.length}/5)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.addImageButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.primary
                  }
                ]}
                onPress={pickImage}
              >
                <Ionicons name="image" size={24} color={theme.primary} />
                <Text style={[styles.addImageText, { color: theme.primary }]}>
                  Добавить фото (макс. 5)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={!!selectedPost}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPost(null)}
      >
        <View style={styles.imageModalOverlay}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.9)' }]} />
          </View>
          {selectedPost?.image && (
            <Image
              source={{ uri: selectedPost.image }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.closeModalButton}
            onPress={() => setSelectedPost(null)}
          >
            <View style={[styles.closeModalContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Кастомное модальное окно действий */}
      <Modal
        visible={showActionModal}
        transparent
        animationType="fade"
        onRequestClose={closeActionModal}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.actionModalOverlay}
          onPress={closeActionModal}
        >
          <Animated.View
            style={[
              styles.actionModalContent,
              {
                backgroundColor: theme.surface,
                transform: [
                  {
                    scale: actionModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                  {
                    translateY: actionModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
                opacity: actionModalAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 0.9, 1],
                }),
              },
            ]}
          >
            {/* Заголовок */}
            <View style={styles.actionHeader}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>
                Действия
              </Text>
            </View>

            {/* Опции */}
            <ScrollView style={styles.actionOptions} showsVerticalScrollIndicator={false}>
              {/* Поделиться */}
              <TouchableOpacity
                style={[styles.actionOption, { borderBottomColor: theme.border }]}
                onPress={() => {
                  sharePost(currentPost);
                  closeActionModal();
                }}
                activeOpacity={0.6}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#3b82f6' }]}>
                  <Ionicons name="share-social" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionOptionText, { color: theme.text }]}>
                    Поделиться
                  </Text>
                  <Text style={[styles.actionOptionSubtext, { color: theme.textSecondary }]}>
                    Отправить пост друзьям
                  </Text>
                </View>
                <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </View>
              </TouchableOpacity>

              {/* Редактировать (если владелец) */}
              {currentPost?.is_owner && (
                <TouchableOpacity
                  style={[styles.actionOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    openEditModal(currentPost);
                    closeActionModal();
                  }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#8b5cf6' }]}>
                    <Ionicons name="pencil" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionOptionText, { color: theme.text }]}>
                      Редактировать
                    </Text>
                    <Text style={[styles.actionOptionSubtext, { color: theme.textSecondary }]}>
                      Изменить содержание поста
                    </Text>
                  </View>
                  <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Удалить (если владелец) */}
              {currentPost?.is_owner && (
                <TouchableOpacity
                  style={[styles.actionOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    deletePost(currentPost.id);
                    closeActionModal();
                  }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#ef4444' }]}>
                    <Ionicons name="trash" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionOptionText, { color: theme.text }]}>
                      Удалить
                    </Text>
                    <Text style={[styles.actionOptionSubtext, { color: theme.textSecondary }]}>
                      Удалить пост окончательно
                    </Text>
                  </View>
                  <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                  </View>
                </TouchableOpacity>
              )}

            </ScrollView>

            {/* Кнопка отмены */}
            <TouchableOpacity
              style={[styles.actionCancel, { borderTopColor: theme.border }]}
              onPress={closeActionModal}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionCancelText, { color: theme.textSecondary }]}>
                Отмена
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Модальное окно редактирования поста */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          {/* Красивая шапка редактирования */}
          <View style={[styles.editModalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <View style={styles.editHeaderLeft}>
              <TouchableOpacity
                onPress={() => {
                  if (editText.trim() !== editingPost?.content || editImage !== editingPost?.image) {
                    setShowCancelConfirmModal(true);
                    Animated.spring(cancelConfirmAnim, {
                      toValue: 1,
                      useNativeDriver: true,
                      tension: 65,
                      friction: 11,
                    }).start();
                  } else {
                    setShowEditModal(false);
                  }
                }}
                style={styles.editHeaderButton}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              onPress={updatePost}
              disabled={isEditingLoading || (!editText.trim() && !editImage)}
              style={[
                styles.editSaveButton,
                { 
                  backgroundColor: theme.primary,
                  opacity: (isEditingLoading || (!editText.trim() && !editImage)) ? 0.5 : 1
                }
              ]}
              activeOpacity={0.8}
            >
              {isEditingLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.editSaveButtonText}>Сохранить</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.editContent} showsVerticalScrollIndicator={false}>
            {/* Информация о редактируемом посте */}
            <View style={[styles.editPostInfo, { backgroundColor: theme.surface }]}>
              <View style={styles.editPostAuthor}>
                {editingPost?.avatar ? (
                  <Image source={{ uri: editingPost.avatar }} style={styles.editAuthorAvatar} />
                ) : (
                  <View style={[styles.editAvatarPlaceholder, { backgroundColor: theme.primary }]}>
                    <Text style={styles.editAvatarText}>
                      {editingPost?.username?.[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={[styles.editAuthorName, { color: theme.text }]}>
                    {editingPost?.username}
                  </Text>
                  <Text style={[styles.editPostTime, { color: theme.textSecondary }]}>
                    {formatTimeAgo(editingPost?.created_at)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Текстовое поле редактирования */}
            <View style={styles.editInputSection}>
              <TextInput
                style={[styles.editInput, { color: theme.text }]}
                value={editText}
                onChangeText={setEditText}
                placeholder="Что вы хотите сказать?"
                placeholderTextColor={theme.textSecondary}
                multiline
                maxLength={2000}
              />
              <View style={[styles.charCountContainer, { backgroundColor: theme.surface }]}>
                <Text style={[styles.charCount, { color: theme.textSecondary }]}>
                  {editText.length} / 2000
                </Text>
              </View>
            </View>

            {/* Фото редактирования */}
            <View style={styles.editImageSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Фото</Text>
              
              {editImage ? (
                <View style={styles.imagePreview}>
                  <Image source={{ uri: editImage }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setEditImage('')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.removeImageContainer}>
                      <Ionicons name="close" size={22} color="#fff" />
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.addImageButtonEdit,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.primary
                    }
                  ]}
                  onPress={pickEditImage}
                  activeOpacity={0.7}
                >
                  <View style={styles.addImageIconWrapper}>
                    <Ionicons name="image" size={32} color={theme.primary} />
                  </View>
                  <View>
                    <Text style={[styles.addImageButtonTitle, { color: theme.text }]}>
                      Добавить фото
                    </Text>
                    <Text style={[styles.addImageButtonSubtitle, { color: theme.textSecondary }]}>
                      Нажмите чтобы выбрать изображение
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Нижний отступ */}
            <View style={{ height: 30 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Модальное окно подтверждения отмены редактирования */}
      <Modal
        visible={showCancelConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          Animated.timing(cancelConfirmAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setShowCancelConfirmModal(false);
          });
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.confirmModalOverlay}
          onPress={() => {
            Animated.timing(cancelConfirmAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              setShowCancelConfirmModal(false);
            });
          }}
        >
          <Animated.View
            style={[
              styles.confirmModalContent,
              {
                backgroundColor: theme.surface,
                transform: [
                  {
                    scale: cancelConfirmAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.85, 1],
                    }),
                  },
                ],
                opacity: cancelConfirmAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 0.9, 1],
                }),
              },
            ]}
          >
            {/* Иконка предупреждения */}
            <View style={[styles.confirmIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Ionicons name="warning" size={36} color="#ef4444" />
            </View>

            {/* Текст */}
            <Text style={[styles.confirmTitle, { color: theme.text }]}>
              Отменить редактирование?
            </Text>
            <Text style={[styles.confirmDescription, { color: theme.textSecondary }]}>
              Все внесенные изменения будут потеряны. Вы уверены?
            </Text>

            {/* Кнопки */}
            <View style={styles.confirmButtonsContainer}>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => {
                  Animated.timing(cancelConfirmAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => {
                    setShowCancelConfirmModal(false);
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.confirmButtonText, { color: theme.text }]}>
                  Продолжить редактирование
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: '#ef4444' }]}
                onPress={() => {
                  Animated.timing(cancelConfirmAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => {
                    setShowCancelConfirmModal(false);
                    setShowEditModal(false);
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.confirmButtonText, { color: '#fff', fontWeight: '700' }]}>
                  Отменить
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* ✨ ПОЛНОЭКРАННАЯ ГАЛЕРЕЯ ИЗОБРАЖЕНИЙ */}
      <Modal
        visible={showFullscreenGallery}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFullscreenGallery(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Заголовок */}
            <View style={styles.fullscreenGalleryHeader}>
              <TouchableOpacity
                onPress={() => setShowFullscreenGallery(false)}
                style={styles.fullscreenCloseButton}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              
              <Text style={styles.fullscreenGalleryCounter}>
                {currentImageIndex + 1} / {currentGalleryImages.length}
              </Text>
            </View>

            {/* Карусель изображений */}
            <ScrollView
              horizontal
              pagingEnabled
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const contentOffsetX = e.nativeEvent.contentOffset.x;
                const currentIndex = Math.round(contentOffsetX / width);
                setCurrentImageIndex(currentIndex);
              }}
              initialScrollIndex={currentImageIndex}
              scrollIndicatorInsets={{ right: 1 }}
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
            >
              {currentGalleryImages.map((image, idx) => (
                <View key={idx} style={{ width, height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                  <Image
                    source={{ uri: getImageUri(image) }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </ScrollView>

            {/* Кнопки навигации */}
            <View style={styles.fullscreenGalleryFooter}>
              <TouchableOpacity
                onPress={() => {
                  if (currentImageIndex > 0) {
                    setCurrentImageIndex(currentImageIndex - 1);
                  }
                }}
                disabled={currentImageIndex === 0}
                style={[styles.galleryNavButton, { opacity: currentImageIndex === 0 ? 0.3 : 1 }]}
              >
                <Ionicons name="chevron-back" size={32} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => sharePost({ image: currentGalleryImages[currentImageIndex] })}
                style={styles.galleryShareButton}
              >
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (currentImageIndex < currentGalleryImages.length - 1) {
                    setCurrentImageIndex(currentImageIndex + 1);
                  }
                }}
                disabled={currentImageIndex === currentGalleryImages.length - 1}
                style={[styles.galleryNavButton, { opacity: currentImageIndex === currentGalleryImages.length - 1 ? 0.3 : 1 }]}
              >
                <Ionicons name="chevron-forward" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ✨ НОВОЕ МОДАЛЬНОЕ ОКНО: СОРТИРОВКА */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSortModal(false)}
      >
        <SafeAreaView style={[styles.sortModalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.sortHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={[styles.sortTitle, { color: theme.text }]}>Сортировка</Text>
            <TouchableOpacity onPress={() => setShowSortModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.sortOptions}>
            {[
              { value: 'newest', label: '📅 Новые', desc: 'Самые свежие посты' },
              { value: 'trending', label: '🔥 Тренды', desc: 'Популярные за 7 дней' },
              { value: 'popular', label: '⭐ Популярные', desc: 'Все время популярные' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.sortOption,
                  {
                    backgroundColor: sortType === opt.value ? theme.primary + '20' : theme.surface,
                    borderColor: sortType === opt.value ? theme.primary : theme.border,
                    borderWidth: sortType === opt.value ? 2 : 1,
                  }
                ]}
                onPress={async () => {
                  setSortType(opt.value);
                  await fetchPosts(opt.value, filterType);
                  setShowSortModal(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sortOptionLabel, { color: theme.text }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.sortOptionDesc, { color: theme.textSecondary }]}>
                    {opt.desc}
                  </Text>
                </View>
                {sortType === opt.value && (
                  <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ✨ НОВОЕ МОДАЛЬНОЕ ОКНО: ФИЛЬТР */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <SafeAreaView style={[styles.filterModalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.filterHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={[styles.filterTitle, { color: theme.text }]}>Фильтр</Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.filterOptions}>
            {[
              { value: 'all', label: '📱 Все посты', desc: 'Посты всех пользователей' },
              { value: 'friends', label: '👥 От друзей', desc: 'Только посты ваших друзей' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.filterOption,
                  {
                    backgroundColor: filterType === opt.value ? theme.primary + '20' : theme.surface,
                    borderColor: filterType === opt.value ? theme.primary : theme.border,
                    borderWidth: filterType === opt.value ? 2 : 1,
                  }
                ]}
                onPress={async () => {
                  setFilterType(opt.value);
                  await fetchPosts(sortType, opt.value);
                  setShowFilterModal(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.filterOptionLabel, { color: theme.text }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.filterOptionDesc, { color: theme.textSecondary }]}>
                    {opt.desc}
                  </Text>
                </View>
                {filterType === opt.value && (
                  <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ✨ НОВОЕ МОДАЛЬНОЕ ОКНО: ЗАКЛАДКИ */}
      <Modal
        visible={showBookmarksModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookmarksModal(false)}
      >
        <SafeAreaView style={[styles.bookmarksModalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.bookmarksHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={[styles.bookmarksTitle, { color: theme.text }]}>Закладки</Text>
            <TouchableOpacity onPress={() => setShowBookmarksModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          {bookmarkedPosts.length === 0 ? (
            <View style={styles.emptyBookmarks}>
              <Ionicons name="bookmark-outline" size={64} color={theme.textSecondary} />
              <Text style={[styles.emptyBookmarksText, { color: theme.textSecondary }]}>
                У вас нет сохраненных постов
              </Text>
            </View>
          ) : (
            <FlatList
              data={bookmarkedPosts}
              renderItem={({ item }) => <PostCard item={item} />}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Модальное окно поддержки */}
      <Modal
        visible={showSupportModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowSupportModal(false);
          setSupportText('');
          setSupportCategory('general');
        }}
      >
        <SafeAreaView style={[styles.supportModalContainer, { backgroundColor: theme.background }]}>
          {/* Заголовок */}
          <View style={[styles.supportHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={() => {
                setShowSupportModal(false);
                setSupportText('');
                setSupportCategory('general');
              }}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.supportTitle, { color: theme.text }]}>Служба поддержки</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.supportContent} showsVerticalScrollIndicator={false}>
            {/* Категория */}
            <View style={styles.supportSection}>
              <Text style={[styles.supportLabel, { color: theme.text }]}>Категория вопроса</Text>
              <View style={styles.supportCategoryContainer}>
                {[
                  { value: 'general', label: 'Общий вопрос' },
                  { value: 'bug_report', label: 'Ошибка' },
                  { value: 'feature_request', label: 'Предложение' },
                  { value: 'other', label: 'Другое' },
                ].map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryButton,
                      {
                        backgroundColor: supportCategory === cat.value ? theme.primary : theme.surface,
                        borderColor: theme.border,
                      }
                    ]}
                    onPress={() => setSupportCategory(cat.value)}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      {
                        color: supportCategory === cat.value ? '#fff' : theme.text
                      }
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Текст */}
            <View style={styles.supportSection}>
              <Text style={[styles.supportLabel, { color: theme.text }]}>Ваше обращение</Text>
              <TextInput
                style={[styles.supportInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                value={supportText}
                onChangeText={setSupportText}
                placeholder="Опишите вашу проблему или вопрос..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={8}
                maxLength={1000}
              />
              <Text style={[styles.supportCharCount, { color: theme.textSecondary }]}>
                {supportText.length} / 1000
              </Text>
            </View>

            {/* Подсказка */}
            <View style={[styles.supportHint, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
              <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
              <Text style={[styles.supportHintText, { color: theme.text }]}>
                Ваше обращение будет обработано в течение 24 часов
              </Text>
            </View>
          </ScrollView>

          {/* Кнопка отправки */}
          <View style={[styles.supportFooter, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.supportSendButton,
                {
                  backgroundColor: theme.primary,
                  opacity: (supportLoading || !supportText.trim()) ? 0.5 : 1
                }
              ]}
              onPress={submitSupportTicket}
              disabled={supportLoading || !supportText.trim()}
            >
              {supportLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.supportSendButtonText}>Отправить</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Модальное окно для просмотра обращений */}
      <Modal
        visible={showMyTicketsModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowMyTicketsModal(false);
          setSelectedTicket(null);
          setTicketReplies([]);
        }}
      >
        <SafeAreaView style={[styles.ticketsModalContainer, { backgroundColor: theme.background }]}>
          {/* Заголовок */}
          <View style={[styles.ticketsHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={() => {
                if (selectedTicket) {
                  setSelectedTicket(null);
                  setTicketReplies([]);
                } else {
                  setShowMyTicketsModal(false);
                }
              }}
            >
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.ticketsTitle, { color: theme.text }]}>
              {selectedTicket ? 'Обращение #' + selectedTicket.id : 'Мои обращения'}
            </Text>
            <View style={{ width: 28 }} />
          </View>

          {!selectedTicket ? (
            // Список обращений
            ticketsLoading ? (
              <View style={styles.ticketsLoadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : myTickets.length === 0 ? (
              <View style={styles.ticketsEmptyContainer}>
                <Ionicons name="chatbubbles-outline" size={64} color={theme.textSecondary} />
                <Text style={[styles.ticketsEmptyText, { color: theme.textSecondary }]}>
                  У вас нет обращений
                </Text>
              </View>
            ) : (
              <FlatList
                data={myTickets}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.ticketCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => loadTicketReplies(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.ticketCardHeader}>
                      <Text style={[styles.ticketCardTitle, { color: theme.text }]}>
                        #{item.id} - {item.subject || 'Обращение'}
                      </Text>
                      <View style={[
                        styles.ticketStatusBadge,
                        {
                          backgroundColor: item.status === 'open' ? '#ef4444' :
                                         item.status === 'in_progress' ? '#f59e0b' :
                                         item.status === 'resolved' ? '#10b981' : '#6b7280'
                        }
                      ]}>
                        <Text style={styles.ticketStatusText}>
                          {item.status === 'open' ? 'Открыто' :
                           item.status === 'in_progress' ? 'В обработке' :
                           item.status === 'resolved' ? 'Решено' : 'Закрыто'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.ticketCardMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                      {item.message || 'Нет описания'}
                    </Text>
                    <Text style={[styles.ticketCardDate, { color: theme.textSecondary }]}>
                      {new Date(item.created_at).toLocaleDateString('ru-RU')}
                    </Text>
                  </TouchableOpacity>
                )}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                showsVerticalScrollIndicator={false}
              />
            )
          ) : (
            // Детали обращения с ответами
            ticketsLoading ? (
              <View style={styles.ticketsLoadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {/* Информация об обращении */}
                <View style={[styles.ticketDetailInfo, { backgroundColor: theme.surface }]}>
                  <View style={styles.ticketDetailHeader}>
                    <Text style={[styles.ticketDetailTitle, { color: theme.text }]}>
                      {selectedTicket?.subject || selectedTicket?.title || 'Обращение'}
                    </Text>
                    <View style={[
                      styles.ticketStatusBadge,
                      {
                        backgroundColor: selectedTicket?.status === 'open' ? '#ef4444' :
                                       selectedTicket?.status === 'in_progress' ? '#f59e0b' :
                                       selectedTicket?.status === 'resolved' ? '#10b981' : '#6b7280'
                      }
                    ]}>
                      <Text style={styles.ticketStatusText}>
                        {selectedTicket?.status === 'open' ? 'Открыто' :
                         selectedTicket?.status === 'in_progress' ? 'В обработке' :
                         selectedTicket?.status === 'resolved' ? 'Решено' : 'Закрыто'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.ticketDetailMessage, { color: theme.text }]}>
                    {selectedTicket?.message || selectedTicket?.description || 'Нет описания'}
                  </Text>
                  <Text style={[styles.ticketDetailDate, { color: theme.textSecondary }]}>
                    {selectedTicket?.created_at ? 
                      `${new Date(selectedTicket.created_at).toLocaleDateString('ru-RU')} в ${new Date(selectedTicket.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Дата неизвестна'
                    }
                  </Text>
                </View>

                {/* Ответы */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={[styles.repliesTitle, { color: theme.text }]}>Ответы</Text>
                  {ticketReplies.length === 0 ? (
                    <View style={[styles.noRepliesContainer, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.noRepliesText, { color: theme.textSecondary }]}>
                        Пока нет ответов от поддержки
                      </Text>
                    </View>
                  ) : (
                    ticketReplies.map((reply, index) => (
                      <View key={index} style={[styles.replyCard, { backgroundColor: theme.surface }]}>
                        <View style={styles.replyHeader}>
                          <Text style={[styles.replyAuthor, { color: theme.text }]}>
                            👨‍💼 {reply.admin_username || reply.admin_name || 'Администратор'}
                          </Text>
                          <Text style={[styles.replyDate, { color: theme.textSecondary }]}>
                            {reply.created_at ? 
                              `${new Date(reply.created_at).toLocaleDateString('ru-RU')} в ${new Date(reply.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                              : 'Дата неизвестна'
                            }
                          </Text>
                        </View>
                        <Text style={[styles.replyMessage, { color: theme.text }]}>
                          {reply.message || reply.text || 'Пустой ответ'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const actionModalContentStyles = {
  borderRadius: 24,
  overflow: 'hidden',
  maxHeight: '80%',
  width: '100%',
  ...Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
    },
    android: {
      elevation: 8,
    },
  }),
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'column',
    backgroundColor: 'transparent',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(96, 165, 250, 0.1)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    paddingTop: 14,
  },
  // Старый стиль (используем headerTitle вместо этого)
  title: {
    display: 'none',
  },
  createButton: {
    // Теперь находится в бургер меню
    display: 'none',
  },
  postsList: {
    paddingTop: 10,
  },
  postContainer: {
    marginHorizontal: 12,
    marginBottom: 14,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  postHeader: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '700',
  },
  postTime: {
    fontSize: 13,
    marginTop: 3,
  },
  moreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 24,
    paddingHorizontal: 16,
    paddingBottom: 14,
    fontWeight: '500',
  },
  postImage: {
    width: '100%',
    height: postImageHeight,
    backgroundColor: '#f0f0f0',
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    gap: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    flex: 1,
    textAlign: 'center',
  },
  modalButton: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  createContent: {
    flex: 1,
    padding: 20,
    paddingTop: 12,
  },
  editContent: {
    flex: 1,
    padding: 16,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
    marginBottom: 16,
  },
  postInput: {
    fontSize: 18,
    lineHeight: 28,
    minHeight: 160,
    textAlignVertical: 'top',
    paddingTop: 16,
    paddingHorizontal: 0,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginTop: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  addImageText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 12,
    letterSpacing: 0.2,
  },
  imagePreview: {
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  previewImage: {
    width: '100%',
    height: postImageHeight,
    backgroundColor: '#f0f0f0',
  },
  removeImageButton: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  removeImageContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  imageModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: width,
    height: width,
  },
  closeModalButton: {
    position: 'absolute',
    top: 40,
    right: 20,
  },
  closeModalContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButton: {
    // Теперь используется burgerButton
    display: 'none',
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerMenu: {
    width: 280,
    height: '100%',
    paddingTop: 0,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    marginTop: 12,
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  drawerOptions: {
    paddingVertical: 10,
  },
  drawerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1.5,
    gap: 14,
  },
  drawerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  drawerOptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  drawerOptionSubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionModalContent: {
    borderRadius: 28,
    overflow: 'hidden',
    maxHeight: '80%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  actionHeader: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  actionTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  actionOptions: {
    maxHeight: '70%',
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  actionOptionText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  actionOptionSubtext: {
    fontSize: 13,
    fontWeight: '400',
  },
  actionCancel: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCancelText: {
    fontSize: 16,
    fontWeight: '700',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  editHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  editHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  editSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  editSaveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  editPostInfo: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  editPostAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editAuthorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  editAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  editAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editAuthorName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  editPostTime: {
    fontSize: 12,
  },
  editInputSection: {
    marginHorizontal: 16,
    marginBottom: 22,
  },
  editInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    minHeight: 140,
    textAlignVertical: 'top',
    fontWeight: '500',
    borderColor: 'rgba(0, 0, 0, 0.12)',
    backgroundColor: 'transparent',
  },
  charCountContainer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  charCount: {
    fontSize: 13,
    fontWeight: '700',
  },
  editImageSection: {
    marginHorizontal: 16,
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  addImageButtonEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(99, 102, 241, 0.4)',
    gap: 14,
  },
  addImageIconWrapper: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  addImageButtonSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModalContent: {
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 32,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  confirmIconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  confirmDescription: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  confirmButtonsContainer: {
    gap: 14,
  },
  confirmButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Стили для хештегов
  hashtagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
    marginBottom: 14,
    marginHorizontal: 16,
  },
  hashtag: {
    height: 'auto',
  },
  hashtagText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  headerButtons: {
    // Теперь кнопки находятся в бургер меню
    display: 'none',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  hashtagsFilterDivider: {
    height: 1,
  },
  hashtagsFilterContainer: {
    minHeight: 56,
    paddingVertical: 10,
  },
  hashtagsFilterContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  hashtagFilter: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  hashtagFilterText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 17,
    marginTop: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  // Стили для хештегов в создании поста
  hashtagsSection: {
    marginVertical: 16,
    marginHorizontal: 0,
  },
  hashtagInputContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  hashtagInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  addHashtagButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  hashtagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  hashtagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  hashtagBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 6,
  },
  removeHashtagButton: {
    padding: 3,
  },
  communitiesModalContainer: {
    flex: 1,
  },
  communitiesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  communitiesHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  communitiesLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  communitiesListContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  communitiesCard: {
    marginBottom: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  communitiesCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  communitiesCardDescription: {
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '400',
  },
  communitiesCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  communitiesMemberCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  communitiesJoinButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  communitiesJoinButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  communitiesEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  communitiesEmptyText: {
    fontSize: 16,
  },
  // Стили для галереи изображений
  imageGalleryContainer: {
    marginVertical: 20,
    marginHorizontal: 0,
  },
  imageGallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  imagePreview: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    borderWidth: 1.5,
  },
  imagePreviewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  // Стили для модального окна поддержки
  supportModalContainer: {
    flex: 1,
  },
  supportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1.5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  supportTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  supportContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  supportSection: {
    marginBottom: 24,
  },
  supportLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  supportCategoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  categoryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  supportInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 100,
    fontWeight: '500',
  },
  supportCharCount: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'right',
    fontWeight: '500',
  },
  supportHint: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginVertical: 16,
    gap: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  supportHintText: {
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  supportFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1.5,
  },
  supportSendButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  supportSendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Стили для модального окна обращений
  ticketsModalContainer: {
    flex: 1,
  },
  ticketsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1.5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  ticketsTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  ticketsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketsEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketsEmptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  ticketCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  ticketStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  ticketStatusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  ticketCardMessage: {
    fontSize: 13,
    marginBottom: 6,
  },
  ticketCardDate: {
    fontSize: 11,
  },
  ticketDetailInfo: {
    padding: 16,
    margin: 16,
    borderRadius: 12,
    marginBottom: 0,
  },
  ticketDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ticketDetailTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  ticketDetailMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  ticketDetailDate: {
    fontSize: 12,
  },
  repliesTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  noRepliesContainer: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  noRepliesText: {
    fontSize: 14,
  },
  replyCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  replyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  replyAuthor: {
    fontSize: 14,
    fontWeight: '600',
  },
  replyDate: {
    fontSize: 11,
  },
  replyMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  // ✨ НОВЫЕ СТИЛИ ДЛЯ ФУНКЦИЙ ПОСТОВ - КРАСИВЫЙ ДИЗАЙН
  header: {
    flexDirection: 'column',
    borderBottomWidth: 1,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    paddingTop: 4,
    paddingBottom: 3,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  burgerButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    elevation: 3,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    borderWidth: 1.2,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    elevation: 3,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  searchInfo: {
    paddingHorizontal: 4,
  },
  searchResultsCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  
  // Бургер меню
  burgerMenuContainer: {
    borderTopWidth: 1,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  burgerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  burgerMenuIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  burgerMenuTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  burgerMenuTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  burgerMenuSubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },
  burgerMenuDivider: {
    height: 1,
    marginVertical: 8,
  },
  createPostMenuItem: {
    marginTop: 4,
  },

  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
  },
  // Стили для модала сортировки
  sortModalContainer: {
    flex: 1,
  },
  sortHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sortTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sortOptions: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  sortOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sortOptionDesc: {
    fontSize: 13,
    fontWeight: '400',
  },
  // Стили для модала фильтра
  filterModalContainer: {
    flex: 1,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  filterOptions: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  filterOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  filterOptionDesc: {
    fontSize: 13,
    fontWeight: '400',
  },
  // Стили для модала закладок
  bookmarksModalContainer: {
    flex: 1,
  },
  bookmarksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  bookmarksTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyBookmarks: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBookmarksText: {
    fontSize: 16,
    marginTop: 12,
  },
  // Стили для sidebar
  mainContent: {
    flex: 1,
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 40,
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    zIndex: 50,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(99, 102, 241, 0.1)',
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 24,
    paddingBottom: 24,
  },
  sidebarSection: {
    marginBottom: 28,
    paddingHorizontal: 0,
  },
  sidebarSectionHeader: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sidebarSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.65,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginHorizontal: 10,
    borderRadius: 12,
    gap: 12,
    backgroundColor: 'transparent',
    transition: 'background-color 200ms ease',
  },
  sidebarItemActive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginHorizontal: 10,
    borderRadius: 12,
    gap: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  sidebarItemText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  sidebarItemTextActive: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  sidebarCommunityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
    fontSize: 11,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  sidebarActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sidebarCommunityText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  newBadge: {
    backgroundColor: '#FF4500',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 'auto',
    elevation: 2,
    shadowColor: '#FF4500',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  imagesGallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  modalImagesContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  modalImagesGallery: {
    marginBottom: 8,
    maxHeight: 150,
  },
  modalImagePreview: {
    width: 130,
    height: 130,
    marginRight: 8,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  modalPreviewImage: {
    width: 130,
    height: 130,
    backgroundColor: '#f0f0f0',
  },
  imageCounter: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  imageCounterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  imagesGalleryContainer: {
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  gridSingleImage: {
    width: '100%',
  },
  gridTwoImages: {
    width: '100%',
  },
  gridThreeOrMore: {
    width: '100%',
  },
  mainImageContainer: {
    width: '100%',
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    position: 'relative',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    marginBottom: 8,
  },
  mainImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  thumbnailsScroll: {
    marginTop: 8,
  },
  thumbnailsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 0,
  },
  thumbnailContainer: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    position: 'relative',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  imagesCarousel: {
    marginVertical: 0,
    height: postImageHeight,
  },
  carouselContent: {
    gap: 4,
    paddingHorizontal: 12,
  },
  carouselImageContainer: {
    width: (width - 48) / 3,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    position: 'relative',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  imageIndexBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    zIndex: 10,
    backdropFilter: 'blur(8px)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    display: 'none',
  },
  imageIndexText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  carouselIndicator: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    zIndex: 10,
  },
  carouselIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  
  // ✨ НОВЫЕ СТИЛИ ДЛЯ ПОЛНОЭКРАННОЙ ГАЛЕРЕИ
  fullscreenGalleryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  fullscreenCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullscreenGalleryCounter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  fullscreenGalleryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  galleryNavButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  galleryShareButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
  },
});

export default PostsScreen;
