# 🔧 ИСПРАВЛЕНИЯ PUSH-УВЕДОМЛЕНИЙ ДЛЯ СЕРВЕРА

**Проблема**: Push-уведомления не работают, когда пользователь вне приложения  
**Причина**: Неправильная логика отправки push - выход при отсутствии токена вместо попытки отправки

---

## ✅ ИСПРАВЛЕНИЕ 1: Личные сообщения (Personal Messages)

**Файл**: `server.js`  
**Локация**: Конец эндпоинта `POST /api/messages` (примерно строка 4420-4490)  
**Проблема**: Код выходит, если токен не найден, вместо попытки отправить push

### Замени весь блок push отправки на:

```javascript
(async () => {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 PUSH-УВЕДОМЛЕНИЕ: Личное сообщение`);
    console.log(`   Получатель: ${receiver_id}`);
    console.log(`   От: ${sender_username} (${sender_id})`);
    console.log(`${'='.repeat(70)}`);
    
    // ⭐ ВСЕГДА берем токен из БД (не из кэша!)
    const pushToken = await getPushTokenFromDB(receiver_id);
    
    if (!pushToken) {
      console.log(`⚠️  Push-токен не найден для ${receiver_id}`);
      return;
    }
    
    if (!Expo.isExpoPushToken(pushToken)) {
      console.log(`⚠️  Невалидный токен: ${pushToken.slice(0, 40)}...`);
      return;
    }
    
    // ✅ ВАЖНО: Отправляем ВСЕГДА, даже если пользователь онлайн
    // Клиент сам решит игнорировать через activeChats
    const pushMessage = {
      to: pushToken,
      sound: 'default',
      title: `📨 ${sender_username}`,
      body: (message || '').slice(0, 100),
      data: {
        type: 'new_message',
        sender_id: sender_id,
        message_id: messageId,
        chat_type: 'personal',
        chat_id: sender_id
      },
      badge: 1,
      priority: 'high',
      ttl: 86400
    };
    
    const tickets = await expo.sendPushNotificationsAsync([pushMessage]);
    console.log(`✅ Push отправлен успешно`);
    console.log(`   Ticket: ${JSON.stringify(tickets[0])}`);
    
  } catch (error) {
    console.error(`❌ Ошибка при отправке push: ${error.message}`);
  }
})();
```

---

## ✅ ИСПРАВЛЕНИЕ 2: Групповые сообщения (Group Messages)

**Файл**: `server.js`  
**Локация**: Конец эндпоинта `POST /api/groups/:groupId/messages` (примерно строка 4680-4800)  
**Проблема**: Фильтр `validMembers` имеет ошибку логики - всегда возвращает `false`

### Замени блок с `validMembers.filter()` на:

```javascript
// 🔔 Отправляем push-уведомления членам группы (которые не в активном чате)
(async () => {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 PUSH-УВЕДОМЛЕНИЕ: Групповое сообщение`);
    console.log(`   Группа: ${groupId} (${groupName})`);
    console.log(`   От: ${sender_username} (${sender_id})`);
    console.log(`${'='.repeat(70)}`);
    
    const membersList = await db.promise().query(
      'SELECT user_id FROM group_members WHERE group_id = ? AND status = "active"',
      [groupId]
    );
    
    if (!membersList[0] || membersList[0].length === 0) {
      console.log(`⚠️  Нет активных членов в группе ${groupId}`);
      return;
    }
    
    const members = membersList[0];
    console.log(`👥 Всего членов: ${members.length}`);
    
    // Фильтруем членов: НЕ отправляем push если:
    // 1. Это отправитель сообщения
    // 2. Пользователь в активном чате этой группы
    const validMembers = members.filter(m => {
      // Не отправляем себе
      if (m.user_id === sender_id) return false;
      
      // Проверяем, открыт ли у пользователя этот чат
      const isInActiveChat = isUserInActiveChat(m.user_id, groupId, 'group');
      
      if (isInActiveChat) {
        console.log(`   ⏭️  ${m.user_id} уже в активном чате - skip push`);
        return false;
      }
      
      return true; // ✅ ОТПРАВЛЯЕМ push для этого пользователя
    });
    
    if (validMembers.length === 0) {
      console.log(`📢 Все члены в активных чатах - push не нужен`);
      return;
    }
    
    console.log(`📤 Отправляем push для ${validMembers.length} пользователей`);
    
    // Отправляем push для каждого валидного члена
    for (const member of validMembers) {
      try {
        const pushToken = await getPushTokenFromDB(member.user_id);
        
        if (!pushToken) {
          console.log(`   ⚠️  Токен не найден для ${member.user_id}`);
          continue;
        }
        
        if (!Expo.isExpoPushToken(pushToken)) {
          console.log(`   ⚠️  Невалидный токен для ${member.user_id}`);
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
            message_id: messageId,
            chat_type: 'group'
          },
          badge: 1,
          priority: 'high',
          ttl: 86400
        };
        
        const tickets = await expo.sendPushNotificationsAsync([pushMessage]);
        console.log(`   ✅ Push для ${member.user_id}`);
        
      } catch (memberError) {
        console.error(`   ❌ Ошибка для ${member.user_id}: ${memberError.message}`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Ошибка при отправке групповых push: ${error.message}`);
  }
})();
```

---

## ✅ ИСПРАВЛЕНИЕ 3: Входящие вызовы (Call Notifications)

**Файл**: `server.js`  
**Локация**: Обработчик `socket.on('call_initiate', ...)` (примерно строка 5200-5350)  
**Проблема**: Не отправляет push если получатель офлайн

### Найди обработчик и добавь в конец (перед закрытием обработчика):

```javascript
// 📞 Отправляем push-уведомление о входящем вызове
(async () => {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 PUSH-УВЕДОМЛЕНИЕ: Входящий вызов`);
    console.log(`   От: ${caller_username} (${caller_id})`);
    console.log(`   Кому: ${receiver_id}`);
    console.log(`   Тип: ${callType || 'audio'}`);
    console.log(`${'='.repeat(70)}`);
    
    const pushToken = await getPushTokenFromDB(receiver_id);
    
    if (!pushToken) {
      console.log(`⚠️  Push-токен не найден`);
      return;
    }
    
    if (!Expo.isExpoPushToken(pushToken)) {
      console.log(`⚠️  Невалидный токен`);
      return;
    }
    
    const pushMessage = {
      to: pushToken,
      sound: 'default',
      title: `📞 ${callType === 'video' ? '📹' : '☎️'} Входящий вызов`,
      body: `${caller_username} вам звонит...`,
      data: {
        type: 'incoming_call',
        caller_id: caller_id,
        caller_name: caller_username,
        call_type: callType || 'audio',
        room_id: room_id || call_id
      },
      badge: 1,
      priority: 'high',
      ttl: 120  // 2 минуты - вызов недолго актуален
    };
    
    const tickets = await expo.sendPushNotificationsAsync([pushMessage]);
    console.log(`✅ Push о вызове отправлен`);
    
  } catch (error) {
    console.error(`❌ Ошибка при отправке push вызова: ${error.message}`);
  }
})();
```

---

## ✅ ИСПРАВЛЕНИЕ 4: Пропущенные вызовы (Missed Call Notifications)

**Файл**: `server.js`  
**Локация**: Когда вызов не принят (поиск `missed_call` или `call_rejected`)  

### Добавь перед логированием:

```javascript
// 📞 Отправляем push о пропущенном вызове
(async () => {
  try {
    const missedCallToken = await getPushTokenFromDB(receiver_id);
    
    if (missedCallToken && Expo.isExpoPushToken(missedCallToken)) {
      const missedCallPush = {
        to: missedCallToken,
        sound: 'default',
        title: `❌ Пропущенный вызов`,
        body: `От ${caller_username}`,
        data: {
          type: 'missed_call',
          caller_id: caller_id,
          caller_name: caller_username,
          call_type: callType || 'audio'
        },
        badge: 1,
        priority: 'high'
      };
      
      await expo.sendPushNotificationsAsync([missedCallPush]);
      console.log(`✅ Push о пропущенном вызове отправлен`);
    }
  } catch (error) {
    console.error(`❌ Ошибка push пропущенного вызова: ${error.message}`);
  }
})();
```

---

## 🐛 ВАЖНЫЕ МОМЕНТЫ

### ⚠️ Что ДОЛЖНО работать:

1. **Функция `getPushTokenFromDB(userId)`** - должна существовать и работать
   - Возвращает промис с токеном или null
   - Запрашивает из таблицы `push_tokens`

2. **Функция `isUserInActiveChat(userId, chatId, chatType)`** - должна работать
   - Проверяет Map `activeChats`
   - Возвращает true если пользователь в открытом чате

3. **Переменная `expo`** - инициализирован `new Expo()`
   - Метод `sendPushNotificationsAsync(messages)` доступен

### ✅ Что нужно проверить:

```bash
# 1. Убедись что токены сохраняются при регистрации:
SELECT * FROM push_tokens LIMIT 5;

# 2. Проверь логи сервера при отправке сообщения:
# Должны быть строки с "PUSH-УВЕДОМЛЕНИЕ" и "✅" или "❌"

# 3. Перезагрузи сервер после изменений:
# Если используешь PM2:
pm2 restart server

# Если запускаешь напрямую:
# Ctrl+C и заново запусти
```

### 🧪 Тестирование:

1. **Отправь сообщение от юзера A к юзеру B (закрытому приложению)**
   - B должен получить push-уведомление
   - В логах сервера должно быть "✅ Push отправлен успешно"

2. **Отправь сообщение в группу, где кто-то офлайн**
   - Офлайн пользователи должны получить push
   - Онлайн пользователи в чате НЕ должны получить push

3. **Позвони пользователю, когда его приложение закрыто**
   - Должен получить push с рингтоном

---

## 📝 ЛОГИРОВАНИЕ

Все изменения имеют подробное логирование. Проверь консоль сервера при тестировании:

```
======================================================================
📱 PUSH-УВЕДОМЛЕНИЕ: Личное сообщение
   Получатель: 123
   От: John (456)
======================================================================
✅ Push отправлен успешно
   Ticket: {"id":"...","status":"ok"}
```

Если видишь **❌** - смотри ошибку и проверь токены в БД.

---

## 🆘 Если что-то не работает:

1. **Проверь, что токены в БД**: `SELECT * FROM push_tokens WHERE user_id = YOUR_ID;`
2. **Проверь логи сервера** - должно быть логирование для каждого push
3. **Убедись что Expo SDK работает** - попробуй отправить тестовый push
4. **Перезагрузи сервер** - изменения вступят в силу только после перезагрузки
5. **Проверь что клиент отправляет токен** - смотри в БД после открытия приложения
