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
  background: '#0f141e',
  surface: '#FFFFFF',
  primary: '#FFA705',
  secondary: '#FF8C00',
  accent: '#FF7B00',
  text: '#2D3436',
  textSecondary: '#636E72',
  textLight: '#B2BEC3',
  border: '#FFE0C0',
  success: '#00B894',
  error: '#FF7675',
  warning: '#FDCB6E',
  gradient: ['#FFA705', '#FF8C00'],
  sentMessage: '#FFA705',
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5
  },
  inputBackground: '#FFFAF5',
  buttonGradient: ['#FFA705', '#FF8C00'],
  softShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  }
};

export const darkTheme = {
  background: '#0a1428',
  surface: '#1a2e4a',
  surfaceLight: '#233a54',
  primary: '#FF9500',
  secondary: '#FFB347',
  accent: '#FFA07A',
  text: '#ffffff',
  textSecondary: '#c5d0e0',
  textLight: '#8a95aa',
  border: '#2a4a6a',
  success: '#00B894',
  error: '#FF7675',
  warning: '#FDCB6E',
  gradient: ['#FF9500', '#FFB347'],
  sentMessage: '#1a3a5a',
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6
  },
  inputBackground: '#1a3a5a',
  buttonGradient: ['#FF9500', '#FFB347'],
  softShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
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
      if (savedTheme === 'dark') {
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