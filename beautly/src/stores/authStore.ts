import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';

interface User {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string;
  locale: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;

  loadToken: () => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<{ isNewUser: boolean; user: User }>;
  updateProfile: (data: { firstName?: string; lastName?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,

  loadToken: async () => {
    try {
      const accessToken = await SecureStore.getItemAsync('accessToken');
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      const userJson = await SecureStore.getItemAsync('user');

      if (accessToken && userJson) {
        const user = JSON.parse(userJson);
        set({ isAuthenticated: true, accessToken, refreshToken, user, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  sendOtp: async (phone: string) => {
    await api.post('/api/auth/send-otp', { phone });
  },

  verifyOtp: async (phone: string, code: string) => {
    const response = await api.post('/api/auth/verify-otp', { phone, code });
    const { accessToken, refreshToken, user, isNewUser } = response.data;

    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);
    await SecureStore.setItemAsync('user', JSON.stringify(user));

    set({ isAuthenticated: true, accessToken, refreshToken, user });
    return { isNewUser, user };
  },

  updateProfile: async (data: { firstName?: string; lastName?: string }) => {
    const response = await api.patch('/api/users/me', data);
    const user = response.data;
    await SecureStore.setItemAsync('user', JSON.stringify(user));
    set({ user });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');
    set({ isAuthenticated: false, user: null, accessToken: null, refreshToken: null });
  },
}));
