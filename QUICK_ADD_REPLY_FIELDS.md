# ⚡ БЫСТРАЯ ИНСТРУКЦИЯ: ДОБАВИТЬ ПОЛЯ В PUSH

**На клиенте**: Все уже готово ✅  
**На сервере**: Нужно добавить 3 поля в 2 местах ⏳

---

## 🎯 ЧТО НУЖНО СДЕЛАТЬ

### Место 1: POST /api/messages

**Найди эту строку в коде:**
```javascript
data: {
  type: 'new_message',
  sender_id: sender_id,
  message_id: messageId,
  chat_type: 'personal',
  chat_id: sender_id
}
```

**Замени на:**
```javascript
data: {
  type: 'new_message',
  sender_id: sender_id,
  sender_name: sender_username,        // ⭐ ДОБАВИТЬ
  message_id: messageId,
  message: (message || '').slice(0, 100),  // ⭐ ДОБАВИТЬ
  chat_type: 'personal',
  chat_id: sender_id
}
```

---

### Место 2: POST /api/groups/:groupId/messages

**Найди эту строку в коде:**
```javascript
data: {
  type: 'new_group_message',
  group_id: groupId,
  sender_id: sender_id,
  message_id: messageId,
  chat_type: 'group'
}
```

**Замени на:**
```javascript
data: {
  type: 'new_group_message',
  group_id: groupId,
  group_name: groupName,               // ⭐ ДОБАВИТЬ
  sender_id: sender_id,
  sender_name: sender_username,        // ⭐ ДОБАВИТЬ
  message_id: messageId,
  message: (message || '').slice(0, 80),  // ⭐ ДОБАВИТЬ
  chat_type: 'group'
}
```

---

## ⏰ ВРЕМЯ

- **Поиск и замена**: 2 минуты
- **Перезагрузка сервера**: 1 минута
- **ИТОГО**: 3 минуты ⚡

---

## ✅ ГОТОВО!

После этого пользователи смогут отвечать на сообщения из уведомлений! 🎉
