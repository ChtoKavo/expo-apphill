import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const lightTheme = {
  background: '#FAFBFF',
  surface: '#FFFFFF',
  primary: '#3B82F6',
  secondary: '#EC4899',
  accent: '#8B5CF6',
  text: '#1F2937',
  textSecondary: '#6B7280',
  textLight: '#D1D5DB',
  border: '#E5E7EB',
  success: '#059669',
  error: '#DC2626',
  warning: '#D97706',
  gradient: ['#3B82F6', '#8B5CF6'],
  sentMessage: '#3B82F6',
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3
  },
  inputBackground: '#F3F4F6',
  buttonGradient: ['#3B82F6', '#8B5CF6'],
  softShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1
  }
};

export const darkTheme = {
  background: '#0A0E27',
  surface: '#1A1F3A',
  surfaceLight: '#2D3548',
  primary: '#60A5FA',
  secondary: '#F472B6',
  accent: '#A78BFA',
  text: '#F0F4F8',
  textSecondary: '#CBD5E1',
  textLight: '#94A3B8',
  border: '#334155',
  success: '#10B981',
  error: '#F87171',
  warning: '#FBBF24',
  gradient: ['#60A5FA', '#A78BFA'],
  sentMessage: '#60A5FA',
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5
  },
  inputBackground: '#2D3548',
  buttonGradient: ['#60A5FA', '#A78BFA'],
  softShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3
  }
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(true);
  const [theme, setTheme] = useState(darkTheme);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      if (savedTheme === 'light') {
        setIsDark(false);
        setTheme(lightTheme);
      } else {
        setIsDark(true);
        setTheme(darkTheme);
      }
    } catch (error) {
      console.log('Ошибка загрузки темы:', error);
    }
  };

  const toggleTheme = async () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    setTheme(newIsDark ? darkTheme : lightTheme);
    
    try {
      await AsyncStorage.setItem('theme', newIsDark ? 'dark' : 'light');
    } catch (error) {
      console.log('Ошибка сохранения темы:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};