# 📋 ПОЛНЫЕ ПРИМЕРЫ КОДА ДЛЯ СЕРВЕРА

Используй эти примеры для замены в своем server.js

---

## 📍 ПРИМЕР 1: ЛИЧНЫЕ СООБЩЕНИЯ

Это должно быть в конце обработчика `POST /api/messages`.

Найди где отправляются личные сообщения и замени весь блок push на это:

```javascript
// ===============================================
// 📨 ОТПРАВКА ЛИЧНОГО СООБЩЕНИЯ - ИСПРАВЛЕННАЯ ВЕРСИЯ
// ===============================================

// 📤 Отправляем socket.io сообщение (для онлайн пользователей)
io.to(`user_${receiver_id}`).emit('new_message', {
  id: messageId,
  sender_id: sender_id,
  receiver_id: receiver_id,
  message: message,
  created_at: new Date().toISOString(),
  is_read: false,
  sender_username: sender_username,
  media_type: media_type,
  media_url: media_url,
  duration: duration,
  caption: caption,
  reply_to: reply_to,
  messageId: messageId
});

// 📱 ОТПРАВЛЯЕМ PUSH-УВЕДОМЛЕНИЕ (для оффлайн пользователей и всех в целом)
(async () => {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 PUSH-УВЕДОМЛЕНИЕ: Личное сообщение`);
    console.log(`   Получатель: ${receiver_id}`);
    console.log(`   От: ${sender_username} (${sender_id})`);
    console.log(`   Сообщение: ${(message || '').slice(0, 50)}...`);
    console.log(`${'='.repeat(70)}`);
    
    // ⭐ КЛЮЧЕВОЙ МОМЕНТ: Всегда пробуем получить токен из БД
    const pushToken = await getPushTokenFromDB(receiver_id);
    
    if (!pushToken) {
      console.log(`⚠️ Push-токен не найден в БД для пользователя ${receiver_id}`);
      console.log(`   Проверь: SELECT * FROM push_tokens WHERE user_id = ${receiver_id};`);
      return; // Только если токена нет
    }
    
    // Проверяем валидность токена
    if (!Expo.isExpoPushToken(pushToken)) {
      console.log(`⚠️ Невалидный Expo токен: ${pushToken.slice(0, 40)}...`);
      return;
    }
    
    // ✅ ВСЕГДА отправляем push в Expo (даже если пользователь онлайн!)
    // Клиент сам решит показывать или скрывать через activeChats
    const pushMessage = {
      to: pushToken,
      sound: 'default',
      title: `📨 ${sender_username}`,
      body: (message || '').slice(0, 100),
      data: {
        type: 'new_message',
        sender_id: sender_id,
        senderId: sender_id,
        senderName: sender_username,
        message_id: messageId,
        message: (message || '').slice(0, 100),
        isGroup: false,
        chat_id: sender_id,
        chat_type: 'personal'
      },
      badge: 1,
      priority: 'high',
      ttl: 86400  // 24 часа
    };
    
    try {
      const tickets = await expo.sendPushNotificationsAsync([pushMessage]);
      console.log(`✅ Push успешно отправлен на ${pushToken.slice(0, 40)}...`);
      console.log(`   Ticket ID: ${JSON.stringify(tickets[0])}`);
      return true;
    } catch (pushError) {
      console.error(`❌ Ошибка отправки push: ${pushError.message}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Критическая ошибка при отправке push: ${error.message}`);
    return false;
  }
})();

// Продолжай с остальным кодом...
```

---

## 📍 ПРИМЕР 2: ГРУППОВЫЕ СООБЩЕНИЯ

Это должно быть в конце обработчика `POST /api/groups/:groupId/messages`.

Замени весь блок отправки push членам группы на это:

```javascript
// ===============================================
// 💬 ОТПРАВКА ГРУППОВОГО СООБЩЕНИЯ - ИСПРАВЛЕННАЯ ВЕРСИЯ
// ===============================================

// 📤 Отправляем socket.io в комнату группы (для онлайн членов)
io.to(`group_${groupId}`).emit('new_group_message', {
  id: messageId,
  group_id: groupId,
  sender_id: sender_id,
  message: message,
  created_at: new Date().toISOString(),
  is_read: false,
  sender_username: sender_username,
  media_type: media_type,
  media_url: media_url,
  duration: duration,
  caption: caption,
  messageId: messageId
});

// 🔔 ОТПРАВЛЯЕМ PUSH-УВЕДОМЛЕНИЯ ЧЛЕНАМ ГРУППЫ
(async () => {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 PUSH-УВЕДОМЛЕНИЕ: Групповое сообщение`);
    console.log(`   Группа: ${groupId}`);
    console.log(`   От: ${sender_username} (${sender_id})`);
    console.log(`${'='.repeat(70)}`);
    
    // Получаем всех членов группы
    const [members] = await db.promise().query(
      'SELECT user_id FROM group_members WHERE group_id = ? AND status = "active"',
      [groupId]
    );
    
    if (!members || members.length === 0) {
      console.log(`⚠️ Нет активных членов в группе ${groupId}`);
      return;
    }
    
    console.log(`👥 Всего членов: ${members.length}`);
    
    // ⭐ КЛЮЧЕВОЙ МОМЕНТ: Правильный фильтр
    // НЕ отправляем push если:
    // 1. Это отправитель сообщения
    // 2. Пользователь находится в активном чате этой группы
    const validMembers = members.filter(m => {
      // Не отправляем себе
      if (m.user_id === sender_id) {
        console.log(`   ⏭️  ${m.user_id} = отправитель, пропускаем`);
        return false;
      }
      
      // Проверяем находится ли в активном чате
      const isInActiveChat = isUserInActiveChat(m.user_id, groupId, 'group');
      
      if (isInActiveChat) {
        console.log(`   ⏭️  ${m.user_id} в активном чате - skip push`);
        return false;
      }
      
      // ✅ Отправляем push для этого пользователя
      console.log(`   ✅ ${m.user_id} получит push`);
      return true;
    });
    
    if (validMembers.length === 0) {
      console.log(`📢 Все члены либо отправитель, либо в активных чатах`);
      return;
    }
    
    console.log(`📤 Отправляем push для ${validMembers.length} пользователей\n`);
    
    // Отправляем push для каждого валидного члена
    let successCount = 0;
    let failCount = 0;
    
    for (const member of validMembers) {
      try {
        const pushToken = await getPushTokenFromDB(member.user_id);
        
        if (!pushToken) {
          console.log(`   ⚠️  ${member.user_id}: токен не найден`);
          failCount++;
          continue;
        }
        
        if (!Expo.isExpoPushToken(pushToken)) {
          console.log(`   ⚠️  ${member.user_id}: невалидный токен`);
          failCount++;
          continue;
        }
        
        const pushMessage = {
          to: pushToken,
          sound: 'default',
          title: `💬 ${groupName}`,
          body: `${sender_username}: ${(message || '').slice(0, 80)}`,
          data: {
            type: 'new_group_message',
            group_id: groupId,
            group_name: groupName,
            sender_id: sender_id,
            sender_name: sender_username,
            message_id: messageId,
            chat_type: 'group'
          },
          badge: 1,
          priority: 'high',
          ttl: 86400
        };
        
        const tickets = await expo.sendPushNotificationsAsync([pushMessage]);
        console.log(`   ✅ ${member.user_id}: push отправлен`);
        successCount++;
        
      } catch (memberError) {
        console.error(`   ❌ ${member.user_id}: ${memberError.message}`);
        failCount++;
      }
    }
    
    console.log(`\n   ✅ Успешно: ${successCount}`);
    console.log(`   ❌ Ошибок: ${failCount}`);
    console.log(`${'='.repeat(70)}\n`);
    
  } catch (error) {
    console.error(`❌ Критическая ошибка при отправке групповых push: ${error.message}`);
  }
})();

// Продолжай с остальным кодом...
```

---

## 📍 ПРИМЕР 3: ВХОДЯЩИЕ ВЫЗОВЫ

Добавь это в конец обработчика `socket.on('call_initiate', ...)`:

```javascript
// ===============================================
// 📞 ОТПРАВКА PUSH ДЛЯ ВХОДЯЩЕГО ВЫЗОВА
// ===============================================

(async () => {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 PUSH-УВЕДОМЛЕНИЕ: Входящий вызов`);
    console.log(`   От: ${caller_username} (${caller_id})`);
    console.log(`   Кому: ${receiver_id}`);
    console.log(`   Тип: ${call_type || 'audio'}`);
    console.log(`${'='.repeat(70)}`);
    
    // Получаем токен получателя
    const pushToken = await getPushTokenFromDB(receiver_id);
    
    if (!pushToken) {
      console.log(`⚠️ Push-токен не найден для ${receiver_id}`);
      return;
    }
    
    if (!Expo.isExpoPushToken(pushToken)) {
      console.log(`⚠️ Невалидный токен`);
      return;
    }
    
    // Отправляем push о входящем вызове
    const pushMessage = {
      to: pushToken,
      sound: 'default',
      title: `📞 ${call_type === 'video' ? '📹' : '☎️'} Входящий вызов`,
      body: `${caller_username} вам звонит...`,
      data: {
        type: 'incoming_call',
        caller_id: caller_id,
        caller_name: caller_username,
        call_type: call_type || 'audio',
        room_id: room_id || call_id
      },
      badge: 1,
      priority: 'high',
      ttl: 120  // 2 минуты - вызов недолго актуален
    };
    
    const tickets = await expo.sendPushNotificationsAsync([pushMessage]);
    console.log(`✅ Push о вызове отправлен`);
    console.log(`   Ticket: ${JSON.stringify(tickets[0])}`);
    
  } catch (error) {
    console.error(`❌ Ошибка при отправке push вызова: ${error.message}`);
  }
})();

// Продолжай с остальным кодом...
```

---

## 📍 ПРИМЕР 4: ПРОПУЩЕННЫЕ ВЫЗОВЫ

Добавь это когда вызов не принят:

```javascript
// ===============================================
// ❌ ОТПРАВКА PUSH ДЛЯ ПРОПУЩЕННОГО ВЫЗОВА
// ===============================================

(async () => {
  try {
    const missedCallToken = await getPushTokenFromDB(receiver_id);
    
    if (!missedCallToken || !Expo.isExpoPushToken(missedCallToken)) {
      console.log(`⚠️ Токен для пропущенного вызова не найден`);
      return;
    }
    
    const missedCallPush = {
      to: missedCallToken,
      sound: 'default',
      title: `❌ Пропущенный вызов`,
      body: `От ${caller_username}`,
      data: {
        type: 'missed_call',
        caller_id: caller_id,
        caller_name: caller_username,
        call_type: call_type || 'audio'
      },
      badge: 1,
      priority: 'high'
    };
    
    await expo.sendPushNotificationsAsync([missedCallPush]);
    console.log(`✅ Push о пропущенном вызове отправлен`);
    
  } catch (error) {
    console.error(`❌ Ошибка push пропущенного вызова: ${error.message}`);
  }
})();

// Продолжай с остальным кодом...
```

---

## 🔧 ПРОВЕРКА: ЧТО ДОЛЖНО БЫТЬ НА СЕРВЕРЕ

```javascript
// 1. Переменная expo инициализирована:
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

// 2. Функция для получения токена из БД:
async function getPushTokenFromDB(userId) {
  try {
    const [result] = await db.promise().query(
      'SELECT push_token FROM push_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    return result.length > 0 ? result[0].push_token : null;
  } catch (error) {
    console.error('Ошибка получения токена:', error);
    return null;
  }
}

// 3. Функция для проверки активного чата:
function isUserInActiveChat(userId, chatId, chatType) {
  const active = activeChats.get(userId);
  return active && active.chatId === chatId && active.chatType === chatType;
}

// 4. Map для хранения активных чатов:
const activeChats = new Map();

// 5. Socket слушатели для синхронизации:
socket.on('set_active_chat', (data) => {
  activeChats.set(userId, {
    chatId: data.chat_id,
    chatType: data.chat_type,
    timestamp: new Date(data.timestamp)
  });
});

socket.on('clear_active_chat', () => {
  activeChats.delete(userId);
});
```

---

## 🚀 ПОРЯДОК ПРИМЕНЕНИЯ

1. Найди `POST /api/messages` → замени push блок на Пример 1
2. Найди `POST /api/groups/:groupId/messages` → замени push блок на Пример 2
3. (Опционально) Найди `socket.on('call_initiate')` → добавь Пример 3
4. (Опционально) Где обрабатывается отклонение вызова → добавь Пример 4
5. **Перезагрузи сервер**
6. Протестируй согласно TESTING_PUSH_NOTIFICATIONS.md

---

**Готово!** Теперь push работает для всех сценариев! 🎉
