// WebSocket обработчики для уведомлений
const setupNotificationHandlers = (io, db) => {
  // Хранилище активных соединений пользователей
  const userConnections = new Map();
  
  io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);
    
    // Подписка на уведомления для конкретного пользователя
    socket.on('subscribe_notifications', (userId) => {
      console.log(`Пользователь ${userId} подписался на уведомления`);
      
      // Сохраняем соединение пользователя
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId).add(socket.id);
      
      // Присоединяем к комнате пользователя
      socket.join(`user_${userId}`);
      socket.userId = userId;
    });
    
    // Отправка личного сообщения
    socket.on('send_message', async (data) => {
      try {
        const { receiver_id, message, sender_id, sender_username } = data;
        
        // Создаем объект сообщения
        const messageData = {
          sender_id,
          receiver_id,
          message,
          sender_username,
          created_at: new Date(),
          id: Date.now() // Временный ID
        };
        
        // Отправляем получателю
        io.to(`user_${receiver_id}`).emit('new_message', messageData);
        
        // Проверяем, онлайн ли получатель
        const receiverConnections = userConnections.get(receiver_id);
        const isReceiverOnline = receiverConnections && receiverConnections.size > 0;
        
        if (!isReceiverOnline) {
          // Если получатель не онлайн, можно отправить push уведомление
          console.log(`Получатель ${receiver_id} не онлайн, нужно отправить push уведомление`);
          
          // Здесь можно добавить логику отправки push уведомлений через FCM/APNs
          await sendPushNotification(receiver_id, sender_username, message);
        }
        
      } catch (error) {
        console.error('Ошибка отправки сообщения через WebSocket:', error);
      }
    });
    
    // Отправка группового сообщения
    socket.on('send_group_message', async (data) => {
      try {
        const { group_id, message, sender_id, sender_username } = data;
        
        // Получаем участников группы
        const groupMembers = await db.query(`
          SELECT user_id FROM group_members WHERE group_id = ?
        `, [group_id]);
        
        const messageData = {
          group_id,
          sender_id,
          message,
          sender_username,
          created_at: new Date(),
          id: Date.now()
        };
        
        // Отправляем всем участникам группы
        for (const member of groupMembers) {
          if (member.user_id !== sender_id) {
            io.to(`user_${member.user_id}`).emit('new_group_message', messageData);
            
            // Проверяем, онлайн ли участник
            const memberConnections = userConnections.get(member.user_id);
            const isMemberOnline = memberConnections && memberConnections.size > 0;
            
            if (!isMemberOnline) {
              await sendPushNotification(member.user_id, `${sender_username} в группе`, message);
            }
          }
        }
        
      } catch (error) {
        console.error('Ошибка отправки группового сообщения:', error);
      }
    });
    
    // Отключение пользователя
    socket.on('disconnect', () => {
      console.log('Пользователь отключился:', socket.id);
      
      // Удаляем соединение из хранилища
      if (socket.userId) {
        const connections = userConnections.get(socket.userId);
        if (connections) {
          connections.delete(socket.id);
          if (connections.size === 0) {
            userConnections.delete(socket.userId);
          }
        }
      }
    });
  });
  
  // Функция отправки push уведомлений
  async function sendPushNotification(userId, title, body) {
    try {
      // Получаем push токен пользователя
      const userResult = await db.query(`
        SELECT push_token FROM users WHERE id = ? AND push_token IS NOT NULL
      `, [userId]);
      
      if (userResult.length === 0) {
        console.log(`Push токен не найден для пользователя ${userId}`);
        return;
      }
      
      const pushToken = userResult[0].push_token;
      
      // Логируем для отладки
      console.log(`Отправка push уведомления пользователю ${userId}:`, { title, body, pushToken });

      // Попробуем отправить через expo-server-sdk, если он установлен
      try {
        // require внутри try/catch — не будет падать, если модуль не установлен
        const { Expo } = require('expo-server-sdk');
        const expo = new Expo();

        if (Expo.isExpoPushToken(pushToken)) {
          const message = {
            to: pushToken,
            sound: 'default',
            title: title,
            body: body,
            data: { userId, type: 'message' },
          };

          // expo.sendPushNotificationsAsync может принять массив сообщений
          const chunks = expo.chunkPushNotifications([message]);
          for (const chunk of chunks) {
            try {
              const receipts = await expo.sendPushNotificationsAsync(chunk);
              console.log('Expo push receipts:', receipts);
            } catch (error) {
              console.error('Ошибка отправки chunk через Expo:', error);
            }
          }
        } else {
          console.log('Токен не является Expo push токеном, нужно отправлять через FCM/APNs напрямую');
          // Здесь можно реализовать отправку через FCM/APNs, если у вас нативные токены
        }
      } catch (expoErr) {
        // Модуль expo-server-sdk не установлен — логируем и выходим
        console.log('expo-server-sdk не установлен. Установите его на сервере, чтобы отправлять push через Expo Push API.', expoErr);
      }
      
    } catch (error) {
      console.error('Ошибка отправки push уведомления:', error);
    }
  }
};

module.exports = { setupNotificationHandlers };