import { create } from 'zustand';
import { apiClient } from './auth';

interface SubscriptionTier {
  tier: 'free' | 'pro' | 'enterprise';
  name: string;
  monthlyQuota: number;
  maxFileSize: number;
  parallelTransfers: number;
  groupTransfers: boolean;
  priorityRelay: boolean;
  price: number;
}

interface SubscriptionState {
  tier: 'free' | 'pro' | 'enterprise';
  quotaUsedBytes: number;
  quotaLimitBytes: number;
  currentPeriodEnd: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSubscription: () => Promise<void>;
  getAvailableTiers: () => SubscriptionTier[];
  canTransfer: (fileSize: number) => boolean;
  getRemainingQuota: () => number;
  getQuotaPercentage: () => number;
  startCheckout: (tier: 'pro' | 'enterprise') => Promise<string>;
}

const TIERS: Record<'free' | 'pro' | 'enterprise', SubscriptionTier> = {
  free: {
    tier: 'free',
    name: 'Free',
    monthlyQuota: 536870912, // 500MB
    maxFileSize: 104857600, // 100MB per file
    parallelTransfers: 1,
    groupTransfers: false,
    priorityRelay: false,
    price: 0
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    monthlyQuota: 53687091200, // 50GB
    maxFileSize: 1099511627776, // 1TB per file
    parallelTransfers: 5,
    groupTransfers: true,
    priorityRelay: true,
    price: 4.99
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    monthlyQuota: Infinity,
    maxFileSize: Infinity,
    parallelTransfers: Infinity,
    groupTransfers: true,
    priorityRelay: true,
    price: 0 // Custom pricing
  }
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  quotaUsedBytes: 0,
  quotaLimitBytes: 536870912,
  currentPeriodEnd: null,
  isLoading: false,
  error: null,

  fetchSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/subscription');
      const { subscription } = response.data;

      set({
        tier: subscription.tier,
        quotaUsedBytes: subscription.quotaUsedBytes,
        quotaLimitBytes: subscription.quotaLimitBytes,
        currentPeriodEnd: subscription.currentPeriodEnd,
        isLoading: false
      });
    } catch (error: any) {
      set({
        error: error.message,
        isLoading: false
      });
    }
  },

  getAvailableTiers: () => {
    return Object.values(TIERS);
  },

  canTransfer: (fileSize: number) => {
    const state = get();
    const tier = TIERS[state.tier];

    // Check file size limit
    if (fileSize > tier.maxFileSize) {
      return false;
    }

    // Check quota
    const remaining = state.quotaLimitBytes - state.quotaUsedBytes;
    return fileSize <= remaining;
  },

  getRemainingQuota: () => {
    const state = get();
    return state.quotaLimitBytes - state.quotaUsedBytes;
  },

  getQuotaPercentage: () => {
    const state = get();
    if (state.quotaLimitBytes === 0) return 0;
    return (state.quotaUsedBytes / state.quotaLimitBytes) * 100;
  },

  startCheckout: async (tier: 'pro' | 'enterprise') => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/subscription/checkout', {
        tier
      });

      const { session } = response.data;
      set({ isLoading: false });
      return session.url;
    } catch (error: any) {
      set({
        error: error.message,
        isLoading: false
      });
      throw error;
    }
  }
}));

export { TIERS };
