# 🚀 Оптимизация видеокружков на сервере

## Проблема
Видеокружки долго загружаются и воспроизводятся с задержкой.

---

## 📦 1. Сжатие видео при загрузке (ОБЯЗАТЕЛЬНО)

### Установите FFmpeg на сервер:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### Добавьте в server.js обработку видео после загрузки:

```javascript
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Функция сжатия видеокружка
const compressVideoCircle = (inputPath, callback) => {
  const outputPath = inputPath.replace('.mp4', '_compressed.mp4');
  
  // Оптимальные настройки для видеокружков:
  // - Разрешение: 480x480 (достаточно для кружка)
  // - Битрейт: 500k (хорошее качество при малом размере)
  // - Кодек: libx264 (совместимость)
  // - Preset: fast (быстрое сжатие)
  // - CRF: 28 (баланс качество/размер)
  
  const ffmpegCommand = `ffmpeg -i "${inputPath}" \
    -vf "scale=480:480:force_original_aspect_ratio=increase,crop=480:480" \
    -c:v libx264 \
    -preset fast \
    -crf 28 \
    -b:v 500k \
    -maxrate 600k \
    -bufsize 1200k \
    -c:a aac \
    -b:a 64k \
    -movflags +faststart \
    -y "${outputPath}"`;
  
  exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Ошибка сжатия видео:', error);
      callback(inputPath); // Возвращаем оригинал при ошибке
    } else {
      // Удаляем оригинал, переименовываем сжатое
      fs.unlink(inputPath, () => {
        fs.rename(outputPath, inputPath, () => {
          console.log('✅ Видеокружок сжат:', inputPath);
          callback(inputPath);
        });
      });
    }
  });
};
```

### Используйте при загрузке:

```javascript
// В роуте загрузки медиа
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const isVideoCircle = req.body.is_circle === 'true' || req.body.is_circle === '1';
    
    if (isVideoCircle && file.mimetype.startsWith('video/')) {
      // Сжимаем видеокружок
      compressVideoCircle(file.path, (compressedPath) => {
        const fileUrl = `${BASE_URL}/uploads/${path.basename(compressedPath)}`;
        res.json({ 
          success: true, 
          url: fileUrl,
          compressed: true 
        });
      });
    } else {
      // Обычная загрузка
      const fileUrl = `${BASE_URL}/uploads/${file.filename}`;
      res.json({ success: true, url: fileUrl });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});
```

---

## 📡 2. HTTP Range Requests (Стриминг)

### Добавьте поддержку частичной загрузки видео:

```javascript
// Роут для стриминга видео
app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  
  // Проверяем существование файла
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Файл не найден');
  }
  
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  // Определяем тип контента
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  if (range) {
    // Частичная загрузка (стриминг)
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = (end - start) + 1;
    
    const file = fs.createReadStream(filePath, { start, end });
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000', // Кэш на год
    });
    
    file.pipe(res);
  } else {
    // Полная загрузка
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
    });
    
    fs.createReadStream(filePath).pipe(res);
  }
});
```

---

## ⚡ 3. Заголовки кэширования

### Добавьте в Express middleware:

```javascript
// Кэширование статических файлов
app.use('/uploads', express.static('uploads', {
  maxAge: '1y', // Кэш на год
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4') || path.endsWith('.webm')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));
```

---

## 🗜️ 4. Gzip/Brotli сжатие (для текста и API)

```javascript
const compression = require('compression');

// Добавьте в начало после создания app
app.use(compression({
  filter: (req, res) => {
    // Не сжимаем видео (уже сжато)
    if (req.path.includes('/uploads/')) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Уровень сжатия
}));
```

### Установите:
```bash
npm install compression
```

---

## 📊 5. Ограничение размера видеокружков

### На сервере при загрузке:

```javascript
const MAX_VIDEO_CIRCLE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_CIRCLE_DURATION = 60; // 60 секунд

// Middleware для проверки размера
const checkVideoCircleSize = (req, res, next) => {
  if (req.file && req.body.is_circle) {
    if (req.file.size > MAX_VIDEO_CIRCLE_SIZE) {
      fs.unlinkSync(req.file.path); // Удаляем файл
      return res.status(400).json({ 
        error: 'Видеокружок слишком большой. Максимум 10MB' 
      });
    }
  }
  next();
};
```

---

## 🔧 6. Nginx конфигурация (если используете)

```nginx
# /etc/nginx/sites-available/your-app

server {
    listen 80;
    server_name your-domain.com;
    
    # Увеличенные буферы для видео
    client_max_body_size 50M;
    
    # Кэширование видео
    location /uploads/ {
        alias /path/to/your/uploads/;
        
        # Поддержка Range requests
        add_header Accept-Ranges bytes;
        
        # Агрессивное кэширование
        expires 1y;
        add_header Cache-Control "public, immutable";
        
        # Оптимизация отдачи
        sendfile on;
        tcp_nopush on;
        tcp_nodelay on;
        
        # Gzip для текста, но не для видео
        gzip off;
    }
    
    # Проксирование API
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        
        # Увеличенные таймауты для загрузки
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

---

## 📱 7. Оптимизация на клиенте (уже сделано)

✅ Убраны блокирующие await  
✅ Оптимизировано обновление прогресса  
✅ Интервал обновления 250мс  

---

## 🎯 Рекомендуемый порядок внедрения

1. **СНАЧАЛА**: FFmpeg сжатие — даёт максимальный эффект
2. **ПОТОМ**: Range requests — для быстрого старта воспроизведения
3. **ДАЛЕЕ**: Кэширование — чтобы не загружать повторно
4. **ОПЦИОНАЛЬНО**: Nginx — если нужна высокая нагрузка

---

## 📈 Ожидаемый результат

| До оптимизации | После оптимизации |
|----------------|-------------------|
| Размер: 5-20 MB | Размер: 0.5-2 MB |
| Загрузка: 3-10 сек | Загрузка: 0.5-2 сек |
| Буферизация | Мгновенный старт |

---

## 🧪 Тестирование

После внедрения проверьте:

```bash
# Проверка Range requests
curl -I -H "Range: bytes=0-1023" http://your-server.com/uploads/video.mp4

# Должен вернуть:
# HTTP/1.1 206 Partial Content
# Content-Range: bytes 0-1023/...
# Accept-Ranges: bytes
```

```bash
# Проверка кэширования
curl -I http://your-server.com/uploads/video.mp4

# Должен содержать:
# Cache-Control: public, max-age=31536000
```
