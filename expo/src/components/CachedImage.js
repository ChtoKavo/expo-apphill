/**
 * Компонент кэшируемого изображения
 * Автоматически загружает и кэширует изображения локально
 */

import React, { useState, useEffect, memo } from 'react';
import { Image, View, ActivityIndicator, StyleSheet } from 'react-native';
import { getCachedMedia, preloadMedia, fixMediaUrl } from '../services/mediaCache';

const CachedImage = memo(({
  source,
  style,
  resizeMode = 'cover',
  onLoad,
  onError,
  showLoader = true,
  loaderColor = '#007AFF',
  placeholderColor = '#E0E0E0',
  ...props
}) => {
  const [cachedUri, setCachedUri] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Получаем URI из source
  const remoteUri = typeof source === 'object' ? source.uri : source;

  useEffect(() => {
    if (!remoteUri) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    // Загружаем из кэша или скачиваем
    getCachedMedia(remoteUri, 'image')
      .then((localUri) => {
        if (isMounted) {
          setCachedUri(localUri);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('CachedImage error:', err);
          // При ошибке используем исправленный URL
          setCachedUri(fixMediaUrl(remoteUri));
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [remoteUri]);

  const handleLoad = (e) => {
    setLoading(false);
    onLoad?.(e);
  };

  const handleError = (e) => {
    setError(true);
    setLoading(false);
    // При ошибке пробуем исправленный URL
    const fixedUri = fixMediaUrl(remoteUri);
    if (cachedUri !== fixedUri) {
      setCachedUri(fixedUri);
      setError(false);
    }
    onError?.(e);
  };

  if (!remoteUri) {
    return (
      <View style={[styles.placeholder, style, { backgroundColor: placeholderColor }]} />
    );
  }

  return (
    <View style={style}>
      {cachedUri && (
        <Image
          {...props}
          source={{ uri: cachedUri }}
          style={[StyleSheet.absoluteFill, { borderRadius: style?.borderRadius }]}
          resizeMode={resizeMode}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {loading && showLoader && (
        <View style={[StyleSheet.absoluteFill, styles.loaderContainer, { backgroundColor: placeholderColor }]}>
          <ActivityIndicator size="small" color={loaderColor} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Функция для предзагрузки изображений
CachedImage.preload = (urls) => {
  urls.forEach(url => {
    if (url) preloadMedia(url, 'image');
  });
};

export default CachedImage;
