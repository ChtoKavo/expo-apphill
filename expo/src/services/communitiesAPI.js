import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://151.247.196.66:3001/api';

console.log('🌐 API URL:', API_URL);

// Вспомогательная функция для получения токена
const getAuthToken = async () => {
  return await AsyncStorage.getItem('authToken');
};

// Тест подключения отключен для уменьшения логов

export default {
  createCommunity: async (formData) => {
    try {
      if (!(formData instanceof FormData)) {
        throw new Error('❌ Data must be FormData instance');
      }
      
      const token = await getAuthToken();
      console.log('📤 Создание сообщества...');
      
      const headers = {
        ...(token && { 'Authorization': `Bearer ${token}` }),
        // НЕ устанавливаем Content-Type - fetch сам установит с правильной границей для FormData
      };
      
      const response = await fetch(`${API_URL}/communities`, {
        method: 'POST',
        headers,
        body: formData,
        timeout: 30000,
      });
      
      const data = await response.json();
      console.log('✅ Сообщество создано! Status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data?.error || 'Unknown error'}`);
      }
      
      return { data, status: response.status };
      
    } catch (err) {
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в createCommunity:');
      console.error('   Message:', err.message);
      console.error('   Full error:', err);
      throw err;
    }
  },

  getCommunities: async () => {
    try {
      console.log('📥 Загрузка сообществ...');
      
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/communities`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      const data = await response.json();
      const count = Array.isArray(data) ? data.length : 0;
      console.log(`✅ Загружено сообществ: ${count}`);
      
      // Показываем информацию о каждом сообществе (компактный формат)
      if (Array.isArray(data)) {
        data.forEach(c => {
          const imageStatus = c.image ? `📸 ${c.image}` : '⚠️ NO IMAGE (NULL)';
          console.log(`📱 ${c.name} | ID: ${c.id} | Image: ${imageStatus}`);
        });
      }
      
      return { data, status: response.status };
    } catch (err) {
      console.error('❌ Ошибка загрузки сообществ:', err.message);
      throw err;
    }
  },

  getCommunity: async (id) => {
    try {
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/communities/${id}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      const data = await response.json();
      return { data, status: response.status };
    } catch (err) {
      console.error('❌ Ошибка получения сообщества:', err.message);
      throw err;
    }
  },

  updateCommunity: async (id, updateData) => {
    try {
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/communities/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(updateData),
      });
      
      const data = await response.json();
      return { data, status: response.status };
    } catch (err) {
      console.error('❌ Ошибка обновления сообщества:', err.message);
      throw err;
    }
  },

  deleteCommunity: async (id) => {
    try {
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/communities/${id}`, {
        method: 'DELETE',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      const data = await response.json();
      return { data, status: response.status };
    } catch (err) {
      console.error('❌ Ошибка удаления сообщества:', err.message);
      throw err;
    }
  },

  joinCommunity: async (id) => {
    try {
      console.log(`👥 Присоединение к сообществу ${id}...`);
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/communities/${id}/join`, {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      const data = await response.json();
      return { data, status: response.status };
    } catch (err) {
      console.error('❌ Ошибка присоединения:', err.message);
      throw err;
    }
  },

  leaveCommunity: async (id) => {
    try {
      console.log(`👋 Выход из сообщества ${id}...`);
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/communities/${id}/leave`, {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      
      const data = await response.json();
      return { data, status: response.status };
    } catch (err) {
      console.error('❌ Ошибка выхода:', err.message);
      throw err;
    }
  },
};
