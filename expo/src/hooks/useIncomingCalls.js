import { useEffect, useRef } from 'react';
import { getOrCreateSocket } from '../services/globalSocket';

/**
 * Hook для слушания входящих звонков
 * Должен быть использован в MainTabs или App.js
 */
export const useIncomingCalls = (navigation) => {
  const socketRef = useRef(null);
  const callListenerRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const setupCallListener = async () => {
      try {
        console.log('🔊 Инициализируем слушатель входящих звонков...');
        
        // Получаем существующий сокет или создаем новый
        const socket = await getOrCreateSocket();
        socketRef.current = socket;

        if (!mounted) return;

        /**
         * Обработчик входящего звонка
         */
        const handleIncomingCall = (data) => {
          console.log('📞 ВХОДЯЩИЙ ЗВОНОК от:', data.from_user?.username || 'Unknown');
          console.log('Call data:', {
            call_id: data.call_id,
            from_user_id: data.from_user_id,
            call_type: data.call_type
          });
          
          if (mounted && navigation) {
            // Переходим на экран входящего звонка
            navigation.navigate('IncomingCall', {
              caller: data.from_user || { 
                id: data.from_user_id, 
                username: 'Пользователь' 
              },
              callType: data.call_type || 'audio',
              callId: data.call_id,
            });
          }
        };

        /**
         * Обработчик пропущенного звонка
         */
        const handleMissedCall = (data) => {
          console.log('📵 Пропущенный звонок:', data);
        };

        // Регистрируем слушатели
        socket.on('call_incoming', handleIncomingCall);
        socket.on('call_missed', handleMissedCall);

        callListenerRef.current = { handleIncomingCall, handleMissedCall };

        console.log('✅ Слушатель входящих звонков готов');

        // Cleanup
        return () => {
          if (socketRef.current) {
            socketRef.current.off('call_incoming', handleIncomingCall);
            socketRef.current.off('call_missed', handleMissedCall);
          }
        };
      } catch (error) {
        console.error('❌ Ошибка инициализации слушателя звонков:', error);
      }
    };

    setupCallListener();

    return () => {
      mounted = false;
    };
  }, [navigation]);
};

export default useIncomingCalls;
