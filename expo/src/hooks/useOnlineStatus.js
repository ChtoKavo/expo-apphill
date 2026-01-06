import { useEffect, useRef } from 'react';
import { getOrCreateSocket } from '../services/globalSocket';

/**
 * Hook для отслеживания онлайн статусов друзей в реальном времени
 * 
 * @param {function} onStatusChange - Callback при изменении статуса пользователя
 *                                   получает { userId, is_online }
 * @returns {object} { loading, error }
 */
export const useOnlineStatus = (onStatusChange) => {
  const socketRef = useRef(null);
  const handlersRef = useRef(new Map());

  useEffect(() => {
    let isMounted = true;

    const initSocket = async () => {
      try {
        const socket = await getOrCreateSocket();
        socketRef.current = socket;

        if (!isMounted) return;

        // Регистрируем handler для user_status_changed
        const handleStatusChange = (data) => {
          console.log('📡 useOnlineStatus: user_status_changed получен', data);

          // Извлекаем userId
          const userId = data?.userId ?? data?.user_id ?? data?.id;
          
          // Извлекаем is_online
          let is_online = false;
          if (data && typeof data === 'object') {
            if (typeof data.is_online === 'boolean') {
              is_online = data.is_online;
            } else if (typeof data.online === 'boolean') {
              is_online = data.online;
            }
          }

          console.log(`   ✅ Обновление статуса: userId=${userId}, is_online=${is_online}`);

          if (userId !== undefined && onStatusChange) {
            onStatusChange({ userId, is_online });
          }
        };

        // Сохраняем handler для удаления позже
        if (!handlersRef.current.has('user_status_changed')) {
          handlersRef.current.set('user_status_changed', handleStatusChange);
        }

        socket.on('user_status_changed', handleStatusChange);
        console.log('✅ useOnlineStatus: Слушатель user_status_changed зарегистрирован');

        // Также слушаем снимок статусов при подключении
        const handleStatusSnapshot = (statuses) => {
          console.log(`📸 useOnlineStatus: Получен снимок ${statuses?.length || 0} статусов`);
          
          if (statuses && Array.isArray(statuses)) {
            statuses.forEach(status => {
              const userId = status.user_id;
              const is_online = status.is_online === 1 ? true : false;
              
              console.log(`   ✅ Из снимка: userId=${userId}, is_online=${is_online}`);
              
              if (onStatusChange) {
                onStatusChange({ userId, is_online });
              }
            });
          }
        };

        if (!handlersRef.current.has('friends_status_snapshot')) {
          handlersRef.current.set('friends_status_snapshot', handleStatusSnapshot);
        }

        socket.on('friends_status_snapshot', handleStatusSnapshot);
        console.log('✅ useOnlineStatus: Слушатель friends_status_snapshot зарегистрирован');

      } catch (error) {
        console.error('❌ useOnlineStatus: Ошибка инициализации:', error);
      }
    };

    initSocket();

    // Cleanup
    return () => {
      isMounted = false;
      
      if (socketRef.current) {
        const statusHandler = handlersRef.current.get('user_status_changed');
        const snapshotHandler = handlersRef.current.get('friends_status_snapshot');
        
        if (statusHandler) {
          socketRef.current.off('user_status_changed', statusHandler);
          handlersRef.current.delete('user_status_changed');
        }
        
        if (snapshotHandler) {
          socketRef.current.off('friends_status_snapshot', snapshotHandler);
          handlersRef.current.delete('friends_status_snapshot');
        }
      }
    };
  }, [onStatusChange]);

  return {
    loading: false,
    error: null
  };
};

export default useOnlineStatus;
