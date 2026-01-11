# 📱 ФУНКЦИЯ ОТВЕТА НА СООБЩЕНИЕ ИЗ УВЕДОМЛЕНИЯ

**Статус**: ✅ На клиенте готово  
**Требуется**: Обновить серверный код для поддержки кнопки "Ответить"

---

## 🎯 ЧТО БУДЕТ РАБОТАТЬ

```
1️⃣ Уведомление приходит с кнопкой "Ответить"
      ↓
2️⃣ Пользователь нажимает "Ответить"
      ↓
3️⃣ Открывается окно ввода текста
      ↓
4️⃣ Пользователь пишет ответ и отправляет
      ↓
5️⃣ Сообщение отправляется на сервер
      ↓
6️⃣ Чат открывается с новым сообщением
```

---

## 🔧 НА СЕРВЕРЕ: ДОБАВЬ КНОПКИ К PUSH

### Исправление: Личные сообщения

В эндпоинте `POST /api/messages` замени объект `pushMessage`:

**Было:**
```javascript
const pushMessage = {
  to: pushToken,
  sound: 'default',
  title: `📨 ${sender_username}`,
  body: (message || '').slice(0, 100),
  data: {
    type: 'new_message',
    sender_id: sender_id,
    // ...
  }
};
```

**Должно быть:**
```javascript
const pushMessage = {
  to: pushToken,
  sound: 'default',
  title: `📨 ${sender_username}`,
  body: (message || '').slice(0, 100),
  data: {
    type: 'new_message',
    sender_id: sender_id,
    sender_name: sender_username,
    message_id: messageId,
    message: (message || '').slice(0, 100),
    chat_type: 'personal',
    chat_id: sender_id
  },
  // ⭐ НОВОЕ: Добавляем кнопку "Ответить"
  categoryId: 'message_actions'  // Требует категории на клиенте
};
```

### Исправление: Групповые сообщения

В эндпоинте `POST /api/groups/:groupId/messages` замени объект `pushMessage`:

**Было:**
```javascript
const pushMessage = {
  to: pushToken,
  sound: 'default',
  title: `💬 ${groupName}`,
  body: `${sender_username}: ${(message || '').slice(0, 80)}`,
  data: {
    type: 'new_group_message',
    group_id: groupId,
    // ...
  }
};
```

**Должно быть:**
```javascript
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
    message: (message || '').slice(0, 80),
    chat_type: 'group'
  },
  // ⭐ НОВОЕ: Добавляем кнопку "Ответить"
  categoryId: 'group_message_actions'
};
```

---

## 📱 НА КЛИЕНТЕ: ВСТАВЬ КОМПОНЕНТЫ

### 1️⃣ Обновить App.js или главный экран

```javascript
import useNotificationsWithReply from './src/hooks/useNotificationsWithReply';
import ReplyToNotificationModal from './src/components/ReplyToNotificationModal';

export default function App() {
  const {
    replyModalVisible,
    setReplyModalVisible,
    replyData,
    replyMessage,
    setReplyMessage,
    isSending,
    handleSendReply
  } = useNotificationsWithReply();

  return (
    <NavigationContainer>
      {/* Все остальное */}
      
      {/* Модальное окно ответа на уведомление */}
      <ReplyToNotificationModal
        visible={replyModalVisible}
        onClose={() => {
          setReplyModalVisible(false);
          setReplyMessage('');
        }}
        replyData={replyData}
        replyMessage={replyMessage}
        setReplyMessage={setReplyMessage}
        onSendReply={handleSendReply}
        isSending={isSending}
      />
    </NavigationContainer>
  );
}
```

### 2️⃣ Или обновить useNotifications хук

Если используешь существующий хук `useNotifications`:

```javascript
// В файле src/hooks/useNotifications.js

export default function useNotifications() {
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyData, setReplyData] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // ... остальной код ...

  const handleSendReply = async () => {
    if (!replyMessage.trim()) return;
    
    setIsSending(true);
    try {
      if (replyData?.type === 'new_group_message') {
        await groupAPI.sendMessage(
          parseInt(replyData.group_id),
          replyMessage
        );
      } else {
        await messageAPI.sendMessage(
          parseInt(replyData.sender_id),
          replyMessage
        );
      }

      // Открыть чат
      // ... навигация ...

      // Закрыть модаль
      setReplyModalVisible(false);
      setReplyMessage('');
    } finally {
      setIsSending(false);
    }
  };

  return {
    // ... остальные возвращаемые значения ...
    replyModalVisible,
    setReplyModalVisible,
    replyData,
    setReplyData,
    replyMessage,
    setReplyMessage,
    isSending,
    handleSendReply
  };
}
```

---

## 🎨 ПОДДЕРЖКА КНОПОК НА КЛИЕНТЕ

Добавь категорию уведомлений в notifications.js:

```javascript
// Установка категорий уведомлений с кнопками
if (Platform.OS === 'android') {
  // Android: Просмотр уведомления с действиями
  await Notifications.setNotificationCategoryAsync('message_actions', [
    {
      identifier: 'reply',
      buttonTitle: '✉️ Ответить',
      options: {
        opensAppToForeground: false,
        isAuthenticationRequired: false,
      },
    },
    {
      identifier: 'open',
      buttonTitle: '💬 Открыть',
      options: {
        opensAppToForeground: true,
      },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('group_message_actions', [
    {
      identifier: 'reply',
      buttonTitle: '✉️ Ответить',
      options: {
        opensAppToForeground: false,
        isAuthenticationRequired: false,
      },
    },
    {
      identifier: 'open',
      buttonTitle: '💬 Открыть группу',
      options: {
        opensAppToForeground: true,
      },
    },
  ]);
}
```

---

## 📂 НОВЫЕ ФАЙЛЫ

✅ Созданы на клиенте:

1. **`expo/src/hooks/useNotificationsWithReply.js`** - Хук для управления ответом
2. **`expo/src/components/ReplyToNotificationModal.js`** - UI компонент для ответа

---

## ✅ ЧЕК-ЛИСТ

### На сервере:
- [ ] Добавил кнопку `categoryId` к личным сообщениям
- [ ] Добавил кнопку `categoryId` к групповым сообщениям
- [ ] Добавил поле `sender_name` в data для кнопок
- [ ] Добавил `message` в data для предпросмотра
- [ ] Перезагрузил сервер

### На клиенте:
- [ ] Установил категории уведомлений в notifications.js
- [ ] Импортировал `useNotificationsWithReply` в App.js
- [ ] Добавил `ReplyToNotificationModal` компонент
- [ ] Передал пропсы модальному окну
- [ ] Обновил обработку клика на уведомление

---

## 🧪 ТЕСТИРОВАНИЕ

```
1️⃣ Отправь сообщение от юзера A к юзеру B (B офлайн)
      ↓
2️⃣ B получит push с кнопкой "Ответить" ← смотри это!
      ↓
3️⃣ B нажимает "Ответить"
      ↓
4️⃣ Открывается модальное окно с информацией об A
      ↓
5️⃣ B пишет ответ и нажимает "Ответить"
      ↓
6️⃣ Сообщение отправляется и открывается чат
```

**Ожидаемый результат**: Сообщение видно в чате

---

## 🐛 ЕСЛИ НЕ РАБОТАЕТ

### Кнопка "Ответить" не появляется:
- Проверь что добавил `categoryId` в push
- Проверь что зарегистрировал категорию в notifications.js
- На Android нужно обновить версию expo-notifications

### Ответ не отправляется:
- Проверь логи сервера
- Убедись что messageAPI.sendMessage работает
- Проверь что accessToken есть

### Модальное окно не открывается:
- Проверь что добавил компонент в App.js
- Проверь что передал правильные пропсы
- Посмотри консоль на ошибки

---

## 📝 ПРИМЕЧАНИЯ

- ✅ На клиенте: Функция полностью готова (скопирована)
- ⏳ На сервере: Нужно добавить `categoryId` и дополнительные поля
- 📱 На устройстве: Нужна версия expo >= 48 для поддержки категорий
- 🔐 Безопасность: Ответ проходит стандартную аутентификацию как обычное сообщение

---

**Готово! Теперь пользователи могут отвечать на сообщения прямо из уведомлений!** 🎉
