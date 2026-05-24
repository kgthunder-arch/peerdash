import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  oauthProvider: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  /** true when user explicitly chose to skip login */
  isAnonymous: boolean;

  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  skipAuth: () => void;
  /**
   * @param credential - Google access_token or id_token
   * @param mode - "access_token" (from useGoogleLogin) or "id_token" (from GoogleLogin button)
   */
  loginWithGoogle: (credential: string, mode?: "access_token" | "id_token") => Promise<void>;
  loginWithApple: (idToken: string, email?: string) => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,
      isAnonymous: false,

      setUser: (user) => set({ user }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      skipAuth: () => set({ isAnonymous: true }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          error: null,
          isAnonymous: false
        }),

      loginWithGoogle: async (credential: string, mode = "id_token") => {
        set({ isLoading: true, error: null });
        try {
          const body = mode === "access_token"
            ? { idToken: credential }   // server uses tokeninfo endpoint for access tokens too
            : { idToken: credential };

          const response = await axios.post(`${API_URL}/auth/google`, body);
          const { user, accessToken, refreshToken } = response.data;
          set({ user, accessToken, refreshToken, isLoading: false, isAnonymous: false });
        } catch (error: any) {
          set({
            error: error.response?.data?.error || 'Google login failed',
            isLoading: false
          });
          throw error;
        }
      },

      loginWithApple: async (idToken: string, email?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_URL}/auth/apple`, { idToken, email });
          const { user, accessToken, refreshToken } = response.data;
          set({ user, accessToken, refreshToken, isLoading: false, isAnonymous: false });
        } catch (error: any) {
          set({
            error: error.response?.data?.error || 'Apple login failed',
            isLoading: false
          });
          throw error;
        }
      },

      checkAuth: async () => {
        const { accessToken } = useAuthStore.getState();
        if (!accessToken) {
          set({ user: null });
          return;
        }
        try {
          const response = await axios.get(`${API_URL}/auth/user`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          set({ user: response.data.user });
        } catch {
          set({ user: null, accessToken: null, refreshToken: null });
        }
      }
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAnonymous: state.isAnonymous
      })
    }
  )
);

// Axios instance with auth + token refresh
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const { refreshToken } = useAuthStore.getState();
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { accessToken: newToken } = response.data;
          useAuthStore.getState().setTokens(newToken, refreshToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch {
          useAuthStore.getState().logout();
        }
      }
    }
    return Promise.reject(error);
  }
);
