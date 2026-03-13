
import { ModelQuota, ModelUsage, ApiKeyInfo } from './types';
import { MODEL_CONFIGS } from '../constants';

const STORAGE_KEY = 'gemini_quota_usage_v2';
const KEY_STORAGE_KEY = 'gemini_api_keys_v2';

class QuotaManager {
  // usage[apiKey][modelId] = ModelUsage
  private usage: Record<string, Record<string, ModelUsage>> = {};
  private apiKeys: ApiKeyInfo[] = [];
  private listeners: (() => void)[] = [];
  private currentConfigs: ModelQuota[] = [...MODEL_CONFIGS];

  constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      const storedUsage = localStorage.getItem(STORAGE_KEY);
      if (storedUsage) {
        this.usage = JSON.parse(storedUsage);
      }
      
      const storedKeys = localStorage.getItem(KEY_STORAGE_KEY);
      if (storedKeys) {
        this.apiKeys = JSON.parse(storedKeys);
      } else {
        // Migration from old format if exists
        const oldKeys = localStorage.getItem('GEMINI_API_KEYS');
        if (oldKeys) {
          const keys = JSON.parse(oldKeys);
          this.apiKeys = keys.map((k: string) => ({
            key: k,
            status: 'active',
            lastUsed: 0,
            cooldownUntil: 0,
            successCount: 0,
            errorCount: 0,
            rpmUsage: 0
          }));
        }
      }
    } catch (e) {
      console.error("Failed to load quota data", e);
    }
    
    this.checkDailyReset();
    this.saveData();
  }

  private checkDailyReset() {
    const today = new Date().toISOString().split('T')[0];
    let changed = false;

    Object.keys(this.usage).forEach(apiKey => {
      Object.keys(this.usage[apiKey]).forEach(modelId => {
        if (this.usage[apiKey][modelId].lastResetDate !== today) {
          this.usage[apiKey][modelId] = {
            requestsToday: 0,
            lastResetDate: today,
            recentRequests: [],
            cooldownUntil: 0,
            isDepleted: false
          };
          changed = true;
        }
      });
    });

    if (changed) this.saveData();
  }

  private saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.usage));
      localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(this.apiKeys));
      this.notifyListeners();
    } catch (e) {
      console.error("Failed to save quota data", e);
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }

  public getApiKeys(): ApiKeyInfo[] {
    return this.apiKeys;
  }

  public setApiKeys(keys: ApiKeyInfo[]) {
    this.apiKeys = keys;
    this.saveData();
  }

  public updateConfigs(newConfigs: ModelQuota[]) {
    this.currentConfigs = newConfigs;
    this.notifyListeners();
  }

  public getConfigs(): ModelQuota[] {
    return this.currentConfigs;
  }

  private getUsage(apiKey: string, modelId: string): ModelUsage {
    if (!this.usage[apiKey]) this.usage[apiKey] = {};
    if (!this.usage[apiKey][modelId]) {
      this.usage[apiKey][modelId] = {
        requestsToday: 0,
        lastResetDate: new Date().toISOString().split('T')[0],
        recentRequests: [],
        cooldownUntil: 0,
        isDepleted: false
      };
    }
    return this.usage[apiKey][modelId];
  }

  public isKeyAvailable(apiKey: string, modelId: string): boolean {
    const usage = this.getUsage(apiKey, modelId);
    const modelConfig = this.currentConfigs.find(m => m.id === modelId);
    const keyInfo = this.apiKeys.find(k => k.key === apiKey);

    if (!modelConfig) return false;
    if (keyInfo && keyInfo.status === 'depleted') return false;
    if (keyInfo && keyInfo.cooldownUntil > Date.now()) return false;

    if (usage.isDepleted) return false;
    if (usage.requestsToday >= modelConfig.rpdLimit) return false;
    if (usage.cooldownUntil > Date.now()) return false;

    const now = Date.now();
    const recent = usage.recentRequests.filter(t => now - t < 60000);
    if (recent.length >= modelConfig.rpmLimit) return false;

    return true;
  }

  public getBestKeyForModel(modelId: string): string | null {
    // Filter available keys
    const availableKeys = this.apiKeys.filter(k => this.isKeyAvailable(k.key, modelId));
    
    if (availableKeys.length === 0) return null;

    // Sort by last used (least recently used first for load balancing)
    return availableKeys.sort((a, b) => a.lastUsed - b.lastUsed)[0].key;
  }

  public recordRequest(apiKey: string, modelId: string) {
    const usage = this.getUsage(apiKey, modelId);
    const keyInfo = this.apiKeys.find(k => k.key === apiKey);

    usage.requestsToday++;
    usage.recentRequests.push(Date.now());
    usage.recentRequests = usage.recentRequests.filter(t => Date.now() - t < 60000);

    if (keyInfo) {
      keyInfo.lastUsed = Date.now();
      keyInfo.successCount++;
      keyInfo.status = 'active';
      keyInfo.rpmUsage = usage.recentRequests.length;
    }

    this.saveData();
  }

  public recordError(apiKey: string, modelId: string, errorMsg: string, status: number) {
    const usage = this.getUsage(apiKey, modelId);
    const keyInfo = this.apiKeys.find(k => k.key === apiKey);
    
    const isQuotaError = status === 429 || 
                         errorMsg.includes("429") || 
                         errorMsg.includes("quota") || 
                         errorMsg.includes("Resource has been exhausted") ||
                         errorMsg.includes("rate limit");

    if (keyInfo) {
      keyInfo.errorCount++;
      keyInfo.errorMessage = errorMsg;
      
      if (isQuotaError) {
        if (errorMsg.includes("quota") || errorMsg.includes("Resource has been exhausted")) {
          keyInfo.status = 'depleted';
          usage.isDepleted = true;
        } else {
          keyInfo.status = 'cooldown';
          keyInfo.cooldownUntil = Date.now() + 60000;
          usage.cooldownUntil = Date.now() + 60000;
        }
      } else {
        keyInfo.status = 'error';
      }
    }

    this.saveData();
  }

  public reset() {
    this.usage = {};
    this.apiKeys = this.apiKeys.map(k => ({
      ...k,
      status: 'active',
      cooldownUntil: 0,
      successCount: 0,
      errorCount: 0,
      rpmUsage: 0
    }));
    this.saveData();
  }
}

export const quotaManager = new QuotaManager();
