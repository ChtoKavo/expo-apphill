import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { postAPI, profileAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import * as ImagePicker from 'expo-image-picker';
import DuplicateReportModal from '../components/DuplicateReportModal';

const { width } = Dimensions.get('window');

const formatTimeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'только что';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} мин. назад`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ч. назад`;
  return `${Math.floor(diffInSeconds / 86400)} дн. назад`;
};

const getImageUri = (imagePath) => {
  if (!imagePath) return null;
  if (typeof imagePath === 'string') return imagePath;
  if (typeof imagePath === 'object' && imagePath.uri && typeof imagePath.uri === 'string') return imagePath.uri;
  return null;
};

const PostDetailScreen = ({ route, navigation }) => {
  const { postId } = route.params;
  const { theme } = useTheme();
  const { error, warning, success } = useModalAlert();
  const insets = useSafeAreaInsets();
  
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editText, setEditText] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editTags, setEditTags] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showReportsListModal, setShowReportsListModal] = useState(false);
  const [postReports, setPostReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [showDuplicateReportModal, setShowDuplicateReportModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  
  // ✨ СОСТОЯНИЯ ДЛЯ ПОЛНОЭКРАННОЙ ГАЛЕРЕИ
  const [showFullscreenGallery, setShowFullscreenGallery] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageScaleAnimations, setImageScaleAnimations] = useState([]);

  useEffect(() => {
    loadPostData();
    loadCurrentUser();
  }, [postId]);

  const loadCurrentUser = async () => {
    try {
      const response = await profileAPI.getProfile();
      console.log('Текущий пользователь:', response.data);
      if (response.data) {
        setCurrentUser(response.data);
      }
    } catch (err) {
      console.error('Ошибка загрузки профиля:', err);
    }
  };

  const loadPostData = async () => {
    try {
      setLoading(true);
      // Получаем пост
      const postResponse = await postAPI.getPost(postId);
      const currentPost = postResponse.data;
      
      if (currentPost) {
        setPost(currentPost);
        setEditText(currentPost.content || '');
        setEditImage(currentPost.image || '');
        setEditTags(currentPost.tags ? currentPost.tags.join(' ') : '');
        setIsLiked(currentPost.is_liked || false);
        // Инициализируем анимации для изображений
        initializeImageAnimations(currentPost.images);
      }
      
      // Получаем комментарии
      const commentsResponse = await postAPI.getComments(postId);
      console.log('Комментарии с сервера:', commentsResponse.data);
      setComments(commentsResponse.data.reverse());
    } catch (err) {
      console.error('Ошибка загрузки поста:', err);
      error('Ошибка', 'Не удалось загрузить пост');
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

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.cancelled) {
        setEditImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Ошибка выбора изображения:', err);
      error('Ошибка', 'Не удалось выбрать изображение');
    }
  };

  // ✨ Инициализация анимаций для изображений
  const initializeImageAnimations = (images) => {
    if (!images || images.length === 0) {
      setImageScaleAnimations([]);
      return;
    }
    setImageScaleAnimations(images.map(() => new Animated.Value(1)));
  };

  const handleImagePressIn = (idx) => {
    if (!imageScaleAnimations[idx]) return;
    Animated.spring(imageScaleAnimations[idx], {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 100,
      friction: 7,
    }).start();
  };

  const handleImagePressOut = (idx) => {
    if (!imageScaleAnimations[idx]) return;
    Animated.spring(imageScaleAnimations[idx], {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 7,
    }).start();
  };

  const openFullscreenGallery = (images, index) => {
    setCurrentImageIndex(index);
    setShowFullscreenGallery(true);
  };

  const updatePost = async () => {
    if (!editText.trim() && !editImage) {
      warning('Ошибка', 'Добавьте текст или изображение');
      return;
    }

    setIsEditing(true);
    try {
      const updateData = {
        content: editText,
        image: editImage,
      };
      
      await postAPI.updatePost(postId, updateData);
      
      // Оптимистичное обновление
      setPost(prev => ({
        ...prev,
        content: editText,
        image: editImage,
      }));
      
      success('Успешно', 'Пост обновлен');
      setShowEditModal(false);
    } catch (err) {
      console.error('Ошибка обновления поста:', err);
      error('Ошибка', 'Не удалось обновить пост');
    } finally {
      setIsEditing(false);
    }
  };

  const deletePost = async (id) => {
    try {
      await postAPI.deletePost(id);
    } catch (err) {
      console.error('Ошибка удаления поста:', err);
    }
  };

  const toggleLike = async () => {
    try {
      // Оптимистичное обновление
      const newLikeState = !isLiked;
      setIsLiked(newLikeState);
      setPost(prev => ({
        ...prev,
        likes_count: newLikeState ? prev.likes_count + 1 : prev.likes_count - 1
      }));
      
      // Отправляем на сервер
      await postAPI.likePost(postId);
    } catch (err) {
      console.error('Ошибка лайка:', err);
      // Откатываем назад при ошибке
      setIsLiked(!isLiked);
      setPost(prev => ({
        ...prev,
        likes_count: !isLiked ? prev.likes_count + 1 : prev.likes_count - 1
      }));
      error('Ошибка', 'Не удалось поставить лайк');
    }
  };

  const reportPost = async () => {
    if (!reportReason.trim()) {
      warning('Ошибка', 'Пожалуйста, укажите причину жалобы');
      return;
    }

    try {
      await postAPI.reportPost(postId, reportReason.trim());
      success('Спасибо!', 'Ваша жалоба отправлена администраторам');
      setReportReason('');
      setShowReportModal(false);
    } catch (err) {
      console.error('Ошибка при отправке жалобы:', err);
      const errorMessage = err.response?.data?.error || 'Не удалось отправить жалобу. Попробуйте позже.';
      
      // Проверяем конкретная ошибка о дублирующейся жалобе
      if (errorMessage.includes('уже пожаловались')) {
        setShowDuplicateReportModal(true);
        setShowReportModal(false);
      } else {
        error('Ошибка', errorMessage);
      }
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;

    const commentText = newComment.trim();
    setAddingComment(true);
    try {
      // Оптимистичное добавление комментария
      const newCommentData = {
        id: Date.now(),
        username: currentUser?.username || currentUser?.name || 'Вы',
        author_name: currentUser?.username || currentUser?.name || 'Вы',
        avatar: currentUser?.avatar || null,
        comment: commentText,
        created_at: new Date().toISOString(),
      };
      
      setComments(prev => [newCommentData, ...prev]);
      setPost(prev => ({
        ...prev,
        comments_count: prev.comments_count + 1
      }));
      setNewComment('');
      
      // Отправляем на сервер
      await postAPI.addComment(postId, commentText);
    } catch (err) {
      console.error('Ошибка добавления комментария:', err);
      error('Ошибка', 'Не удалось добавить комментарий');
      // Откатываем назад при ошибке
      setComments(prev => prev.filter(c => c.comment !== commentText));
      setPost(prev => ({
        ...prev,
        comments_count: Math.max(0, prev.comments_count - 1)
      }));
      setNewComment(commentText);
    } finally {
      setAddingComment(false);
    }
  };

  const renderComment = ({ item }) => {
    console.log('Рендеринг комментария:', item);
    return (
    <View style={[styles.commentContainer, { backgroundColor: theme.surface }]}>
      <View style={styles.commentMainContent}>
        {/* Аватарка */}
        <View style={styles.commentAvatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.commentAvatar} />
          ) : (
            <View style={[styles.commentAvatarPlaceholder, { backgroundColor: theme.primary }]}>
              <Text style={styles.commentAvatarText}>{(item.username || item.author_name)?.[0]?.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Содержимое комментария */}
        <View style={styles.commentContent}>
          <View style={styles.commentAuthorInfo}>
            <Text style={[styles.commentAuthor, { color: theme.text }]}>{item.username || item.author_name}</Text>
            <Text style={[styles.commentTime, { color: theme.textSecondary }]}>
              {formatTimeAgo(item.created_at)}
            </Text>
          </View>
          <Text style={[styles.commentText, { color: theme.text }]}>{item.comment}</Text>
        </View>
      </View>
    </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: theme.text }]}>Пост не найден</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Пост</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Post Card */}
        <View style={[styles.postCard, { backgroundColor: theme.surface }]}>
          {/* Post Header */}
          <TouchableOpacity
            style={styles.postHeader}
            activeOpacity={0.75}
            onPress={() => {
              if (!post) return;
              const author = {
                id: post.user_id,
                username: post.author_name,
                name: post.author_name,
                avatar: post.avatar || null,
                email: post.author_email || '',
                status: post.author_status || '',
                bio: post.author_bio || '',
              };
              navigation.navigate('UserProfile', { user: author });
            }}
          >
            <View style={styles.userInfo}>
              {post.avatar ? (
                <Image source={{ uri: post.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary }]}>
                  <Text style={styles.avatarText}>{post.author_name?.[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.userDetails}>
                <Text style={[styles.authorName, { color: theme.text }]}>{post.author_name}</Text>
                <Text style={[styles.postTime, { color: theme.textSecondary }]}>
                  {formatTimeAgo(post.created_at)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Post Content */}
          {post.content && (
            <Text style={[styles.postContent, { color: theme.text }]}>{post.content}</Text>
          )}

          {/* Post Image - Одно изображение */}
          {post.image && (!post.images || post.images.length === 0) ? (
            <Image source={{ uri: getImageUri(post.image) }} style={styles.postImage} />
          ) : null}

          {/* Gallery - Несколько изображений */}
          {post.images && post.images.length > 0 ? (
            <View style={styles.imagesGalleryContainer}>
              {/* Первое большое изображение */}
              <TouchableOpacity
                activeOpacity={1}
                onPressIn={() => handleImagePressIn(0)}
                onPressOut={() => handleImagePressOut(0)}
                onPress={() => openFullscreenGallery(post.images, 0)}
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
                    source={{ uri: getImageUri(post.images[0]) }}
                    style={styles.mainImage}
                    resizeMode="cover"
                  />
                </Animated.View>
              </TouchableOpacity>

              {/* Остальные изображения внизу */}
              {post.images.length > 1 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbnailsScroll}
                  contentContainerStyle={styles.thumbnailsContainer}
                >
                  {post.images.slice(1).map((image, idx) => (
                    <TouchableOpacity
                      key={idx + 1}
                      activeOpacity={1}
                      onPressIn={() => handleImagePressIn(idx + 1)}
                      onPressOut={() => handleImagePressOut(idx + 1)}
                      onPress={() => openFullscreenGallery(post.images, idx + 1)}
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
          ) : null}

          {/* Post Actions */}
          <View style={[styles.postActions, { borderTopColor: theme.border }]}>
            <TouchableOpacity style={styles.actionButton} onPress={toggleLike}>
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={24}
                color={isLiked ? '#FF3B30' : theme.textSecondary}
              />
              <Text style={[
                styles.actionText,
                { color: isLiked ? '#FF3B30' : theme.textSecondary }
              ]}>
                {post.likes_count}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="chatbubble-outline" size={22} color={theme.textSecondary} />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                {post.comments_count}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="share-outline" size={24} color={theme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setShowReportModal(true)}
            >
              <Ionicons name="flag-outline" size={24} color={theme.textSecondary} />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                Жалоба
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Комментарии ({comments.length})
          </Text>
          
          {comments.length === 0 ? (
            <Text style={[styles.noComments, { color: theme.textSecondary }]}>
              Комментариев пока нет
            </Text>
          ) : (
            <FlatList
              data={comments}
              renderItem={renderComment}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Comment Input */}
      <View style={[styles.commentInputContainer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TextInput
          style={[styles.commentInput, { color: theme.text }]}
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Добавить комментарий..."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxHeight={100}
        />
        <TouchableOpacity
          onPress={addComment}
          disabled={!newComment.trim() || addingComment}
          style={[
            styles.sendButton,
            { backgroundColor: theme.primary },
            (!newComment.trim() || addingComment) && { opacity: 0.5 }
          ]}
        >
          {addingComment ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={() => {
                if (editText !== post.content || editImage !== post.image) {
                  Alert.alert(
                    'Отменить редактирование',
                    'Вы уверены? Внесенные изменения будут утеряны.',
                    [
                      { text: 'Продолжить', style: 'cancel' },
                      { text: 'Отменить редактирование', style: 'destructive', onPress: () => setShowEditModal(false) },
                    ]
                  );
                } else {
                  setShowEditModal(false);
                }
              }}
            >
              <Text style={[styles.modalButton, { color: theme.danger || '#FF3B30' }]}>Отмена</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Редактировать пост</Text>
            <TouchableOpacity
              onPress={updatePost}
              disabled={isEditing || (!editText.trim() && !editImage)}
            >
              <Text style={[
                styles.modalButton,
                { color: theme.primary },
                (isEditing || (!editText.trim() && !editImage)) && { opacity: 0.5 }
              ]}>
                {isEditing ? 'Сохранение...' : 'Сохранить'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <TextInput
              style={[styles.editInput, { color: theme.text, borderColor: theme.border }]}
              value={editText}
              onChangeText={setEditText}
              placeholder="Отредактируйте пост..."
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={2000}
            />

            {editImage ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: editImage }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setEditImage('')}
                >
                  <View style={[styles.removeImageContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </View>
                </TouchableOpacity>
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
                <Ionicons name="image" size={32} color={theme.primary} />
                <Text style={[styles.addImageText, { color: theme.primary }]}>
                  Изменить фото
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Report Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={[styles.reportModalContent, { backgroundColor: theme.surface }]}>
            {/* Header */}
            <View style={[styles.reportModalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.reportModalTitle, { color: theme.text }]}>
                ⚠️ Пожаловаться на пост
              </Text>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <Ionicons name="close" size={28} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.reportModalBody}>
              <Text style={[styles.reportModalLabel, { color: theme.text }]}>
                Причина жалобы:
              </Text>
              <TextInput
                style={[styles.reportReasonInput, { 
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.background
                }]}
                placeholder="Опишите, почему вы жалуетесь на этот пост..."
                placeholderTextColor={theme.textSecondary}
                value={reportReason}
                onChangeText={setReportReason}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              <Text style={[styles.reportCharCount, { color: theme.textSecondary }]}>
                {reportReason.length}/500
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.reportModalActions}>
              <TouchableOpacity 
                style={[styles.reportButton, { backgroundColor: theme.border }]}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={[styles.reportButtonText, { color: theme.text }]}>
                  Отмена
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.reportButton, 
                  { backgroundColor: '#FF3B30' },
                  !reportReason.trim() && { opacity: 0.5 }
                ]}
                onPress={reportPost}
                disabled={!reportReason.trim()}
              >
                <Text style={[styles.reportButtonText, { color: '#fff' }]}>
                  Отправить
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка для дублирующейся жалобы */}
      <DuplicateReportModal 
        visible={showDuplicateReportModal}
        onClose={() => setShowDuplicateReportModal(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  postCard: {
    margin: 12,
    borderRadius: 12,
    padding: 12,
  },
  postHeader: {
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  postTime: {
    fontSize: 12,
  },
  postContent: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 12,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  commentsSection: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  noComments: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  commentContainer: {
    padding: 12,
    borderRadius: 8,
  },
  commentMainContent: {
    flexDirection: 'row',
    gap: 10,
  },
  commentAvatarContainer: {
    justifyContent: 'flex-start',
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    marginBottom: 8,
  },
  commentAuthorInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
  },
  commentTime: {
    fontSize: 12,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalContent: {
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
  imagePreview: {
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 300,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  removeImageContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageText: {
    fontSize: 16,
    marginTop: 8,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  reportModalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  reportModalBody: {
    padding: 16,
  },
  reportModalLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  reportReasonInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  reportCharCount: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'right',
  },
  reportModalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  reportButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  imagesGalleryContainer: {
    marginVertical: 8,
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
});

export default PostDetailScreen;
