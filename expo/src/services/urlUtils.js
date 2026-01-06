// services/urlUtils.js
// 🔄 Утилиты для исправления URL медиафайлов

export const normalizeMediaUrl = (url) => {
  if (!url) return url;
  
  // Заменяем неправильный IP на правильный
  if (typeof url === 'string') {
    return url.replace('151.241.228.247', '151.247.196.66');
  }
  
  return url;
};

export const normalizeMessageMediaUrl = (message) => {
  if (!message || !message.media_url) return message;
  
  return {
    ...message,
    media_url: normalizeMediaUrl(message.media_url)
  };
};

export const normalizeMessageList = (messages) => {
  return messages.map(msg => {
    if (msg.type === 'date') return msg;
    return normalizeMessageMediaUrl(msg);
  });
};
