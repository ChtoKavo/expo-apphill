===================================================================
БЫСТРАЯ ЧЕК-ЛИСТ: ЧТО ДОБАВИТЬ НА СЕРВЕРЕ
===================================================================

[ ] ШАГ 1: Создать две переменные в начале server.js
    const userSockets = new Map();
    const socketUsers = new Map();

[ ] ШАГ 2: В io.on('connection', (socket) => {}) добавить:
    
    ✅ Обработчик authenticate_socket
    ✅ Обработчик user_status
    ✅ Обработчик disconnect

[ ] ШАГ 3: Убедиться что:
    ✅ authenticate_socket привязывает socket к user_id
    ✅ disconnect удаляет socket из userSockets
    ✅ Статус меняется ТОЛЬКО при size === 0

[ ] ШАГ 4: Добавить вспомогательные функции:
    ✅ isUserOnline(userId) - проверка
    ✅ getUserSockets(userId) - получить сокеты

[ ] ШАГ 5: Протестировать:
    - Два аккаунта на разных устройствах/браузерах
    - Logout → проверка что статус изменился
    - Повторный login → новый статус

===================================================================
ПОЛНЫЙ КОД ДЛЯ КОПИРОВАНИЯ:
===================================================================

// ⭐ ПЕРЕМЕННЫЕ (в начале файла)
const userSockets = new Map();
const socketUsers = new Map();

// ⭐ В io.on('connection', socket => {
socket.on('authenticate_socket', (data) => {
  const userId = data?.user_id || socket.handshake.query?.user_id;
  if (!userId) return;
  
  console.log(`🔐 Аутентификация: user_id=${userId}, socket_id=${socket.id}`);
  
  const oldUserId = socketUsers.get(socket.id);
  if (oldUserId && oldUserId !== userId) {
    const oldSet = userSockets.get(oldUserId);
    if (oldSet) {
      oldSet.delete(socket.id);
      if (oldSet.size === 0) {
        userSockets.delete(oldUserId);
        io.emit('user_status_changed', {
          user_id: oldUserId,
          is_online: false,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  
  socketUsers.set(socket.id, userId);
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socket.id);
  socket.join(`user_${userId}`);
  
  console.log(`✅ user_id=${userId}: ${userSockets.get(userId).size} сокетов`);
});

socket.on('user_status', (data) => {
  const { user_id, is_online } = data;
  if (!user_id) return;
  socket.broadcast.emit('user_status_changed', {
    user_id, is_online, timestamp: new Date().toISOString()
  });
});

socket.on('disconnect', () => {
  const userId = socketUsers.get(socket.id);
  if (userId) {
    const userSocketSet = userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      if (userSocketSet.size === 0) {
        userSockets.delete(userId);
        io.emit('user_status_changed', {
          user_id: userId,
          is_online: false,
          timestamp: new Date().toISOString()
        });
        console.log(`🔴 user_id=${userId}: offline`);
      } else {
        console.log(`⚡ user_id=${userId}: ${userSocketSet.size} сокетов осталось`);
      }
    }
    socketUsers.delete(socket.id);
  }
});

// ⭐ ФУНКЦИИ (внизу)
function isUserOnline(userId) {
  const sockets = userSockets.get(String(userId));
  return sockets && sockets.size > 0;
}

function getUserSockets(userId) {
  return userSockets.get(String(userId)) || new Set();
}

===================================================================
ВАЖНО:
===================================================================

1. Map<user_id, Set<socket_id>> - ПРАВИЛЬНО
   ❌ Map<socket_id, user_id> - НЕПРАВИЛЬНО

2. При disconnect проверяем:
   if (userSocketSet.size === 0) { отправить offline }

3. Сокет идентифицируется через:
   - query параметр: socket.handshake.query.user_id
   - authenticate_socket event: data.user_id

===================================================================
