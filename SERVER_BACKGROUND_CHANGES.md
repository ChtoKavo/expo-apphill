# Изменения на сервере для функционала смены фона

## 1. Изменения в базе данных (SQL)

```sql
-- Для фона чата (ChatScreen)
ALTER TABLE user_preferences ADD COLUMN chat_background VARCHAR(255) DEFAULT 'default';
ALTER TABLE user_preferences ADD COLUMN chat_background_image LONGTEXT DEFAULT NULL;

-- Для фона списка чатов (ChatsListScreen)
ALTER TABLE user_preferences ADD COLUMN chats_list_background VARCHAR(255) DEFAULT 'default';
ALTER TABLE user_preferences ADD COLUMN chats_list_background_image LONGTEXT DEFAULT NULL;
```

---

## 2. Новые API endpoints

### 2.1. Фон чата (ChatScreen)

#### POST /api/user/chat-background/upload
Загрузка кастомного изображения для фона чата

```javascript
// routes/user.js или routes/preferences.js

router.post('/chat-background/upload', authMiddleware, async (req, res) => {
  try {
    const { image } = req.body; // base64 строка
    const userId = req.user.id;
    
    if (!image) {
      return res.status(400).json({ success: false, error: 'Изображение не предоставлено' });
    }
    
    // Сохраняем изображение и устанавливаем тип фона 'custom'
    await db.query(
      `UPDATE user_preferences 
       SET chat_background = 'custom', chat_background_image = ? 
       WHERE user_id = ?`,
      [image, userId]
    );
    
    res.json({ success: true, chat_background: 'custom' });
  } catch (err) {
    console.error('Ошибка загрузки фона чата:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
```

#### GET /api/user/chat-background/image
Получение кастомного изображения фона чата

```javascript
router.get('/chat-background/image', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [rows] = await db.query(
      'SELECT chat_background_image FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    
    if (rows.length > 0 && rows[0].chat_background_image) {
      res.json({ success: true, image: rows[0].chat_background_image });
    } else {
      res.json({ success: false, error: 'Изображение не найдено' });
    }
  } catch (err) {
    console.error('Ошибка получения фона чата:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
```

#### DELETE /api/user/chat-background
Сброс фона чата на стандартный

```javascript
router.delete('/chat-background', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    await db.query(
      `UPDATE user_preferences 
       SET chat_background = 'default', chat_background_image = NULL 
       WHERE user_id = ?`,
      [userId]
    );
    
    res.json({ success: true, chat_background: 'default' });
  } catch (err) {
    console.error('Ошибка сброса фона чата:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
```

---

### 2.2. Фон списка чатов (ChatsListScreen)

#### POST /api/user/chats-list-background/upload
Загрузка кастомного изображения для фона списка чатов

```javascript
router.post('/chats-list-background/upload', authMiddleware, async (req, res) => {
  try {
    const { image } = req.body;
    const userId = req.user.id;
    
    if (!image) {
      return res.status(400).json({ success: false, error: 'Изображение не предоставлено' });
    }
    
    await db.query(
      `UPDATE user_preferences 
       SET chats_list_background = 'custom', chats_list_background_image = ? 
       WHERE user_id = ?`,
      [image, userId]
    );
    
    res.json({ success: true, chats_list_background: 'custom' });
  } catch (err) {
    console.error('Ошибка загрузки фона списка чатов:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
```

#### GET /api/user/chats-list-background/image
Получение кастомного изображения фона списка чатов

```javascript
router.get('/chats-list-background/image', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [rows] = await db.query(
      'SELECT chats_list_background_image FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    
    if (rows.length > 0 && rows[0].chats_list_background_image) {
      res.json({ success: true, image: rows[0].chats_list_background_image });
    } else {
      res.json({ success: false, error: 'Изображение не найдено' });
    }
  } catch (err) {
    console.error('Ошибка получения фона списка чатов:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
```

#### DELETE /api/user/chats-list-background
Сброс фона списка чатов на стандартный

```javascript
router.delete('/chats-list-background', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    await db.query(
      `UPDATE user_preferences 
       SET chats_list_background = 'default', chats_list_background_image = NULL 
       WHERE user_id = ?`,
      [userId]
    );
    
    res.json({ success: true, chats_list_background: 'default' });
  } catch (err) {
    console.error('Ошибка сброса фона списка чатов:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
```

---

## 3. Обновление существующего endpoint GET /api/user/preferences

Убедитесь, что endpoint возвращает новые поля:

```javascript
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [rows] = await db.query(
      `SELECT 
        chat_background,
        chats_list_background,
        -- другие поля настроек
       FROM user_preferences WHERE user_id = ?`,
      [userId]
    );
    
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      // Создаём запись по умолчанию
      await db.query(
        'INSERT INTO user_preferences (user_id) VALUES (?)',
        [userId]
      );
      res.json({ 
        chat_background: 'default',
        chats_list_background: 'default'
      });
    }
  } catch (err) {
    console.error('Ошибка получения настроек:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
```

---

## 4. Обновление POST /api/user/preferences

Добавьте поддержку сохранения предустановленных фонов:

```javascript
router.post('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { chat_background, chats_list_background } = req.body;
    
    const updates = [];
    const values = [];
    
    if (chat_background) {
      updates.push('chat_background = ?');
      values.push(chat_background);
      // Если выбран предустановленный фон - очищаем кастомное изображение
      if (chat_background !== 'custom') {
        updates.push('chat_background_image = NULL');
      }
    }
    
    if (chats_list_background) {
      updates.push('chats_list_background = ?');
      values.push(chats_list_background);
      if (chats_list_background !== 'custom') {
        updates.push('chats_list_background_image = NULL');
      }
    }
    
    if (updates.length > 0) {
      values.push(userId);
      await db.query(
        `UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?`,
        values
      );
    }
    
    res.json({ success: true, chat_background, chats_list_background });
  } catch (err) {
    console.error('Ошибка сохранения настроек:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
```

---

## 5. Доступные типы фона

Предустановленные:
- `default` - Стандартный (цвет темы)
- `light-blue` - Голубой (#E3F2FD)
- `light-green` - Зелёный (#E8F5E9)
- `light-pink` - Розовый (#FCE4EC)
- `light-purple` - Фиолетовый (#F3E5F5)
- `light-orange` - Оранжевый (#FFF3E0)
- `dark-blue` - Тёмно-синий (#1E3A8A)
- `dark-green` - Тёмно-зелёный (#1B4332)

Кастомный:
- `custom` - Пользовательское изображение (base64 в отдельном поле)

---

## 6. Перезапуск сервера

После внесения изменений:

```bash
pm2 restart appChill-backend
```

---

## 7. Тестирование

1. Проверьте SQL запросы в базе данных
2. Протестируйте загрузку кастомного изображения
3. Протестируйте выбор предустановленного фона
4. Протестируйте сброс фона
5. Проверьте, что настройки сохраняются между сессиями
