# 🎬 Исправление видеокружков на сервере

## Ошибка
```
API Error: {"error": "Ошибка сервера"} (500) при POST /messages
```

## Причина
Поле `is_circle` отсутствует в таблице `messages` в базе данных MySQL.

---

## 🔧 РЕШЕНИЕ: Выполните эти SQL команды на сервере

### Подключитесь к MySQL и выполните:

```sql
-- 1. Добавить поле is_circle в таблицу messages
ALTER TABLE messages ADD COLUMN is_circle BOOLEAN DEFAULT FALSE;

-- 2. Добавить поле is_circle в таблицу group_messages  
ALTER TABLE group_messages ADD COLUMN is_circle BOOLEAN DEFAULT FALSE;

-- 3. Проверить что поля добавлены
DESCRIBE messages;
DESCRIBE group_messages;
```

---

## 📋 Альтернатива: Добавить в server.js (в начало, после подключения к БД)

Найдите место где создаются таблицы и добавьте:

```javascript
// 🎬 ДОБАВЛЯЕМ ПОЛЕ ДЛЯ ВИДЕОКРУЖКОВ (принудительно)
db.query(`ALTER TABLE messages ADD COLUMN is_circle BOOLEAN DEFAULT FALSE`, (err) => {
  if (err && !err.message.includes('Duplicate column')) {
    console.error('❌ Ошибка добавления is_circle в messages:', err.message);
  } else {
    console.log('✅ Поле is_circle в messages готово');
  }
});

db.query(`ALTER TABLE group_messages ADD COLUMN is_circle BOOLEAN DEFAULT FALSE`, (err) => {
  if (err && !err.message.includes('Duplicate column')) {
    console.error('❌ Ошибка добавления is_circle в group_messages:', err.message);
  } else {
    console.log('✅ Поле is_circle в group_messages готово');
  }
});
```

---

## 🔄 После применения изменений

1. **Перезапустите сервер:**
```bash
# Если используете pm2:
pm2 restart all

# Или напрямую:
node server.js
```

2. **Проверьте логи** - должно появиться:
```
✅ Поле is_circle в messages готово
✅ Поле is_circle в group_messages готово
```

3. **Попробуйте отправить видеокружок снова**

---

## ⚠️ Если ошибка повторяется

Проверьте что в INSERT запросе правильное количество параметров:

```javascript
// В /api/messages должно быть 9 параметров:
db.query(
  'INSERT INTO messages (sender_id, receiver_id, message, reply_to, media_type, media_url, duration, caption, is_circle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  [sender_id, receiver_id, message, reply_to || null, finalMediaType, media_url || null, duration || null, caption || null, isVideoCircle ? 1 : 0],
  ...
);
```

---

## 📝 Дополнительно: Проверка структуры таблицы

Выполните на сервере MySQL:

```sql
SHOW COLUMNS FROM messages;
```

Должны быть поля:
- id
- sender_id
- receiver_id
- message
- reply_to
- media_type
- media_url
- duration
- caption
- is_circle ← ЭТО ДОЛЖНО БЫТЬ
- is_read
- is_edited
- created_at
