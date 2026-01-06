import { useEffect } from 'react';
import { AppState } from 'react-native';
import { setUserOffline, initializeOnlineStatus } from '../services/onlineStatus';

export default function useAppState() {
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        setUserOffline();
      } else if (nextAppState === 'active') {
        initializeOnlineStatus();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, []);
}