import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { postAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const formatTimeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'только что';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} мин. назад`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ч. назад`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} дн. назад`;
  return date.toLocaleDateString();
};

const CommentsScreen = ({ route, navigation }) => {
  const { postId } = route.params;
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inputHeight, setInputHeight] = useState(40);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const scrollY = new Animated.Value(0);
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    loadComments();
  }, []);

  const loadComments = async () => {
    try {
      const response = await postAPI.getComments(postId);
      setComments(response.data.reverse());
    } catch (error) {
      console.error('Ошибка загрузки комментариев:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить комментарии');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadComments();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const addComment = async () => {
    if (!newComment.trim()) return;

    setLoading(true);
    try {
      await postAPI.addComment(postId, newComment.trim());
      setNewComment('');
      loadComments();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось добавить комментарий');
    } finally {
      setLoading(false);
    }
  };

  const renderComment = ({ item, index }) => (
    <Animated.View 
      style={[
        styles.commentContainer,
        { 
          backgroundColor: theme.surface,
          borderBottomColor: theme.border,
        },
        {
          transform: [{
            translateX: scrollY.interpolate({
              inputRange: [index * 100, (index + 1) * 100],
              outputRange: [0, -10],
              extrapolate: 'clamp',
            })
          }]
        }
      ]}
    >
      <View style={styles.commentHeader}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.commentContent}>
          <View style={styles.commentMeta}>
            <Text style={[styles.username, { color: theme.text }]}>{item.username}</Text>
            <Text style={[styles.commentTime, { color: theme.textSecondary }]}>
              {formatTimeAgo(item.created_at)}
            </Text>
          </View>
          <Text style={[styles.commentText, { color: theme.text }]}>{item.comment}</Text>
        </View>
      </View>
    </Animated.View>
  );

  const renderHeader = () => (
    <Animated.View 
      style={[
        styles.header,
        {
          backgroundColor: theme.surface,
          borderBottomColor: theme.border,
          opacity: headerOpacity,
        }
      ]}
    >
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={theme.primary} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: theme.text }]}>
        Комментарии ({comments.length})
      </Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderHeader()}

      <AnimatedFlatList
        data={comments}
        renderItem={renderComment}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          styles.commentsList,
          { paddingBottom: Platform.OS === 'ios' ? 80 : 120 }
        ]}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Пока нет комментариев.{'\n'}Будьте первым!
            </Text>
          </View>
        )}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        style={styles.keyboardAvoid}
      >
        <SafeAreaView edges={['bottom']}>
          <View 
            style={[
              styles.inputContainer, 
              { backgroundColor: theme.surface, borderTopColor: theme.border }
            ]}
          >
            <View style={[styles.inputWrapper, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <TextInput
                style={[
                  styles.commentInput,
                  { 
                    height: inputHeight,
                    color: theme.text 
                  }
                ]}
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Написать комментарий..."
                placeholderTextColor={theme.textSecondary}
                multiline
                maxLength={1000}
                onContentSizeChange={(e) => 
                  setInputHeight(Math.min(100, Math.max(40, e.nativeEvent.contentSize.height)))
                }
              />
              {loading ? (
                <ActivityIndicator color={theme.primary} style={styles.sendButton} />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    { backgroundColor: newComment.trim() ? theme.primary : theme.border }
                  ]}
                  onPress={addComment}
                  disabled={!newComment.trim() || loading}
                >
                  <Ionicons 
                    name="send" 
                    size={20} 
                    color={newComment.trim() ? '#fff' : theme.textSecondary} 
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    borderRadius: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  commentsList: {
    paddingTop: 8,
  },
  commentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  commentContent: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
  },
  commentText: {
    fontSize: 15,
    lineHeight: 20,
  },
  commentTime: {
    fontSize: 13,
  },
  keyboardAvoid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  inputContainer: {
    borderTopWidth: 1,
    padding: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentInput: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default CommentsScreen;