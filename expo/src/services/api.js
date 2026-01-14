import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URLS = [
  'http://151.247.196.66:3001/api'
];

let API_URL = API_URLS[0];

// Проверка доступности сервера
const checkServerAvailability = async () => {
  for (const url of API_URLS) {
    try {
      await axios.get(`${url}/health`, { timeout: 5000 });
      API_URL = url;
      if (__DEV__) console.log('Server available at:', url);
      return url;
    } catch (error) {
      if (__DEV__) console.log('Server not available at:', url);
    }
  }
  throw new Error('No server available');
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (__DEV__) {
      console.log('API Request:', {
        url: config.url,
        method: config.method,
        baseURL: config.baseURL,
        hasToken: !!token,
        isFormData: config.data instanceof FormData,
      });
    }
    
    // Устанавливаем заголовки для React Native
    config.headers['User-Agent'] = 'ReactNative';
    
    // ✅ НЕ переписываем Content-Type если это FormData
    if (!(config.data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }
    
    // НЕ добавляем токен для публичных endpoints
    const publicEndpoints = ['/login', '/register', '/auth/google', '/health', '/verify-code', '/resend-verification-code'];
    const isPublicEndpoint = publicEndpoints.some(endpoint => config.url.includes(endpoint));
    
    if (token && !isPublicEndpoint) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // ✅ Для FormData не нужно устанавливать данные по умолчанию
    if (config.data instanceof FormData) {
      return config;
    }
    
    // Убеждаемся что data имеет правильный формат
    // Для POST/PUT запросов без данных устанавливаем пустой объект
    if (!config.data && (config.method === 'post' || config.method === 'put')) {
      config.data = {};
    }
    
    // Если data существует, убедимся что это объект
    if (config.data && typeof config.data === 'object' && !config.data.toString) {
      // Попытаемся JSON.stringify для проверки валидности
      try {
        JSON.stringify(config.data);
      } catch (stringifyError) {
        console.error('Ошибка при сериализации данных:', stringifyError, 'Data:', config.data);
        config.data = {};
      }
    }
    
    return config;
  } catch (error) {
    console.error('Ошибка при подготовке запроса:', error);
    return Promise.reject(error);
  }
});

api.interceptors.response.use(
  (response) => {
    // Логирование ответа для GET запросов к сообщениям (только в dev режиме)
    if (__DEV__ && response.config.url.includes('/messages') && response.config.method === 'get') {
      if (Array.isArray(response.data)) {
        console.log(`📨 API RESPONSE ${response.config.url}: ${response.data.length} сообщений`);
      }
    }
    return response;
  },
  async (error) => {
    if (__DEV__) {
      console.log('API Error:', error.response?.data || error.message);
      console.log('Network Error Details:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        message: error.message
      });
    }

    if (error.response?.status === 401) {
      try {
        // Попытка обновить токен из AsyncStorage
        const token = await AsyncStorage.getItem('token');
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        
        if (refreshToken) {
          // Попытка обновить токен
          const response = await axios.post(`${API_URL}/refresh-token`, {
            refreshToken 
          });
          
          if (response.data.token) {
            await AsyncStorage.setItem('token', response.data.token);
            
            // Повторяем исходный запрос с новым токеном
            error.config.headers.Authorization = `Bearer ${response.data.token}`;
            return api.request(error.config);
          }
        }
        
        // Если не удалось обновить токен, очищаем данные авторизации
        await AsyncStorage.multiRemove(['token', 'refreshToken', 'user']);
      } catch (refreshError) {
        if (__DEV__) console.error('Ошибка обновления токена:', refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (userData) => api.post('/register', userData),
  verifyCode: (verificationData) => api.post('/verify-code', verificationData),
  resendVerificationCode: (phoneData) => api.post('/resend-verification-code', phoneData),
  login: async (credentials) => {
    try {
      await checkServerAvailability();
      return api.post('/login', credentials);
    } catch (error) {
      throw new Error('Сервер недоступен');
    }
  },
  googleLogin: async (token) => {
    try {
      await checkServerAvailability();
      return api.post('/auth/google', { token });
    } catch (error) {
      throw new Error('Сервер недоступен');
    }
  },
  registerPushToken: (data) => api.post('/users/push-token', data),
};

export const userAPI = {
  getUsers: () => api.get('/users'),
  updateOnlineStatus: (isOnline) => api.post('/users/status', { is_online: isOnline }),
  getUserStatus: (userId) => api.get(`/users/${userId}/status`),
  registerPushToken: (data) => api.post('/users/push-token', data),
};

export const messageAPI = {
  getMessages: (userId, options = {}) => {
    const { page = 1, limit = 50 } = options;
    return api.get(`/messages/${userId}`, { params: { page, limit } });
  },
  sendMessage: (messageData) => api.post('/messages', messageData),
  deleteMessage: (messageId) => api.delete(`/messages/${messageId}`),
  editMessage: (messageId, newText) => api.put(`/messages/${messageId}`, { message: newText }),
  getUnreadCount: (userId) => api.get(`/messages/${userId}/unread-count`),
  markAllAsRead: (userId) => api.post(`/messages/${userId}/read-all`),
  markAsRead: (messageId) => api.post(`/messages/${messageId}/read`),
  getConversations: () => api.get('/chats'),
  deleteChatAdmin: (userId1, userId2) => api.delete(`/admin/chats/${userId1}/${userId2}`),
  // Очистить чат (удалить все сообщения)
  clearChat: (userId) => api.post(`/messages/clear-chat/${userId}`),
  // Удалить чат (полное удаление)
  deleteChat: (userId) => api.post(`/messages/delete-chat/${userId}`),
  // Отметить одно сообщение как прочитанное
  markMessageAsRead: (messageId) => api.post(`/messages/${messageId}/read`),
  // 📤 Переслать сообщение
  forwardMessage: (forwardData) => api.post('/messages/forward', forwardData),
};

export const profileAPI = {
  getProfile: () => api.get('/profile'),
  updateProfile: (profileData) => api.put('/profile', profileData),
  getUserProfile: (userId) => api.get(`/users/${userId}`),
  
  // Методы для галереи фото
  uploadGalleryPhoto: (photo) => api.post('/user_gallery', { photo }),
  getGalleryPhotos: () => api.get('/user_gallery'),
  deleteGalleryPhoto: (photoId) => api.delete(`/user_gallery/${photoId}`),
};

export const postAPI = {
  getPosts: () => api.get('/posts'),
  createPost: (postData) => api.post('/posts', postData),
  getPost: (postId) => api.get(`/posts/${postId}`),
  updatePost: (postId, postData) => api.put(`/posts/${postId}`, postData),
  deletePost: (postId) => api.delete(`/posts/${postId}`),
  likePost: (postId) => api.post(`/posts/${postId}/like`),
  addComment: (postId, comment) => api.post(`/posts/${postId}/comments`, { comment }),
  getComments: (postId) => api.get(`/posts/${postId}/comments`),
  editComment: (commentId, comment) => api.put(`/comments/${commentId}`, { comment }),
  deleteComment: (commentId) => api.delete(`/comments/${commentId}`),
  reportPost: (postId, reason) => api.post(`/posts/${postId}/report`, { reason }),
  getReports: () => api.get('/admin/post-reports'),
  getReportsStats: () => api.get('/admin/post-reports-stats'),
  handleReport: (reportId, action, banDurationDays = null) => 
    api.post(`/admin/post-reports/${reportId}/${action}`, { ban_duration_days: banDurationDays }),
  
  // ✨ НОВЫЕ ЭНДПОИНТЫ ДЛЯ ФУНКЦИЙ ПОСТОВ
  // Лента постов с сортировкой и фильтрацией
  getFeed: (sort = 'newest', filter = 'all', search = '', page = 1, limit = 20) =>
    api.get('/posts/feed', { 
      params: { sort, filter, search, page, limit } 
    }),
  
  // Поиск постов
  searchPosts: (query, limit = 50) =>
    api.get('/posts/search', { 
      params: { q: query, limit } 
    }),
  
  // Закладки
  addBookmark: (postId) => api.post(`/posts/${postId}/bookmark`, {}),
  removeBookmark: (postId) => api.delete(`/posts/${postId}/bookmark`),
  getBookmarks: (page = 1, limit = 20) =>
    api.get('/posts/bookmarks/my', { 
      params: { page, limit } 
    }),
  
  // Рекомендации
  getRecommendations: (postId, limit = 10) =>
    api.get(`/posts/${postId}/recommendations`, { 
      params: { limit } 
    }),
  getPersonalizedRecommendations: (limit = 20) =>
    api.get('/posts/recommendations/for-me', { 
      params: { limit } 
    }),
  
  // Фильтр по авторам
  getFriendsPosts: (page = 1, limit = 20) =>
    api.get('/posts/authors/friends', { 
      params: { page, limit } 
    }),
  getAuthorPosts: (authorId, page = 1, limit = 20) =>
    api.get(`/posts/authors/${authorId}`, { 
      params: { page, limit } 
    }),
};

export const friendAPI = {
  getFriends: () => api.get('/friends'),
  searchUsers: (query) => api.get(query ? `/users/search?q=${query}` : '/users'),
  sendFriendRequest: (userId) => api.post(`/friends/request/${userId}`),
  acceptFriend: (userId) => api.post(`/friends/accept/${userId}`),
  removeFriend: (userId) => api.delete(`/friends/${userId}`),
  getFriendRequests: () => api.get('/friends/requests'),
  getOnlineFriends: () => api.get('/friends/online'),
};

export const groupAPI = {
  getGroups: () => api.get('/groups'),
  createGroup: (groupData) => api.post('/groups', groupData),
  getGroup: (groupId) => api.get(`/groups/${groupId}`),
  getGroupMessages: (groupId, options = {}) => {
    const { page = 1, limit = 50 } = options;
    return api.get(`/groups/${groupId}/messages`, { params: { page, limit } });
  },
  sendGroupMessage: (messageData) => api.post(`/groups/${messageData.group_id}/messages`, messageData),
  deleteGroupMessage: (messageId) => api.delete(`/groups/messages/${messageId}`),
  editGroupMessage: (messageId, newText) => api.put(`/groups/messages/${messageId}`, { message: newText }),
  getGroupMembers: (groupId) => api.get(`/groups/${groupId}/members`),
  addGroupMember: (groupId, userId) => api.post(`/groups/${groupId}/members`, { userId }),
  removeGroupMember: (groupId, userId) => api.delete(`/groups/${groupId}/members/${userId}`),
  leaveGroup: (groupId) => api.post(`/groups/${groupId}/leave`),
  updateGroup: (groupId, groupData) => api.put(`/groups/${groupId}`, groupData),
  getGroupUnreadCount: (groupId) => api.get(`/groups/${groupId}/unread-count`),
  markGroupAsRead: (groupId) => api.post(`/groups/${groupId}/read-all`),
  getPinnedMessages: (groupId) => api.get(`/groups/${groupId}/pinned-messages`),
};

export const pinnedAPI = {
  // Получить закрепы в личном чате
  getPinnedMessages: (chatId) => api.get(`/chats/${chatId}/pinned-messages`),
  
  // Получить закрепы в группе
  getGroupPinnedMessages: (groupId) => api.get(`/groups/${groupId}/pinned-messages`),
  
  // Закрепить сообщение (с опцией видимости)
  pinMessage: (messageId, chatType, chatId, isVisibleToAll = true) =>
    api.post('/pinned-messages', { 
      message_id: messageId, 
      chat_type: chatType, 
      chat_id: chatId,
      is_visible_to_all: isVisibleToAll
    }),
  
  // Открепить сообщение
  unpinMessage: (messageId) =>
    api.delete(`/pinned-messages/${messageId}`)
};

export const pinnedChatsAPI = {
  getPinnedChats: () => api.get('/pinned-chats'),
  pinChat: (chatType, chatId) => api.post('/pinned-chats', { chat_type: chatType, chat_id: chatId }),
  unpinChat: (chatType, chatId) => api.delete(`/pinned-chats/${chatType}/${chatId}`),
};

export const adminAPI = {
  checkAdminStatus: () => api.get('/admin/check'),
  getAdminGroups: () => api.get('/admin/groups'),
  deleteGroup: (groupId) => api.delete(`/admin/groups/${groupId}`),
  getAdminChats: () => api.get('/admin/chats'),
  deleteChat: (userId1, userId2) => api.delete(`/admin/chats/${userId1}/${userId2}`),
};

export const mediaAPI = {
  uploadMedia: async (uriOrFormData, type = null, onProgress = null) => {
    const token = await AsyncStorage.getItem('token');
    
    let formData;
    let mediaType = 'image/jpeg';
    
    // Если передан FormData напрямую (для голоса)
    if (uriOrFormData instanceof FormData) {
      formData = uriOrFormData;
    } else {
      // Если передан uri и type
      formData = new FormData();
      
      if (type === 'video') {
        mediaType = 'video/mp4';
      } else if (type === 'voice' || type === 'audio') {
        mediaType = 'audio/m4a';
      } else {
        mediaType = 'image/jpeg';
      }
      
      console.log(`📤 uploadMedia: uri=${uriOrFormData?.slice(-50)}, type=${type}`);
      
      formData.append('media', {
        uri: uriOrFormData,
        type: mediaType,
        name: type === 'video' ? 'video.mp4' : type === 'voice' || type === 'audio' ? `voice_${Date.now()}.m4a` : 'image.jpg',
      });
    }
    
    return axios.post(`${API_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`,
      },
      timeout: 120000, // 2 минуты для больших видео
      onUploadProgress: onProgress,
    });
  },
};

export const callAPI = {
  initiateAudioCall: (receiverId) => api.post('/calls/audio/initiate', { receiver_id: receiverId }),
  initiateVideoCall: (receiverId) => api.post('/calls/video/initiate', { receiver_id: receiverId }),
  respondToCall: (callId, accept) => api.post(`/calls/${callId}/respond`, { accept }),
  endCall: (callId) => api.post(`/calls/${callId}/end`, {}),
  getCallStatus: (callId) => api.get(`/calls/${callId}/status`),
  getCallHistory: (limit = 50) => api.get('/calls/history', { params: { limit } }),
};

export const communitiesAPI = {
  // Получить все сообщества
  getCommunities: (limit = 20, offset = 0, category = null, search = null, sort = 'newest') =>
    api.get('/communities', { 
      params: { limit, offset, category, search, sort } 
    }),
  
  // Получить мои сообщества
  getMyCommunities: () => api.get('/communities/my'),
  
  // Получить детали сообщества
  getCommunity: (communityId) => api.get(`/communities/${communityId}`),
  
  // ✅ Создать сообщество (поддержка FormData)
  createCommunity: (data, config = {}) => {
    const defaultConfig = {
      headers: {}
    };
    
    // ✅ Если это FormData, НЕ устанавливаем Content-Type
    if (data instanceof FormData) {
      if (__DEV__) console.log('📤 Отправляем сообщество с FormData');
      return api.post('/communities', data, {
        ...defaultConfig,
        ...config,
        headers: {
          ...defaultConfig.headers,
          ...config.headers,
          // НЕ устанавливаем Content-Type для FormData
        }
      });
    }
    
    // Для обычных данных отправляем как JSON
    return api.post('/communities', data, { ...defaultConfig, ...config });
  },
  
  // Обновить сообщество
  updateCommunity: (communityId, data) => api.put(`/communities/${communityId}`, data),
  
  // Удалить сообщество
  deleteCommunity: (communityId) => api.delete(`/communities/${communityId}`),
  
  // Членство в сообществах
  joinCommunity: (communityId) => api.post(`/communities/${communityId}/join`, {}),
  leaveCommunity: (communityId) => api.post(`/communities/${communityId}/leave`, {}),
  getMembers: (communityId, role = null) =>
    api.get(`/communities/${communityId}/members`, { params: { role } }),
  updateMemberRole: (communityId, userId, role) =>
    api.put(`/communities/${communityId}/members/${userId}/role`, { role }),
  removeMember: (communityId, userId) =>
    api.delete(`/communities/${communityId}/members/${userId}`),
  
  // Посты в сообществах
  getPosts: (communityId, limit = 20, offset = 0) =>
    api.get(`/communities/${communityId}/posts`, { params: { limit, offset } }),
  createPost: (communityId, data) =>
    api.post(`/communities/${communityId}/posts`, data),
  deletePost: (communityId, postId) =>
    api.delete(`/communities/${communityId}/posts/${postId}`),
  likePost: (communityId, postId) =>
    api.post(`/communities/${communityId}/posts/${postId}/like`, {}),
  getComments: (communityId, postId) =>
    api.get(`/communities/${communityId}/posts/${postId}/comments`),
  addComment: (communityId, postId, data) =>
    api.post(`/communities/${communityId}/posts/${postId}/comments`, data),
  
  // Блокировка в сообществах
  banUser: (communityId, data) =>
    api.post(`/communities/${communityId}/ban`, data),
  unbanUser: (communityId, data) =>
    api.post(`/communities/${communityId}/unban`, data),
  
  // Подписки
  followCommunity: (communityId) =>
    api.post(`/communities/${communityId}/follow`, {}),
  unfollowCommunity: (communityId) =>
    api.delete(`/communities/${communityId}/follow`),
  
  // Поиск и рекомендации
  searchCommunities: (q, limit = 10) =>
    api.get('/communities/search', { params: { q, limit } }),
  getTrendingCommunities: (limit = 10) =>
    api.get('/communities/trending', { params: { limit } }),
  getCategories: () =>
    api.get('/communities/categories'),
};

export { checkServerAvailability };
export default api;