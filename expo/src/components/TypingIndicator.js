import React, { useEffect, useRef } from 'react';
import { View, Animated, Text, StyleSheet } from 'react-native';

const TypingIndicator = ({ theme, userName = 'Пользователь', isHeaderMode = false, users = {} }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  console.log(`🎨 TypingIndicator render: users=`, users, `keys=`, Object.keys(users).length);

  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -8,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(300),
        ])
      ).start();
    };

    animateDot(dot1, 0);
    animateDot(dot2, 150);
    animateDot(dot3, 300);

    return () => {
      dot1.setValue(0);
      dot2.setValue(0);
      dot3.setValue(0);
    };
  }, [dot1, dot2, dot3]);

  // Если передан объект users, показываем всех печатающих пользователей
  if (Object.keys(users).length > 0) {
    const typingUsersList = Object.values(users);
    const typingText = typingUsersList.length === 1 
      ? `${typingUsersList[0]} печатает...`
      : typingUsersList.length === 2
      ? `${typingUsersList[0]} и ${typingUsersList[1]} печатают...`
      : `${typingUsersList.length} пользователей печатают...`;

    return (
      <View style={[styles.container, { backgroundColor: theme?.surface || '#f0f0f0' }]}>
        <View style={styles.dotsContainer}>
          <Animated.View
            style={[
              styles.dot,
              { transform: [{ translateY: dot1 }], backgroundColor: theme?.primary || '#667eea' }
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { transform: [{ translateY: dot2 }], backgroundColor: theme?.primary || '#667eea' }
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { transform: [{ translateY: dot3 }], backgroundColor: theme?.primary || '#667eea' }
            ]}
          />
        </View>
        <Text style={[styles.typingText, { color: theme?.textSecondary || '#999' }]}>
          {typingText}
        </Text>
      </View>
    );
  }

  if (isHeaderMode) {
    // Компактная версия для header - без фона, только текст и точки
    return (
      <View style={styles.headerContainer}>
        <Text style={styles.headerTypingText}>печатает</Text>
        <View style={styles.headerDotsContainer}>
          <Animated.View
            style={[
              styles.headerDot,
              { transform: [{ translateY: dot1 }] }
            ]}
          />
          <Animated.View
            style={[
              styles.headerDot,
              { transform: [{ translateY: dot2 }] }
            ]}
          />
          <Animated.View
            style={[
              styles.headerDot,
              { transform: [{ translateY: dot3 }] }
            ]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme?.surface || '#f0f0f0' }]}>
      <View style={styles.dotsContainer}>
        <Animated.View
          style={[
            styles.dot,
            { transform: [{ translateY: dot1 }], backgroundColor: theme?.primary || '#667eea' }
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { transform: [{ translateY: dot2 }], backgroundColor: theme?.primary || '#667eea' }
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { transform: [{ translateY: dot3 }], backgroundColor: theme?.primary || '#667eea' }
          ]}
        />
      </View>
      <Text style={[styles.typingText, { color: theme?.textSecondary || '#999' }]}>
        {userName} печатает...
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    maxWidth: '80%',
    marginVertical: 4,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  headerDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  headerTypingText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '400',
    letterSpacing: 0.2,
  },
});

export default TypingIndicator;
